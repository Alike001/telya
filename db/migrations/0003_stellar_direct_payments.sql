-- Durable Testnet evidence for passkey-authorized Stellar USDC transfers.
-- Canonical authenticated product payments continue to live in payments and
-- payment_events; these rows bind the public Smart Account Kit relayer request
-- to its finalized on-chain outcome without storing a passkey or sponsor key.

ALTER TABLE stellar_relayer_requests
  ADD COLUMN operation_kind text NOT NULL DEFAULT 'deployment'
    CHECK (operation_kind IN ('deployment', 'usdc_transfer')),
  ADD COLUMN token_contract text,
  ADD COLUMN sender_address text,
  ADD COLUMN recipient_address text,
  ADD COLUMN expected_amount_atomic numeric(38, 0),
  ADD COLUMN submitted_transaction_hash text CHECK (
    submitted_transaction_hash IS NULL OR submitted_transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD COLUMN submitted_ledger integer,
  ADD COLUMN transaction_ledger integer,
  ADD COLUMN verified_recipient_address text,
  ADD COLUMN verified_amount_atomic numeric(38, 0),
  ADD COLUMN verified_at timestamptz,
  ADD CHECK (
    operation_kind = 'deployment'
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

CREATE TABLE stellar_direct_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_hash text NOT NULL REFERENCES stellar_relayer_requests(request_hash),
  event_key text NOT NULL,
  stage text NOT NULL CHECK (stage IN (
    'authorization', 'submission', 'destination_confirmation',
    'recipient_verification', 'completion', 'failure'
  )),
  status text NOT NULL CHECK (status IN (
    'authorized', 'submitted', 'destination_confirmed',
    'recipient_verified', 'completed', 'failed'
  )),
  transaction_hash text CHECK (
    transaction_hash IS NULL OR transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  public_message text NOT NULL,
  error_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (request_hash, event_key)
);

CREATE INDEX stellar_direct_payment_events_request_created_idx
  ON stellar_direct_payment_events(request_hash, occurred_at, id);

CREATE INDEX stellar_relayer_requests_transaction_hash_idx
  ON stellar_relayer_requests(transaction_hash)
  WHERE transaction_hash IS NOT NULL;

CREATE UNIQUE INDEX stellar_relayer_requests_submitted_transaction_hash_idx
  ON stellar_relayer_requests(submitted_transaction_hash)
  WHERE submitted_transaction_hash IS NOT NULL;
