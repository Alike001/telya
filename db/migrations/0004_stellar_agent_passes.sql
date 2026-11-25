-- Production-shaped public Testnet evidence for USDC-only Agent Passes. The
-- private agent key remains ephemeral browser memory; this table stores only
-- public rule metadata and verified transaction references.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'stellar_relayer_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%operation_kind%'
  LOOP
    EXECUTE format(
      'ALTER TABLE stellar_relayer_requests DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE stellar_relayer_requests
  ADD CONSTRAINT stellar_relayer_requests_operation_kind_check CHECK (
    operation_kind IN (
      'deployment', 'usdc_transfer', 'agent_pass_create', 'agent_pass_revoke'
    )
  ),
  ADD COLUMN authorization_kind text CHECK (
    authorization_kind IS NULL OR authorization_kind IN ('owner', 'agent')
  ),
  ADD COLUMN context_rule_id integer CHECK (
    context_rule_id IS NULL OR context_rule_id >= 0
  ),
  ADD COLUMN signer_address text,
  ADD CHECK (
    operation_kind <> 'usdc_transfer'
    OR (
      token_contract IS NOT NULL
      AND sender_address IS NOT NULL
      AND recipient_address IS NOT NULL
      AND expected_amount_atomic > 0
    )
  ),
  ADD CHECK (
    verified_at IS NULL
    OR (
      operation_kind = 'usdc_transfer'
      AND transaction_hash IS NOT NULL
      AND transaction_ledger IS NOT NULL
      AND verified_recipient_address = recipient_address
      AND verified_amount_atomic = expected_amount_atomic
    )
  );

CREATE TABLE stellar_agent_passes (
  smart_account text NOT NULL,
  context_rule_id integer NOT NULL CHECK (context_rule_id > 0),
  agent_address text NOT NULL,
  agent_public_key text NOT NULL CHECK (agent_public_key ~ '^[0-9a-f]{64}$'),
  token_contract text NOT NULL,
  spending_limit_policy text NOT NULL,
  spending_limit_atomic numeric(38, 0) NOT NULL CHECK (spending_limit_atomic > 0),
  spent_amount_atomic numeric(38, 0) NOT NULL DEFAULT 0
    CHECK (spent_amount_atomic >= 0 AND spent_amount_atomic <= spending_limit_atomic),
  period_ledgers integer NOT NULL CHECK (period_ledgers > 0),
  valid_until_ledger integer NOT NULL CHECK (valid_until_ledger > 0),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  create_request_hash text NOT NULL REFERENCES stellar_relayer_requests(request_hash),
  create_transaction_hash text NOT NULL UNIQUE
    CHECK (create_transaction_hash ~ '^[0-9a-f]{64}$'),
  revoke_request_hash text REFERENCES stellar_relayer_requests(request_hash),
  revoke_transaction_hash text UNIQUE
    CHECK (revoke_transaction_hash IS NULL OR revoke_transaction_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (smart_account, context_rule_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK ((status = 'revoked') = (revoke_transaction_hash IS NOT NULL))
);

CREATE INDEX stellar_agent_passes_agent_status_idx
  ON stellar_agent_passes(agent_address, status);

CREATE TABLE stellar_agent_pass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_account text NOT NULL,
  context_rule_id integer NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'spent', 'revoked')),
  amount_atomic numeric(38, 0),
  cumulative_spent_atomic numeric(38, 0),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (smart_account, context_rule_id)
    REFERENCES stellar_agent_passes(smart_account, context_rule_id),
  UNIQUE (smart_account, context_rule_id, event_key)
);

CREATE INDEX stellar_agent_pass_events_pass_created_idx
  ON stellar_agent_pass_events(smart_account, context_rule_id, occurred_at);
