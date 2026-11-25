import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@neondatabase/serverless";

type MigrationRow = { checksum: string };

async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to apply migrations");

  const host = new URL(connectionString).hostname;
  if (host.includes("-pooler.")) {
    throw new Error("Use a direct Neon connection URL to run migrations");
  }

  const client = new Client(connectionString);
  let migrationTransactionOpen = false;
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock(74656, 109) ");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationDirectory = resolve(process.cwd(), "db/migrations");
    const migrationNames = (await readdir(migrationDirectory))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
      .sort();

    for (const name of migrationNames) {
      const source = await readFile(resolve(migrationDirectory, name), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const prior = await client.query<MigrationRow>(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [name],
      );

      if (prior.rows[0]) {
        if (prior.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration was changed: ${name}`);
        }
        continue;
      }

      await client.query("BEGIN");
      migrationTransactionOpen = true;
      await client.query(source);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      migrationTransactionOpen = false;
      process.stdout.write(`Applied ${name}\n`);
    }
  } catch (error) {
    if (migrationTransactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(74656, 109)");
    } finally {
      await client.end();
    }
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  process.stderr.write(`Database migration failed: ${message}\n`);
  process.exitCode = 1;
});
