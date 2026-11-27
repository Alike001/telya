-- One-time, HttpOnly browser-to-relayer handoff. Only token hashes are stored;
-- the raw token is restricted to a short-lived same-origin cookie.

CREATE TABLE stellar_payment_execution_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  privy_session_id text NOT NULL REFERENCES auth_sessions(privy_session_id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX stellar_payment_execution_sessions_payment_idx
  ON stellar_payment_execution_sessions(payment_id, created_at DESC);

CREATE INDEX stellar_payment_execution_sessions_expiry_idx
  ON stellar_payment_execution_sessions(expires_at)
  WHERE consumed_at IS NULL;
