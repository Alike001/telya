import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  claimUsername,
  isUsernameAvailable,
  UsernameUnavailableError,
} from "./usernames.js";

describe("username registry on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "arbitrates case-insensitive competing claims and preserves the active name after a failed rename",
    async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const firstUserId = randomUUID();
      const secondUserId = randomUUID();
      const firstName = `dbt_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const secondName = `dbt_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did)
            VALUES (${firstUserId}::uuid, ${`did:privy:telya_dbtest_${firstUserId}`})`,
          sql`INSERT INTO users (id, privy_did)
            VALUES (${secondUserId}::uuid, ${`did:privy:telya_dbtest_${secondUserId}`})`,
        ]);

        const [first, second] = await Promise.allSettled([
          claimUsername({ id: firstUserId }, firstName.toUpperCase()),
          claimUsername({ id: secondUserId }, firstName),
        ]);
        const fulfilled = [first, second].filter(
          (result): result is PromiseFulfilledResult<string> => result.status === "fulfilled",
        );
        const rejected = [first, second].filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );

        expect(fulfilled).toHaveLength(1);
        expect(fulfilled[0]?.value).toBe(firstName);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(UsernameUnavailableError);
        expect(await isUsernameAvailable(firstName.toUpperCase())).toBe(false);

        const winnerId = first.status === "fulfilled" ? firstUserId : secondUserId;
        const loserId = first.status === "fulfilled" ? secondUserId : firstUserId;
        expect(await claimUsername({ id: loserId }, secondName)).toBe(secondName);
        await expect(claimUsername({ id: winnerId }, secondName.toUpperCase()))
          .rejects.toBeInstanceOf(UsernameUnavailableError);

        const rows = await sql`
          SELECT username_normalized, user_id, status
          FROM username_registry
          WHERE user_id IN (${firstUserId}::uuid, ${secondUserId}::uuid)
          ORDER BY username_normalized
        `;
        expect(rows).toEqual([
          { username_normalized: firstName, user_id: winnerId, status: "active" },
          { username_normalized: secondName, user_id: loserId, status: "active" },
        ].sort((a, b) => a.username_normalized.localeCompare(b.username_normalized)));
      } finally {
        await sql.transaction([
          sql`DELETE FROM username_registry
            WHERE user_id IN (${firstUserId}::uuid, ${secondUserId}::uuid)`,
          sql`DELETE FROM users
            WHERE id IN (${firstUserId}::uuid, ${secondUserId}::uuid)`,
        ]);
      }
    },
    30_000,
  );
});
