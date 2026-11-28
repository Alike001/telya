import { randomBytes, randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { StrKey } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";

import {
  consumeAgentPassExecutionSession,
  createAgentPassExecutionSession,
} from "./execution-session.js";

describe("Agent Pass execution handoff on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "binds a one-use token to the authenticated owner and verified smart account",
    async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const ownerId = randomUUID();
      const otherId = randomUUID();
      const ownerSession = `agent-pass-owner-${randomUUID()}`;
      const otherSession = `agent-pass-other-${randomUUID()}`;
      const smartAccount = StrKey.encodeContract(randomBytes(32));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did) VALUES
            (${ownerId}::uuid, ${`did:privy:${ownerId}`}),
            (${otherId}::uuid, ${`did:privy:${otherId}`})`,
          sql`INSERT INTO auth_sessions
            (privy_session_id, user_id, verified_at, expires_at) VALUES
            (${ownerSession}, ${ownerId}::uuid, ${now}, ${expiresAt}),
            (${otherSession}, ${otherId}::uuid, ${now}, ${expiresAt})`,
          sql`INSERT INTO wallets
            (user_id, network, address, normalized_address, verification_status, verified_at)
            VALUES (${ownerId}::uuid, 'stellar', ${smartAccount}, ${smartAccount}, 'verified', ${now})`,
        ]);

        const owner = {
          id: ownerId,
          privyUserId: `did:privy:${ownerId}`,
          sessionId: ownerSession,
          expiresAt,
        };
        const handoff = await createAgentPassExecutionSession(owner, {
          kind: "create",
          smartAccount,
        });
        expect(handoff.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

        const stored = await sql`
          SELECT token_hash, smart_account, operation_kind, user_id
          FROM stellar_agent_pass_execution_sessions
          WHERE user_id = ${ownerId}::uuid
        `;
        expect(stored).toHaveLength(1);
        expect(stored[0]?.token_hash).not.toBe(handoff.token);
        expect(stored[0]).toMatchObject({
          smart_account: smartAccount,
          operation_kind: "create",
          user_id: ownerId,
        });

        await expect(createAgentPassExecutionSession({
          id: otherId,
          privyUserId: `did:privy:${otherId}`,
          sessionId: otherSession,
          expiresAt,
        }, { kind: "create", smartAccount })).rejects.toThrow("not found");

        await expect(consumeAgentPassExecutionSession(handoff.token)).resolves.toEqual({
          userId: ownerId,
          kind: "create",
          smartAccount,
        });
        await expect(consumeAgentPassExecutionSession(handoff.token)).resolves.toBeNull();

        const revoked = await createAgentPassExecutionSession(owner, {
          kind: "create",
          smartAccount,
        });
        await sql`UPDATE auth_sessions SET revoked_at = now()
          WHERE privy_session_id = ${ownerSession}`;
        await expect(consumeAgentPassExecutionSession(revoked.token)).resolves.toBeNull();
      } finally {
        await sql.transaction([
          sql`DELETE FROM stellar_agent_pass_execution_sessions
            WHERE user_id IN (${ownerId}::uuid, ${otherId}::uuid)`,
          sql`DELETE FROM wallets WHERE user_id IN (${ownerId}::uuid, ${otherId}::uuid)`,
          sql`DELETE FROM auth_sessions WHERE user_id IN (${ownerId}::uuid, ${otherId}::uuid)`,
          sql`DELETE FROM users WHERE id IN (${ownerId}::uuid, ${otherId}::uuid)`,
        ]);
      }
    },
    30_000,
  );
});
