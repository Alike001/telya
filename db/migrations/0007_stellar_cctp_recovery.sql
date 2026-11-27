-- Persist the exact signed Stellar destination transaction before broadcast so
-- a crash can only replay the same transaction hash, never create a second mint.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'stellar_cctp_operations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%destination_submitting%'
  LOOP
    EXECUTE format(
      'ALTER TABLE stellar_cctp_operations DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE stellar_cctp_operations
  ADD COLUMN destination_envelope_xdr text,
  ADD COLUMN submission_lease_id uuid,
  ADD COLUMN submission_lease_expires_at timestamptz,
  ADD CONSTRAINT stellar_cctp_operations_status_check CHECK (status IN (
    'source_confirmed', 'awaiting_attestation', 'destination_submitting',
    'destination_prepared', 'destination_submitted', 'destination_confirmed',
    'recipient_verified', 'completed', 'failed'
  )),
  ADD CONSTRAINT stellar_cctp_operations_prepared_evidence_check CHECK (
    destination_envelope_xdr IS NULL OR destination_transaction_hash IS NOT NULL
  ),
  ADD CONSTRAINT stellar_cctp_operations_prepared_status_check CHECK (
    status <> 'destination_prepared' OR (
      destination_transaction_hash IS NOT NULL
      AND destination_envelope_xdr IS NOT NULL
    )
  ),
  ADD CONSTRAINT stellar_cctp_operations_lease_check CHECK (
    (submission_lease_id IS NULL AND submission_lease_expires_at IS NULL)
    OR (submission_lease_id IS NOT NULL AND submission_lease_expires_at IS NOT NULL)
  );

-- Rows created by the old submit-before-persist flow cannot be retried safely:
-- the absent hash does not prove the transaction was never broadcast.
UPDATE stellar_cctp_operations
SET status = 'failed',
  failure_code = 'UNRECOVERABLE_DESTINATION_SUBMISSION',
  updated_at = now()
WHERE status = 'destination_submitting'
  AND destination_transaction_hash IS NULL;

UPDATE payments p
SET status = 'failed',
  failure_code = 'UNRECOVERABLE_DESTINATION_SUBMISSION',
  failure_message = 'The prior Stellar submission cannot be retried safely without its transaction hash.',
  updated_at = now()
FROM stellar_cctp_operations o
WHERE o.payment_id = p.id
  AND o.failure_code = 'UNRECOVERABLE_DESTINATION_SUBMISSION';
