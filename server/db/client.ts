import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | undefined;

/** Server-only Neon client. Keep DATABASE_URL out of client-side bundles. */
export function getSqlClient(): NeonQueryFunction<false, false> {
  if (sqlClient) return sqlClient;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for server database access");
  }

  sqlClient = neon(databaseUrl);
  return sqlClient;
}
