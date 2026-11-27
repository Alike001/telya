import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  consumeStellarDeploymentExecutionSession,
  createStellarDeploymentExecutionSession,
} from "./deployment-session.js";

describe("Stellar deployment execution handoff on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "is one-use, session-bound and unavailable after a verified Stellar wallet exists",
    async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const userId = randomUUID();
      const sessionId = `stellar-deployment-${randomUUID()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did)
            VALUES (${userId}::uuid, ${`did:privy:${userId}`})`,
          sql`INSERT INTO auth_sessions
            (privy_session_id, user_id, verified_at, expires_at)
            VALUES (${sessionId}, ${userId}::uuid, ${now}, ${expiresAt})`,
        ]);

        const user = {
          id: userId,
          privyUserId: `did:privy:${userId}`,
          sessionId,
          expiresAt,
        };
        const first = await createStellarDeploymentExecutionSession(user);
        expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

        const stored = await sql`
          SELECT token_hash, user_id FROM stellar_deployment_execution_sessions
          WHERE user_id = ${userId}::uuid
        `;
        expect(stored).toHaveLength(1);
        expect(stored[0]?.token_hash).not.toBe(first.token);

        const replacement = await createStellarDeploymentExecutionSession(user);
        await expect(consumeStellarDeploymentExecutionSession(first.token)).resolves.toBeNull();
        await expect(consumeStellarDeploymentExecutionSession(replacement.token)).resolves.toEqual({ userId });
        await expect(consumeStellarDeploymentExecutionSession(replacement.token)).resolves.toBeNull();

        const walletAddress = `C${"A".repeat(55)}`;
        await sql`INSERT INTO wallets
          (user_id, network, address, normalized_address, verification_status, verified_at)
          VALUES (${userId}::uuid, 'stellar', ${walletAddress}, ${walletAddress}, 'verified', now())`;
        await expect(createStellarDeploymentExecutionSession(user)).rejects.toThrow("not eligible");

        await sql`DELETE FROM wallets WHERE user_id = ${userId}::uuid`;
        const revoked = await createStellarDeploymentExecutionSession(user);
        await sql`UPDATE auth_sessions SET revoked_at = now()
          WHERE privy_session_id = ${sessionId}`;
        await expect(consumeStellarDeploymentExecutionSession(revoked.token)).resolves.toBeNull();
      } finally {
        await sql.transaction([
          sql`DELETE FROM stellar_deployment_execution_sessions WHERE user_id = ${userId}::uuid`,
          sql`DELETE FROM wallets WHERE user_id = ${userId}::uuid`,
          sql`DELETE FROM auth_sessions WHERE user_id = ${userId}::uuid`,
          sql`DELETE FROM users WHERE id = ${userId}::uuid`,
        ]);
      }
    },
    30_000,
  );
});
