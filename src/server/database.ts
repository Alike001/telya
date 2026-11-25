import "server-only";

import { getSqlClient } from "../../server/db/client";

/** Executes a minimal server-only query without returning connection details. */
export async function probeDatabase(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;

  const sql = getSqlClient();
  const rows = await sql`SELECT 1 AS ready`;
  return Number(rows[0]?.ready) === 1;
}
