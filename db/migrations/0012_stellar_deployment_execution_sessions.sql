-- One-time authenticated handoff for passkey smart-account deployment.
-- The browser receives the raw token only as a short-lived, path-scoped,
-- HttpOnly cookie. Persistence contains only its SHA-256 hash.

CREATE TABLE stellar_deployment_execution_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id),
  privy_session_id text NOT NULL REFERENCES auth_sessions(privy_session_id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX stellar_deployment_execution_sessions_user_idx
  ON stellar_deployment_execution_sessions(user_id, created_at DESC);

CREATE INDEX stellar_deployment_execution_sessions_expiry_idx
  ON stellar_deployment_execution_sessions(expires_at)
  WHERE consumed_at IS NULL;
