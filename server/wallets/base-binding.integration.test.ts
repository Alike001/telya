import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import { bindVerifiedBaseWallet } from "./binding.js";

describe("Base wallet binding on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "persists only the exact Privy-verified Ethereum address for the authenticated user",
    async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const userId = randomUUID();
      const privyUserId = `did:privy:telya_base_binding_${userId}`;
      const address = `0x${randomUUID().replaceAll("-", "").padEnd(40, "0").slice(0, 40)}`;
      const user = {
        id: userId,
        privyUserId,
        sessionId: `session-${userId}`,
        expiresAt: new Date(Date.now() + 60_000),
      };
      try {
        await sql`INSERT INTO users (id, privy_did) VALUES (${userId}::uuid, ${privyUserId})`;
        const result = await bindVerifiedBaseWallet(user, address.toUpperCase().replace("0X", "0x"), async () => [address]);
        expect(result.address).toBe(address);
        const rows = await sql`
          SELECT user_id, network, address, normalized_address, verification_status
          FROM wallets WHERE id = ${result.walletId}::uuid
        `;
        expect(rows).toEqual([{
          user_id: userId,
          network: "base",
          address,
          normalized_address: address,
          verification_status: "verified",
        }]);
      } finally {
        await sql.transaction([
          sql`DELETE FROM wallets WHERE user_id = ${userId}::uuid`,
          sql`DELETE FROM users WHERE id = ${userId}::uuid`,
        ]);
      }
    },
    30_000,
  );
});
