import { randomBytes, randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { StrKey } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";

import {
  listContacts,
  removeContact,
  resolveRecipient,
  saveContact,
} from "./service.js";

describe("verified contacts on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "keeps saved contacts owner-scoped and resolves only verified recipient wallets",
    async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const ownerId = randomUUID();
      const otherOwnerId = randomUUID();
      const recipientId = randomUUID();
      const username = `ct_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const stellarAddress = StrKey.encodeContract(randomBytes(32));
      const baseAddress = `0x${randomBytes(20).toString("hex")}`;
      const rejectedAddress = `0x${randomBytes(20).toString("hex")}`;

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did) VALUES
            (${ownerId}::uuid, ${`did:privy:${ownerId}`}),
            (${otherOwnerId}::uuid, ${`did:privy:${otherOwnerId}`}),
            (${recipientId}::uuid, ${`did:privy:${recipientId}`})`,
          sql`INSERT INTO username_registry
            (username_normalized, username_display, user_id, status)
            VALUES (${username}, ${username}, ${recipientId}::uuid, 'active')`,
          sql`INSERT INTO wallets
            (user_id, network, address, normalized_address, verification_status, verified_at)
            VALUES
            (${recipientId}::uuid, 'stellar', ${stellarAddress}, ${stellarAddress}, 'verified', now()),
            (${recipientId}::uuid, 'base', ${baseAddress}, ${baseAddress.toLowerCase()}, 'verified', now()),
            (${recipientId}::uuid, 'base', ${rejectedAddress}, ${rejectedAddress.toLowerCase()}, 'rejected', NULL)`,
        ]);

        const saved = await saveContact({ id: ownerId }, {
          username: `@${username.toUpperCase()}`,
          preferredReceiveNetwork: "stellar",
        });
        expect(saved.username).toBe(username);
        expect(saved.destinations).toEqual(expect.arrayContaining([
          { network: "stellar", address: stellarAddress, isVerified: true },
          { network: "base", address: baseAddress, isVerified: true },
        ]));
        expect(saved.destinations).not.toEqual(expect.arrayContaining([
          expect.objectContaining({ address: rejectedAddress }),
        ]));

        await expect(listContacts({ id: ownerId })).resolves.toHaveLength(1);
        await expect(listContacts({ id: otherOwnerId })).resolves.toEqual([]);
        const resolved = await resolveRecipient({ id: ownerId }, username);
        expect(resolved).toMatchObject({
          reference: { kind: "contact", contactId: saved.id },
          resolvedUserId: recipientId,
          preferredReceiveNetwork: "stellar",
        });
        expect(resolved.destinations).toEqual(saved.destinations);

        await expect(removeContact({ id: otherOwnerId }, saved.id)).resolves.toBe(false);
        await expect(listContacts({ id: ownerId })).resolves.toHaveLength(1);
        await expect(removeContact({ id: ownerId }, saved.id)).resolves.toBe(true);
        await expect(listContacts({ id: ownerId })).resolves.toEqual([]);
      } finally {
        await sql.transaction([
          sql`DELETE FROM contact_wallets WHERE contact_id IN (
            SELECT id FROM contacts WHERE owner_user_id IN (${ownerId}::uuid, ${otherOwnerId}::uuid)
          )`,
          sql`DELETE FROM contacts WHERE owner_user_id IN (${ownerId}::uuid, ${otherOwnerId}::uuid)`,
          sql`DELETE FROM wallets WHERE user_id = ${recipientId}::uuid`,
          sql`DELETE FROM username_registry WHERE user_id = ${recipientId}::uuid`,
          sql`DELETE FROM users WHERE id IN (${ownerId}::uuid, ${otherOwnerId}::uuid, ${recipientId}::uuid)`,
        ]);
      }
    },
    30_000,
  );
});
