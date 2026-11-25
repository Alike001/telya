-- A complete same-client Testnet acceptance run can require deployment,
-- funding, Agent Pass creation, agent spend, revocation, and an owner spend.
-- Keep the global sponsor budget at 100 while allowing that bounded proof.

CREATE OR REPLACE FUNCTION reserve_stellar_relayer_request(
  p_request_hash text,
  p_client_key_hash text,
  p_global_daily_limit integer DEFAULT 100,
  p_client_daily_limit integer DEFAULT 10
)
RETURNS TABLE(decision text, existing_transaction_hash text)
LANGUAGE plpgsql
AS $$
DECLARE
  current_status text;
  current_hash text;
  current_updated_at timestamptz;
BEGIN
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
