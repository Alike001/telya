import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const migrationName = "0002_stellar_relayer.sql";
  const source = await readFile(
    resolve(process.cwd(), "db/migrations", migrationName),
    "utf8",
  );
  const checksum = createHash("sha256").update(source).digest("hex");
  const sql = neon(databaseUrl);

  await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(74656, 109)`,
    tx.query(`
      CREATE TABLE IF NOT EXISTS stellar_relayer_requests (
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
      )
    `),
    tx.query(`
      CREATE INDEX IF NOT EXISTS stellar_relayer_requests_client_created_idx
        ON stellar_relayer_requests(client_key_hash, created_at DESC)
    `),
    tx.query(`
      CREATE OR REPLACE FUNCTION reserve_stellar_relayer_request(
        p_request_hash text,
        p_client_key_hash text,
        p_global_daily_limit integer DEFAULT 100,
        p_client_daily_limit integer DEFAULT 5
      )
      RETURNS TABLE(decision text, existing_transaction_hash text)
      LANGUAGE plpgsql
      AS $function$
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
        IF current_status = 'failed'
          AND current_updated_at > now() - interval '1 minute' THEN
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
          request_hash, client_key_hash, status
        ) VALUES (
          p_request_hash, p_client_key_hash, 'pending'
        )
        ON CONFLICT (request_hash) DO UPDATE
        SET status = 'pending', failure_code = NULL, updated_at = now()
        WHERE stellar_relayer_requests.status = 'failed';
        RETURN QUERY SELECT 'reserved'::text, NULL::text;
      END;
      $function$
    `),
    tx.query(
      `INSERT INTO schema_migrations (name, checksum)
       VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [migrationName, checksum],
    ),
  ]);
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  process.stderr.write(`Database migration failed: ${message}\n`);
  process.exitCode = 1;
});
