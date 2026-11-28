import { createHash, randomBytes } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk/base";

import type { AuthenticatedUser } from "../auth/privy.ts";
import { getSqlClient } from "../db/client.ts";

export const STELLAR_AGENT_PASS_SESSION_COOKIE = "__Secure-telya_agent_pass";
// Agent Pass administration and an immediately-following delegated payment use
// the same kit because the Ed25519 signer is intentionally memory-only.
export const STELLAR_AGENT_PASS_RELAYER_PATH = "/api/stellar/relayer/payment";
const SESSION_TTL_MS = 5 * 60 * 1_000;

export type AgentPassOperation =
  | { readonly kind: "create"; readonly smartAccount: string }
  | { readonly kind: "revoke"; readonly smartAccount: string; readonly contextRuleId: number };

export class AgentPassAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPassAuthorizationError";
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readAgentPassSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== STELLAR_AGENT_PASS_SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  }
  return null;
}

export function agentPassSessionCookie(token: string): string {
  return `${STELLAR_AGENT_PASS_SESSION_COOKIE}=${token}; Path=${STELLAR_AGENT_PASS_RELAYER_PATH}; Max-Age=300; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAgentPassSessionCookie(): string {
  return `${STELLAR_AGENT_PASS_SESSION_COOKIE}=; Path=${STELLAR_AGENT_PASS_RELAYER_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function validateOperation(operation: AgentPassOperation): void {
  if (!StrKey.isValidContract(operation.smartAccount)) {
    throw new AgentPassAuthorizationError("Agent Pass account is invalid");
  }
  if (operation.kind === "revoke" &&
      (!Number.isSafeInteger(operation.contextRuleId) || operation.contextRuleId < 1)) {
    throw new AgentPassAuthorizationError("Agent Pass rule is invalid");
  }
}

export async function createAgentPassExecutionSession(
  user: AuthenticatedUser,
  operation: AgentPassOperation,
): Promise<{ readonly token: string; readonly expiresAt: string }> {
  validateOperation(operation);
  const now = Date.now();
  const expiresAt = new Date(Math.min(now + SESSION_TTL_MS, user.expiresAt.getTime()));
  if (expiresAt.getTime() <= now + 5_000) {
    throw new AgentPassAuthorizationError("Authenticated session expires too soon");
  }
  const token = randomBytes(32).toString("base64url");
  const contextRuleId = operation.kind === "revoke" ? operation.contextRuleId : null;
  const sql = getSqlClient();
  const rows = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT w.address
      FROM wallets w
      WHERE w.user_id = ${user.id}::uuid
        AND w.network = 'stellar'
        AND w.address = ${operation.smartAccount}
        AND w.verification_status = 'verified'
        AND (
          ${operation.kind} = 'create'
          OR EXISTS (
            SELECT 1 FROM stellar_agent_passes p
            WHERE p.smart_account = w.address
              AND p.context_rule_id = ${contextRuleId}
              AND p.status = 'active'
          )
        )
      LIMIT 1
    ), invalidated AS (
      UPDATE stellar_agent_pass_execution_sessions s SET consumed_at = now()
      FROM eligible
      WHERE s.user_id = ${user.id}::uuid AND s.consumed_at IS NULL
      RETURNING s.token_hash
    ), inserted AS (
      INSERT INTO stellar_agent_pass_execution_sessions (
        token_hash, smart_account, operation_kind, context_rule_id,
        user_id, privy_session_id, expires_at
      )
      SELECT ${tokenHash(token)}, eligible.address, ${operation.kind},
        ${contextRuleId}, ${user.id}::uuid, ${user.sessionId}, ${expiresAt}
      FROM eligible
      RETURNING expires_at
    )
    SELECT expires_at FROM inserted
  `;
  if (!rows[0]) {
    throw new AgentPassAuthorizationError("Verified Agent Pass account or rule was not found");
  }
  return { token, expiresAt: new Date(String(rows[0].expires_at)).toISOString() };
}

export async function isVerifiedAgentPassOwner(
  userId: string,
  smartAccount: string,
): Promise<boolean> {
  if (!StrKey.isValidContract(smartAccount)) return false;
  const sql = getSqlClient();
  const rows = await sql`
    SELECT id FROM wallets
    WHERE user_id = ${userId}::uuid
      AND network = 'stellar'
      AND address = ${smartAccount}
      AND verification_status = 'verified'
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

export async function consumeAgentPassExecutionSession(
  token: string,
): Promise<AgentPassOperation & { readonly userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const sql = getSqlClient();
  const rows = await sql`
    WITH consumed AS (
      UPDATE stellar_agent_pass_execution_sessions s SET consumed_at = now()
      FROM auth_sessions a, wallets w
      WHERE s.token_hash = ${tokenHash(token)}
        AND s.consumed_at IS NULL
        AND s.expires_at > now()
        AND a.privy_session_id = s.privy_session_id
        AND a.user_id = s.user_id
        AND a.revoked_at IS NULL
        AND a.expires_at > now()
        AND w.user_id = s.user_id
        AND w.network = 'stellar'
        AND w.address = s.smart_account
        AND w.verification_status = 'verified'
      RETURNING s.user_id, s.smart_account, s.operation_kind, s.context_rule_id
    )
    SELECT user_id, smart_account, operation_kind, context_rule_id FROM consumed
  `;
  const row = rows[0];
  if (!row) return null;
  return row.operation_kind === "revoke"
    ? {
        userId: String(row.user_id),
        kind: "revoke",
        smartAccount: String(row.smart_account),
        contextRuleId: Number(row.context_rule_id),
      }
    : { userId: String(row.user_id), kind: "create", smartAccount: String(row.smart_account) };
}
