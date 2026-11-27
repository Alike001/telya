-- Durable Base and Circle evidence. The Stellar settlement record remains in
-- stellar_cctp_operations; this record binds Base hashes and Circle API
-- results to the same payment and gives Base destination execution a lease.

CREATE TABLE base_cctp_operations (
  payment_id uuid PRIMARY KEY REFERENCES payments(id),
  route_id text NOT NULL CHECK (route_id IN (
    'base_to_base', 'base_to_stellar', 'stellar_to_base'
  )),
  status text NOT NULL CHECK (status IN (
    'authorized', 'source_submitted', 'source_confirmed', 'awaiting_attestation',
    'destination_prepared', 'destination_submitted', 'destination_confirmed',
    'recipient_verified', 'completed', 'failed'
  )),
  source_transaction_hash text,
  destination_transaction_hash text,
  circle_message_hash text CHECK (
    circle_message_hash IS NULL OR circle_message_hash ~ '^[0-9a-f]{64}$'
  ),
  circle_attestation_hash text CHECK (
    circle_attestation_hash IS NULL OR circle_attestation_hash ~ '^[0-9a-f]{64}$'
  ),
  circle_message text,
  circle_attestation text,
  burn_amount_atomic numeric(38, 0),
  max_fee_atomic numeric(38, 0),
  expected_recipient_address text NOT NULL,
  expected_amount_atomic numeric(38, 0) NOT NULL CHECK (expected_amount_atomic > 0),
  verified_recipient_address text,
  verified_amount_atomic numeric(38, 0),
  verified_at timestamptz,
  submission_lease_id uuid,
  submission_lease_expires_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_transaction_hash),
  UNIQUE (destination_transaction_hash),
  UNIQUE (circle_message_hash),
  CHECK (
    (circle_message IS NULL) = (circle_message_hash IS NULL)
    AND (circle_attestation IS NULL) = (circle_attestation_hash IS NULL)
  ),
  CHECK (
    source_transaction_hash IS NULL
    OR (route_id = 'stellar_to_base' AND source_transaction_hash ~ '^[0-9a-f]{64}$')
    OR (route_id IN ('base_to_base', 'base_to_stellar')
      AND source_transaction_hash ~ '^0x[0-9a-f]{64}$')
  ),
  CHECK (
    destination_transaction_hash IS NULL
    OR (route_id = 'base_to_stellar' AND destination_transaction_hash ~ '^[0-9a-f]{64}$')
    OR (route_id IN ('base_to_base', 'stellar_to_base')
      AND destination_transaction_hash ~ '^0x[0-9a-f]{64}$')
  ),
  CHECK (
    (burn_amount_atomic IS NULL AND max_fee_atomic IS NULL)
    OR (
      route_id IN ('base_to_stellar', 'stellar_to_base')
      AND burn_amount_atomic > 0
      AND max_fee_atomic >= 0
      AND max_fee_atomic < burn_amount_atomic
    )
  ),
  CHECK (
    (submission_lease_id IS NULL AND submission_lease_expires_at IS NULL)
    OR (submission_lease_id IS NOT NULL AND submission_lease_expires_at IS NOT NULL)
  ),
  CHECK (
    verified_at IS NULL OR (
      destination_transaction_hash IS NOT NULL
      AND verified_recipient_address IS NOT NULL
      AND CASE
        WHEN route_id IN ('base_to_base', 'stellar_to_base')
          THEN lower(verified_recipient_address) = lower(expected_recipient_address)
        ELSE verified_recipient_address = expected_recipient_address
      END
      AND verified_amount_atomic = expected_amount_atomic
    )
  ),
  CHECK (status <> 'completed' OR verified_at IS NOT NULL)
);

CREATE INDEX base_cctp_operations_status_updated_idx
  ON base_cctp_operations(status, updated_at);
