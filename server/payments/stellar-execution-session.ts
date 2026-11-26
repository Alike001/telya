import { createHash, randomBytes } from "node:crypto";

import type { AuthenticatedUser } from "../auth/privy.ts";
import { getSqlClient } from "../db/client.ts";
import { PaymentConflictError, PaymentNotFoundError } from "./service.ts";

export const STELLAR_PAYMENT_SESSION_COOKIE = "__Secure-telya_stellar_payment";
export const STELLAR_PAYMENT_RELAYER_PATH = "/api/stellar/relayer/payment";
const SESSION_TTL_MS = 5 * 60 * 1_000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readStellarPaymentSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === STELLAR_PAYMENT_SESSION_COOKIE && /^[A-Za-z0-9_-]{43}$/.test(value)) {
      return value;
    }
  }
  return null;
}

export function stellarPaymentSessionCookie(token: string): string {
  return `${STELLAR_PAYMENT_SESSION_COOKIE}=${token}; Path=${STELLAR_PAYMENT_RELAYER_PATH}; Max-Age=300; HttpOnly; Secure; SameSite=Strict`;
}

export function clearStellarPaymentSessionCookie(): string {
  return `${STELLAR_PAYMENT_SESSION_COOKIE}=; Path=${STELLAR_PAYMENT_RELAYER_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function createStellarPaymentExecutionSession(
  user: AuthenticatedUser,
  paymentId: string,
): Promise<{ readonly token: string; readonly expiresAt: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    throw new PaymentNotFoundError();
  }
  const now = Date.now();
  const expiresAt = new Date(Math.min(now + SESSION_TTL_MS, user.expiresAt.getTime()));
  if (expiresAt.getTime() <= now + 5_000) {
    throw new PaymentConflictError("The authenticated session expires too soon to authorize this payment");
  }
  const token = randomBytes(32).toString("base64url");
  const sql = getSqlClient();
  const rows = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id
      FROM payments p
      JOIN messages m ON m.id = p.intent_message_id
      WHERE p.id = ${paymentId}::uuid
        AND p.user_id = ${user.id}::uuid
        AND p.status = 'awaiting_confirmation'
        AND p.route_id = 'stellar_to_stellar'
        AND p.source_network = 'stellar'
        AND p.destination_network = 'stellar'
        AND p.rail = 'stellar_direct'
        AND (m.structured_intent->'selectedSourceWallet'->>'id') IS NOT NULL
      FOR UPDATE OF p
    ), invalidated AS (
      UPDATE stellar_payment_execution_sessions s SET consumed_at = now()
      FROM eligible
      WHERE s.user_id = ${user.id}::uuid AND s.consumed_at IS NULL
      RETURNING s.token_hash
    ), inserted AS (
      INSERT INTO stellar_payment_execution_sessions (
        token_hash, payment_id, user_id, privy_session_id, expires_at
      )
      SELECT ${tokenHash(token)}, eligible.id, ${user.id}::uuid,
        ${user.sessionId}, ${expiresAt}
      FROM eligible
      RETURNING expires_at
    )
    SELECT expires_at FROM inserted
  `;
  if (!rows[0]) {
    throw new PaymentConflictError("This payment is not ready for Stellar passkey authorization");
  }
  return { token, expiresAt: new Date(String(rows[0].expires_at)).toISOString() };
}

/** Atomically consume one execution handoff before any relayer reservation or broadcast. */
export async function consumeStellarPaymentExecutionSession(
  token: string,
): Promise<{ readonly userId: string; readonly paymentId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const sql = getSqlClient();
  const rows = await sql`
    WITH consumed AS (
      UPDATE stellar_payment_execution_sessions s SET consumed_at = now()
      FROM auth_sessions a, payments p
      WHERE s.token_hash = ${tokenHash(token)}
        AND s.consumed_at IS NULL
        AND s.expires_at > now()
        AND a.privy_session_id = s.privy_session_id
        AND a.user_id = s.user_id
        AND a.revoked_at IS NULL
        AND a.expires_at > now()
        AND p.id = s.payment_id
        AND p.user_id = s.user_id
        AND p.status = 'awaiting_confirmation'
        AND p.route_id = 'stellar_to_stellar'
      RETURNING s.user_id, s.payment_id
    )
    SELECT user_id, payment_id FROM consumed
  `;
  const row = rows[0];
  return row ? { userId: String(row.user_id), paymentId: String(row.payment_id) } : null;
}
