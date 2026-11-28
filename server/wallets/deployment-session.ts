import { createHash, randomBytes } from "node:crypto";

import type { AuthenticatedUser } from "../auth/privy.ts";
import { getSqlClient } from "../db/client.ts";

export const STELLAR_DEPLOYMENT_SESSION_COOKIE = "__Secure-telya_stellar_deployment";
export const STELLAR_DEPLOYMENT_RELAYER_PATH = "/api/stellar/relayer/deployment";
const SESSION_TTL_MS = 5 * 60 * 1_000;

export class StellarDeploymentAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StellarDeploymentAuthorizationError";
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readStellarDeploymentSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== STELLAR_DEPLOYMENT_SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  }
  return null;
}

export function stellarDeploymentSessionCookie(token: string): string {
  return `${STELLAR_DEPLOYMENT_SESSION_COOKIE}=${token}; Path=${STELLAR_DEPLOYMENT_RELAYER_PATH}; Max-Age=300; HttpOnly; Secure; SameSite=Strict`;
}

export function clearStellarDeploymentSessionCookie(): string {
  return `${STELLAR_DEPLOYMENT_SESSION_COOKIE}=; Path=${STELLAR_DEPLOYMENT_RELAYER_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function createStellarDeploymentExecutionSession(
  user: AuthenticatedUser,
): Promise<{ readonly token: string; readonly expiresAt: string }> {
  const now = Date.now();
  const expiresAt = new Date(Math.min(now + SESSION_TTL_MS, user.expiresAt.getTime()));
  if (expiresAt.getTime() <= now + 5_000) {
    throw new StellarDeploymentAuthorizationError("Authenticated session expires too soon");
  }
  const token = randomBytes(32).toString("base64url");
  const sql = getSqlClient();
  const rows = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT a.user_id
      FROM auth_sessions a
      WHERE a.privy_session_id = ${user.sessionId}
        AND a.user_id = ${user.id}::uuid
        AND a.revoked_at IS NULL
        AND a.expires_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM wallets w
          WHERE w.user_id = a.user_id
            AND w.network = 'stellar'
            AND w.verification_status = 'verified'
        )
      LIMIT 1
    ), invalidated AS (
      UPDATE stellar_deployment_execution_sessions s SET consumed_at = now()
      FROM eligible
      WHERE s.user_id = eligible.user_id AND s.consumed_at IS NULL
      RETURNING s.token_hash
    ), inserted AS (
      INSERT INTO stellar_deployment_execution_sessions (
        token_hash, user_id, privy_session_id, expires_at
      )
      SELECT ${tokenHash(token)}, eligible.user_id, ${user.sessionId}, ${expiresAt}
      FROM eligible
      RETURNING expires_at
    )
    SELECT expires_at FROM inserted
  `;
  if (!rows[0]) {
    throw new StellarDeploymentAuthorizationError(
      "This authenticated user is not eligible for another Stellar account deployment",
    );
  }
  return { token, expiresAt: new Date(String(rows[0].expires_at)).toISOString() };
}

/** Consume the authenticated deployment authorization before relayer reservation/broadcast. */
export async function consumeStellarDeploymentExecutionSession(
  token: string,
): Promise<{ readonly userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const sql = getSqlClient();
  const rows = await sql`
    WITH consumed AS (
      UPDATE stellar_deployment_execution_sessions s SET consumed_at = now()
      FROM auth_sessions a
      WHERE s.token_hash = ${tokenHash(token)}
        AND s.consumed_at IS NULL
        AND s.expires_at > now()
        AND a.privy_session_id = s.privy_session_id
        AND a.user_id = s.user_id
        AND a.revoked_at IS NULL
        AND a.expires_at > now()
      RETURNING s.user_id
    )
    SELECT user_id FROM consumed
  `;
  return rows[0] ? { userId: String(rows[0].user_id) } : null;
}
