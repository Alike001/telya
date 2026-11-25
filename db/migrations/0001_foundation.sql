-- Telya P0 foundation schema. Apply through the migration runner, never from
-- browser code. Usernames are permanently reserved once claimed.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_did text NOT NULL UNIQUE CHECK (privy_did LIKE 'did:privy:%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Persist verified Privy session identifiers and expiries, never bearer tokens.
CREATE TABLE auth_sessions (
  privy_session_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > verified_at),
  CHECK (revoked_at IS NULL OR revoked_at >= verified_at)
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);

-- A single registry makes active, retired, and reserved names mutually
-- exclusive under concurrent inserts. Retired names cannot be reassigned.
CREATE TABLE username_registry (
  username_normalized text PRIMARY KEY
    CHECK (username_normalized ~ '^[a-z0-9_]{3,30}$'),
  username_display text NOT NULL,
  user_id uuid REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('active', 'retired', 'reserved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (
    (status = 'reserved' AND user_id IS NULL AND retired_at IS NULL)
    OR (status = 'active' AND user_id IS NOT NULL AND retired_at IS NULL)
    OR (status = 'retired' AND user_id IS NOT NULL AND retired_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX username_registry_one_active_per_user_idx
  ON username_registry(user_id)
  WHERE status = 'active';

INSERT INTO username_registry (username_normalized, username_display, status)
VALUES
  ('admin', 'admin', 'reserved'),
  ('api', 'api', 'reserved'),
  ('help', 'help', 'reserved'),
  ('root', 'root', 'reserved'),
  ('security', 'security', 'reserved'),
  ('support', 'support', 'reserved'),
  ('system', 'system', 'reserved'),
  ('telya', 'telya', 'reserved');

-- Claims and renames run as one database statement. Row locking serializes two
-- simultaneous username changes for the same user; the registry primary key
-- arbitrates competing claims across users.
CREATE FUNCTION claim_username(p_user_id uuid, p_requested_username text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  normalized text;
  display_value text;
BEGIN
  display_value := regexp_replace(trim(coalesce(p_requested_username, '')), '^@', '');
  normalized := lower(display_value);

  IF normalized !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Invalid username'
      USING ERRCODE = '22023';
  END IF;

  PERFORM id FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM username_registry
    WHERE username_normalized = normalized
      AND user_id = p_user_id
      AND status = 'active'
  ) THEN
    RETURN normalized;
  END IF;

  UPDATE username_registry
  SET status = 'retired', retired_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO username_registry (
    username_normalized,
    username_display,
    user_id,
    status
  ) VALUES (
    normalized,
    display_value,
    p_user_id,
    'active'
  );

  RETURN normalized;
END;
$$;

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  network text NOT NULL CHECK (network IN ('stellar', 'base')),
  address text NOT NULL,
  normalized_address text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((verification_status = 'verified') = (verified_at IS NOT NULL)),
  CHECK (normalized_address = CASE network
    WHEN 'base' THEN lower(address)
    ELSE address
  END),
  UNIQUE (network, normalized_address)
);

CREATE INDEX wallets_user_id_idx ON wallets(user_id);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  username_normalized text NOT NULL REFERENCES username_registry(username_normalized),
  resolved_user_id uuid REFERENCES users(id),
  display_name text,
  preferred_receive_network text CHECK (
    preferred_receive_network IS NULL OR preferred_receive_network IN ('stellar', 'base')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, username_normalized),
  CHECK (resolved_user_id IS NULL OR resolved_user_id <> owner_user_id)
);

CREATE INDEX contacts_owner_user_id_idx ON contacts(owner_user_id);

CREATE TABLE contact_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  network text NOT NULL CHECK (network IN ('stellar', 'base')),
  address text NOT NULL,
  normalized_address text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((verification_status = 'verified') = (verified_at IS NOT NULL)),
  CHECK (normalized_address = CASE network
    WHEN 'base' THEN lower(address)
    ELSE address
  END),
  UNIQUE (contact_id, network, normalized_address)
);

CREATE INDEX contact_wallets_contact_id_idx ON contact_wallets(contact_id);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_user_updated_idx
  ON conversations(user_id, updated_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  structured_intent jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_created_idx
  ON messages(conversation_id, created_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  conversation_id uuid REFERENCES conversations(id),
  intent_message_id uuid REFERENCES messages(id),
  idempotency_key text NOT NULL,
  route_id text NOT NULL CHECK (route_id IN (
    'stellar_to_stellar', 'base_to_base', 'base_to_stellar', 'stellar_to_base'
  )),
  source_network text NOT NULL CHECK (source_network IN ('stellar', 'base')),
  destination_network text NOT NULL CHECK (destination_network IN ('stellar', 'base')),
  rail text NOT NULL CHECK (rail IN (
    'stellar_direct', 'base_direct', 'circle_cctp_standard'
  )),
  recipient_user_id uuid REFERENCES users(id),
  recipient_username text,
  recipient_address text NOT NULL,
  asset text NOT NULL DEFAULT 'USDC' CHECK (asset = 'USDC'),
  expected_recipient_amount numeric(38, 18) NOT NULL CHECK (expected_recipient_amount > 0),
  status text NOT NULL CHECK (status IN (
    'created', 'route_resolved', 'awaiting_confirmation', 'authorized',
    'submitted', 'source_confirmed', 'awaiting_attestation',
    'destination_submitted', 'destination_confirmed', 'recipient_verified',
    'completed', 'failed'
  )),
  route_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(route_reasons) = 'array'),
  fees jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(fees) = 'array'),
  source_transaction_hash text,
  destination_transaction_hash text,
  verified_recipient_address text,
  verified_recipient_amount numeric(38, 18),
  recipient_verified_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (route_id = 'stellar_to_stellar' AND source_network = 'stellar'
      AND destination_network = 'stellar' AND rail = 'stellar_direct')
    OR (route_id = 'base_to_base' AND source_network = 'base'
      AND destination_network = 'base' AND rail = 'base_direct')
    OR (route_id = 'base_to_stellar' AND source_network = 'base'
      AND destination_network = 'stellar' AND rail = 'circle_cctp_standard')
    OR (route_id = 'stellar_to_base' AND source_network = 'stellar'
      AND destination_network = 'base' AND rail = 'circle_cctp_standard')
  ),
  CHECK (
    status <> 'completed'
    OR (
      destination_transaction_hash IS NOT NULL
      AND verified_recipient_address IS NOT NULL
      AND verified_recipient_amount IS NOT NULL
      AND (
        (destination_network = 'base'
          AND lower(verified_recipient_address) = lower(recipient_address))
        OR (destination_network = 'stellar'
          AND verified_recipient_address = recipient_address)
      )
      AND verified_recipient_amount = expected_recipient_amount
      AND recipient_verified_at IS NOT NULL
    )
  )
);

CREATE INDEX payments_user_created_idx ON payments(user_id, created_at DESC);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  event_key text NOT NULL,
  stage text NOT NULL CHECK (stage IN (
    'created', 'routing', 'confirmation', 'authorization', 'source_submission',
    'source_confirmation', 'attestation', 'destination_submission',
    'destination_confirmation', 'recipient_verification', 'completion', 'failure'
  )),
  status text NOT NULL CHECK (status IN (
    'created', 'route_resolved', 'awaiting_confirmation', 'authorized',
    'submitted', 'source_confirmed', 'awaiting_attestation',
    'destination_submitted', 'destination_confirmed', 'recipient_verified',
    'completed', 'failed'
  )),
  network text CHECK (network IS NULL OR network IN ('stellar', 'base')),
  transaction_hash text,
  public_message text NOT NULL,
  debug_message text,
  error_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (payment_id, event_key)
);

CREATE INDEX payment_events_payment_created_idx
  ON payment_events(payment_id, occurred_at);

CREATE TABLE agent_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  network text NOT NULL DEFAULT 'stellar' CHECK (network = 'stellar'),
  asset text NOT NULL DEFAULT 'USDC' CHECK (asset = 'USDC'),
  agent_address text NOT NULL,
  spending_limit numeric(38, 18) NOT NULL CHECK (spending_limit > 0),
  spent_amount numeric(38, 18) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (spent_amount <= spending_limit),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE INDEX agent_passes_owner_created_idx
  ON agent_passes(owner_user_id, created_at DESC);

CREATE TABLE ramp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL DEFAULT 'moneygram' CHECK (provider = 'moneygram'),
  direction text NOT NULL CHECK (direction IN ('cash_in', 'cash_out')),
  status text NOT NULL CHECK (status IN (
    'created', 'awaiting_user', 'processing', 'completed', 'failed', 'cancelled'
  )),
  sandbox boolean NOT NULL DEFAULT true CHECK (sandbox),
  provider_session_id text,
  input_amount numeric(38, 18) NOT NULL CHECK (input_amount > 0),
  input_currency text NOT NULL,
  output_amount numeric(38, 18),
  output_currency text,
  fees jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fees) = 'array'),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_session_id)
);

CREATE INDEX ramp_sessions_user_created_idx
  ON ramp_sessions(user_id, created_at DESC);
