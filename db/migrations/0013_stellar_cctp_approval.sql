-- A separate, short-lived, payment-bound authorization for Circle's Stellar
-- TokenMessenger allowance. Approval is never a payment burn.
ALTER TABLE stellar_payment_execution_sessions
  ADD COLUMN purpose text NOT NULL DEFAULT 'payment'
    CHECK (purpose IN ('payment', 'cctp_approval'));

ALTER TABLE stellar_relayer_requests
  DROP CONSTRAINT stellar_relayer_requests_operation_kind_check;

ALTER TABLE stellar_relayer_requests
  ADD CONSTRAINT stellar_relayer_requests_operation_kind_check CHECK (
    operation_kind IN (
      'deployment', 'usdc_transfer', 'agent_pass_create', 'agent_pass_revoke',
      'cctp_burn', 'cctp_approval'
    )
  ),
  ADD COLUMN approval_payment_id uuid REFERENCES payments(id),
  ADD COLUMN approval_expiration_ledger integer CHECK (approval_expiration_ledger > 0),
  ADD CONSTRAINT stellar_relayer_cctp_approval_shape CHECK (
    operation_kind <> 'cctp_approval' OR (
      approval_payment_id IS NOT NULL
      AND token_contract IS NOT NULL
      AND sender_address IS NOT NULL
      AND recipient_address IS NOT NULL
      AND expected_amount_atomic > 0
      AND approval_expiration_ledger > 0
      AND authorization_kind = 'owner'
      AND context_rule_id = 0
      AND payment_id IS NULL
    )
  );

CREATE INDEX stellar_cctp_approval_payment_idx
  ON stellar_relayer_requests(approval_payment_id, created_at DESC)
  WHERE operation_kind = 'cctp_approval';
