-- Durable, server-only guardrail for the Testnet smart-account deployment
-- sponsor. No IP address or secret is stored; client identifiers are hashed.

CREATE TABLE stellar_relayer_requests (
  request_hash text PRIMARY KEY CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  client_key_hash text NOT NULL CHECK (client_key_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  transaction_hash text CHECK (
    transaction_hash IS NULL OR transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'succeeded') = (transaction_hash IS NOT NULL))
);

CREATE INDEX stellar_relayer_requests_client_created_idx
  ON stellar_relayer_requests(client_key_hash, created_at DESC);

CREATE FUNCTION reserve_stellar_relayer_request(
  p_request_hash text,
  p_client_key_hash text,
  p_global_daily_limit integer DEFAULT 100,
  p_client_daily_limit integer DEFAULT 5
)
RETURNS TABLE(decision text, existing_transaction_hash text)
LANGUAGE plpgsql
AS $$
DECLARE
  current_status text;
  current_hash text;
  current_updated_at timestamptz;
BEGIN
  -- Serialize the small Testnet sponsor budget so concurrent serverless
  -- instances cannot all pass the same count check.
  PERFORM pg_advisory_xact_lock(74656, 901);

  SELECT status, transaction_hash, updated_at
  INTO current_status, current_hash, current_updated_at
  FROM stellar_relayer_requests
  WHERE request_hash = p_request_hash;

  IF current_status = 'succeeded' THEN
    RETURN QUERY SELECT 'succeeded'::text, current_hash;
    RETURN;
  END IF;

  IF current_status = 'pending' THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::text;
    RETURN;
  END IF;

  -- A transient failure may be retried after one minute, but it still counts
  -- against the daily budget because the sponsor may already have paid a fee.
  IF current_status = 'failed' AND current_updated_at > now() - interval '1 minute' THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::text;
    RETURN;
  END IF;

  IF (
    SELECT count(*) FROM stellar_relayer_requests
    WHERE created_at >= date_trunc('day', now())
  ) >= p_global_daily_limit OR (
    SELECT count(*) FROM stellar_relayer_requests
    WHERE client_key_hash = p_client_key_hash
      AND created_at >= date_trunc('day', now())
  ) >= p_client_daily_limit THEN
    RETURN QUERY SELECT 'limit_reached'::text, NULL::text;
    RETURN;
  END IF;

  INSERT INTO stellar_relayer_requests (
    request_hash,
    client_key_hash,
    status
  ) VALUES (
    p_request_hash,
    p_client_key_hash,
    'pending'
  )
  ON CONFLICT (request_hash) DO UPDATE
  SET status = 'pending', failure_code = NULL, updated_at = now()
  WHERE stellar_relayer_requests.status = 'failed';

  RETURN QUERY SELECT 'reserved'::text, NULL::text;
END;
$$;
