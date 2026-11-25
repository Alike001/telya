-- Durable Stellar-side CCTP evidence. Circle attestation coordination remains
-- owned by Issue #16; this table binds its message to the Stellar source or
-- destination transaction and the canonical payment timeline.

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
      'deployment', 'usdc_transfer', 'agent_pass_create', 'agent_pass_revoke',
      'cctp_burn'
    )
  ),
  ADD COLUMN cctp_destination_domain integer,
  ADD COLUMN cctp_max_fee_atomic numeric(38, 0),
  ADD CHECK (
    operation_kind <> 'cctp_burn' OR (
      token_contract IS NOT NULL
      AND sender_address IS NOT NULL
      AND recipient_address ~ '^0x[0-9a-f]{40}$'
      AND expected_amount_atomic > 0
      AND cctp_destination_domain = 6
      AND cctp_max_fee_atomic >= 0
      AND cctp_max_fee_atomic < expected_amount_atomic
      AND authorization_kind = 'owner'
      AND context_rule_id = 0
    )
  );

CREATE TABLE stellar_cctp_operations (
  payment_id uuid PRIMARY KEY REFERENCES payments(id),
  route_id text NOT NULL CHECK (route_id IN ('base_to_stellar', 'stellar_to_base')),
  status text NOT NULL CHECK (status IN (
    'source_confirmed', 'awaiting_attestation', 'destination_submitting',
    'destination_submitted', 'destination_confirmed', 'recipient_verified',
    'completed', 'failed'
  )),
  source_transaction_hash text CHECK (
    source_transaction_hash IS NULL OR source_transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  source_ledger integer CHECK (source_ledger IS NULL OR source_ledger > 0),
  circle_message_hash text CHECK (
    circle_message_hash IS NULL OR circle_message_hash ~ '^[0-9a-f]{64}$'
  ),
  circle_attestation_hash text CHECK (
    circle_attestation_hash IS NULL OR circle_attestation_hash ~ '^[0-9a-f]{64}$'
  ),
  destination_transaction_hash text CHECK (
    destination_transaction_hash IS NULL
    OR destination_transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  destination_ledger integer CHECK (
    destination_ledger IS NULL OR destination_ledger > 0
  ),
  expected_recipient_address text NOT NULL,
  expected_amount_atomic numeric(38, 0) NOT NULL CHECK (expected_amount_atomic > 0),
  verified_recipient_address text,
  verified_amount_atomic numeric(38, 0),
  verified_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circle_message_hash),
  UNIQUE (destination_transaction_hash),
  CHECK (
    verified_at IS NULL OR (
      destination_transaction_hash IS NOT NULL
      AND destination_ledger IS NOT NULL
      AND verified_recipient_address = expected_recipient_address
      AND verified_amount_atomic = expected_amount_atomic
    )
  ),
  CHECK (
    status <> 'completed' OR (
      verified_at IS NOT NULL
      AND failure_code IS NULL
    )
  )
);

CREATE INDEX stellar_cctp_operations_status_updated_idx
  ON stellar_cctp_operations(status, updated_at);
