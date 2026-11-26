import { randomBytes, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { neon, neonConfig } from "@neondatabase/serverless";
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  findPaymentReplay,
  getPaymentWithEvents,
  listPayments,
  PaymentConflictError,
  PaymentNotFoundError,
  type CreatePaymentInput,
} from "./service.ts";

describe("payment persistence on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "scopes replay and event history to the owner and rejects changed idempotent details",
    async () => {
      // Node's fetch times out on this workspace's Neon SQL endpoint although
      // HTTPS itself succeeds. Keep this transport override confined to tests.
      neonConfig.fetchFunction = (url: string, options?: RequestInit) => new Promise<Response>((resolve, reject) => {
        const request = httpsRequest(url, {
          method: options?.method,
          headers: options?.headers as Record<string, string>,
        }, (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode ?? 502,
            headers: response.headers as HeadersInit,
          })));
          response.on("error", reject);
        });
        request.on("error", reject);
        request.end(options?.body as string);
      });
      const sql = neon(process.env.DATABASE_URL!);
      const ownerId = randomUUID();
      const otherId = randomUUID();
      const conversationId = randomUUID();
      const messageId = randomUUID();
      const paymentId = randomUUID();
      const idempotencyKey = `dbtest:${randomUUID()}`;
      // This is an isolated, short-lived review-state fixture, never a chain payment.
      const recipientAddress = StrKey.encodeContract(randomBytes(32));
      const input: CreatePaymentInput = {
        idempotencyKey,
        conversationId,
        intentMessageId: messageId,
        inputMode: "text",
        selectedSourceWalletId: null,
        intent: {
          amount: "1.25",
          asset: "USDC",
          recipientInput: "@dbtest_recipient",
          requestedSourceNetwork: null,
          requestedDestinationNetwork: "stellar",
        },
      };
      const savedIntent = JSON.stringify({
        action: "send",
        ...input.intent,
        inputMode: input.inputMode,
        requestedSourceWalletId: null,
      });

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did) VALUES
            (${ownerId}::uuid, ${`did:privy:telya_payment_dbtest_${ownerId}`}),
            (${otherId}::uuid, ${`did:privy:telya_payment_dbtest_${otherId}`})`,
          sql`INSERT INTO conversations (id, user_id)
            VALUES (${conversationId}::uuid, ${ownerId}::uuid)`,
          sql`INSERT INTO messages (id, conversation_id, role, content, structured_intent)
            VALUES (${messageId}::uuid, ${conversationId}::uuid, 'user',
              'Send 1.25 USDC to @dbtest_recipient on Stellar', ${savedIntent}::jsonb)`,
          sql`INSERT INTO payments (
              id, user_id, conversation_id, intent_message_id, idempotency_key,
              route_id, source_network, destination_network, rail,
              recipient_address, expected_recipient_amount, status
            ) VALUES (
              ${paymentId}::uuid, ${ownerId}::uuid, ${conversationId}::uuid,
              ${messageId}::uuid, ${idempotencyKey}, 'stellar_to_stellar',
              'stellar', 'stellar', 'stellar_direct', ${recipientAddress},
              1.25, 'awaiting_confirmation'
            )`,
          sql`INSERT INTO payment_events
            (payment_id, event_key, stage, status, network, public_message)
            VALUES (${paymentId}::uuid, 'route_resolved', 'routing',
              'awaiting_confirmation', 'stellar', 'Test-only review state.')`,
        ]);

        const replay = await findPaymentReplay({ id: ownerId }, input);
        expect(replay).toMatchObject({ id: paymentId, status: "awaiting_confirmation" });
        expect(await findPaymentReplay({ id: otherId }, input)).toBeNull();
        await expect(findPaymentReplay({ id: ownerId }, {
          ...input,
          intent: { ...input.intent, amount: "2.25" },
        })).rejects.toBeInstanceOf(PaymentConflictError);

        const detail = await getPaymentWithEvents({ id: ownerId }, paymentId);
        expect(detail).toMatchObject({ id: paymentId, status: "awaiting_confirmation" });
        expect(detail.events).toMatchObject([{
          stage: "routing", status: "awaiting_confirmation",
          publicMessage: "Test-only review state.",
        }]);
        await expect(getPaymentWithEvents({ id: otherId }, paymentId))
          .rejects.toBeInstanceOf(PaymentNotFoundError);

        const ownerPage = await listPayments({ id: ownerId }, { limit: 20 });
        expect(ownerPage.items.map((payment) => payment.id)).toContain(paymentId);
        const otherPage = await listPayments({ id: otherId }, { limit: 20 });
        expect(otherPage.items).toEqual([]);
      } finally {
        await sql.transaction([
          sql`DELETE FROM payment_events WHERE payment_id = ${paymentId}::uuid`,
          sql`DELETE FROM payments WHERE id = ${paymentId}::uuid`,
          sql`DELETE FROM messages WHERE id = ${messageId}::uuid`,
          sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`,
          sql`DELETE FROM users WHERE id IN (${ownerId}::uuid, ${otherId}::uuid)`,
        ]);
      }
    },
    30_000,
  );
});
