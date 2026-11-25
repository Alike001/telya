import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

async function reconcile(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const migrationName = "0001_foundation.sql";
  const source = await readFile(
    resolve(process.cwd(), "db/migrations", migrationName),
    "utf8",
  );
  const checksum = createHash("sha256").update(source).digest("hex");
  const sql = neon(databaseUrl);

  await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(74656, 109)`,
    tx.query(
      `INSERT INTO schema_migrations (name, checksum)
       SELECT $1, $2
       WHERE to_regclass('public.users') IS NOT NULL
         AND to_regclass('public.wallets') IS NOT NULL
         AND to_regclass('public.payments') IS NOT NULL
         AND to_regclass('public.payment_events') IS NOT NULL
       ON CONFLICT (name) DO NOTHING`,
      [migrationName, checksum],
    ),
  ]);

  const rows = await sql.query(
    "SELECT checksum FROM schema_migrations WHERE name = $1",
    [migrationName],
  );
  if (rows[0]?.checksum !== checksum) {
    throw new Error("Foundation migration ledger reconciliation failed");
  }
}

reconcile().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  process.stderr.write(`Database migration failed: ${message}\n`);
  process.exitCode = 1;
});
