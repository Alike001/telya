import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";
import type { NextConfig } from "next";

async function applyStellarPaymentMigration(): Promise<void> {
  if (!process.env.VERCEL || !process.env.DATABASE_URL) return;
  const name = "0003_stellar_direct_payments.sql";
  const source = await readFile(resolve(process.cwd(), "db/migrations", name), "utf8");
  const checksum = createHash("sha256").update(source).digest("hex");
  const sql = neon(process.env.DATABASE_URL);
  const prior = await sql.query(
    "SELECT checksum FROM schema_migrations WHERE name = $1",
    [name],
  );
  if (prior[0]) {
    if (prior[0].checksum !== checksum) throw new Error(`Applied migration was changed: ${name}`);
    return;
  }
  const statements = source
    .split(/;\s*(?:\r?\n)+/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement)),
    sql.query(
      "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
      [name, checksum],
    ),
  ]);
  process.stdout.write(`Applied ${name}\n`);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default async function configuredNext(): Promise<NextConfig> {
  await applyStellarPaymentMigration();
  return nextConfig;
}
