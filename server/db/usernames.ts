import { getSqlClient } from "./client.ts";
import type { AuthenticatedUser } from "../auth/privy.ts";

export class UsernameUnavailableError extends Error {
  constructor() {
    super("Username is unavailable");
    this.name = "UsernameUnavailableError";
  }
}

export class InvalidUsernameError extends Error {
  constructor() {
    super("Username must be 3–30 letters, numbers, or underscores");
    this.name = "InvalidUsernameError";
  }
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export function normalizeUsername(input: string): string {
  const withoutPrefix = input.trim().replace(/^@/, "");
  const normalized = withoutPrefix.toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(normalized)) throw new InvalidUsernameError();
  return normalized;
}

/**
 * Claim or rename the authenticated user's global username. PostgreSQL's
 * unique registry key decides concurrent claims; the SQL function performs
 * a rename and its history update atomically.
 */
export async function claimUsername(
  user: Pick<AuthenticatedUser, "id">,
  requestedUsername: string,
): Promise<string> {
  const normalized = normalizeUsername(requestedUsername);
  const display = requestedUsername.trim().replace(/^@/, "");
  const sql = getSqlClient();

  try {
    const rows = await sql`
      SELECT claim_username(${user.id}::uuid, ${display}) AS username_normalized
    `;
    const claimed = rows[0]?.username_normalized;
    if (typeof claimed !== "string") throw new Error("Username claim returned no result");
    return claimed;
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === "23505") throw new UsernameUnavailableError();
    if (code === "22023") throw new InvalidUsernameError();
    throw error;
  }
}

export async function isUsernameAvailable(input: string): Promise<boolean> {
  const normalized = normalizeUsername(input);
  const sql = getSqlClient();
  const rows = await sql`
    SELECT NOT EXISTS (
      SELECT 1 FROM username_registry
      WHERE username_normalized = ${normalized}
    ) AS available
  `;
  return rows[0]?.available === true;
}
