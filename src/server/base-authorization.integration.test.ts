import { randomBytes, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { neon, neonConfig } from "@neondatabase/serverless";
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { BaseRpc } from "../base/evm.js";
import {
  authorizeBaseCctpOperation,
  authorizeBaseDirectOperation,
  reconcileBaseDirectPayment,
  reconcileBaseToStellarCctp,
} from "./base-cctp.js";

describe("Base payment authorization on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "persists exact direct and CCTP intents before wallet signing",
    async () => {
      neonConfig.fetchFunction = (url: string, options?: RequestInit) => new Promise<Response>((resolve, reject) => {
        const request = httpsRequest(url, {
          method: options?.method,
          headers: options?.headers as Record<string, string>,
          family: 4,
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
      const userId = randomUUID();
      const walletId = randomUUID();
      const conversationId = randomUUID();
      const messageId = randomUUID();
      const directId = randomUUID();
      const cctpId = randomUUID();
      const source = `0x${randomBytes(20).toString("hex")}`;
      const directRecipient = `0x${randomBytes(20).toString("hex")}`;
      const stellarRecipient = StrKey.encodeContract(randomBytes(32));
      const directHash = `0x${randomBytes(32).toString("hex")}`;
      const cctpHash = `0x${randomBytes(32).toString("hex")}`;
      const pendingRpc: BaseRpc = { request: async <T>() => null as T };
      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did) VALUES (${userId}::uuid, ${`did:privy:base_auth_${userId}`})`,
          sql`INSERT INTO wallets (
              id, user_id, network, address, normalized_address, verification_status, verified_at
            ) VALUES (
              ${walletId}::uuid, ${userId}::uuid, 'base', ${source}, ${source}, 'verified', now()
            )`,
          sql`INSERT INTO conversations (id, user_id) VALUES (${conversationId}::uuid, ${userId}::uuid)`,
          sql`INSERT INTO messages (id, conversation_id, role, content, structured_intent)
            VALUES (
              ${messageId}::uuid, ${conversationId}::uuid, 'user', 'Base authorization test',
              ${JSON.stringify({ selectedSourceWallet: { id: walletId, network: "base", address: source } })}::jsonb
            )`,
          sql`INSERT INTO payments (
              id, user_id, conversation_id, intent_message_id, idempotency_key,
              route_id, source_network, destination_network, rail,
              recipient_address, expected_recipient_amount, status, fees
            ) VALUES (
              ${directId}::uuid, ${userId}::uuid, ${conversationId}::uuid, ${messageId}::uuid,
              ${`dbtest:direct:${directId}`}, 'base_to_base', 'base', 'base', 'base_direct',
              ${directRecipient}, 5, 'awaiting_confirmation', '[]'::jsonb
            )`,
          sql`INSERT INTO payments (
              id, user_id, conversation_id, intent_message_id, idempotency_key,
              route_id, source_network, destination_network, rail,
              recipient_address, expected_recipient_amount, status, fees
            ) VALUES (
              ${cctpId}::uuid, ${userId}::uuid, ${conversationId}::uuid, ${messageId}::uuid,
              ${`dbtest:cctp:${cctpId}`}, 'base_to_stellar', 'base', 'stellar', 'circle_cctp_standard',
              ${stellarRecipient}, 5, 'awaiting_confirmation',
              ${JSON.stringify([{ kind: "provider", payer: "sender", asset: "USDC", amount: "0", label: "Circle CCTP Standard fee" }])}::jsonb
            )`,
        ]);

        await expect(authorizeBaseDirectOperation({ paymentId: directId })).resolves.toEqual({
          sourceAddress: source,
          recipientAddress: directRecipient,
          amount: "5",
        });
        await expect(authorizeBaseCctpOperation({
          paymentId: cctpId,
          burnAmount: "5",
          maxFee: "0",
        })).resolves.toEqual({
          sourceAddress: source,
          burnAmountAtomic: "5000000",
          maxFeeAtomic: "0",
        });
        await expect(reconcileBaseDirectPayment({
          paymentId: directId,
          transactionHash: directHash,
          rpc: pendingRpc,
        })).resolves.toEqual({ status: "pending", transactionHash: directHash });
        await expect(reconcileBaseToStellarCctp({
          paymentId: cctpId,
          sourceTransactionHash: cctpHash,
          rpc: pendingRpc,
        })).resolves.toEqual({ status: "pending", sourceTransactionHash: cctpHash });

        const payments = await sql`
          SELECT id, status, source_transaction_hash, destination_transaction_hash FROM payments
          WHERE id IN (${directId}::uuid, ${cctpId}::uuid) ORDER BY id
        `;
        expect(payments).toEqual([
          { id: directId, status: "destination_submitted", source_transaction_hash: null, destination_transaction_hash: directHash },
          { id: cctpId, status: "submitted", source_transaction_hash: cctpHash, destination_transaction_hash: null },
        ].sort((left, right) => left.id.localeCompare(right.id)));
        const events = await sql`
          SELECT event_key FROM payment_events
          WHERE payment_id IN (${directId}::uuid, ${cctpId}::uuid) ORDER BY event_key
        `;
        expect(events.map((event) => event.event_key)).toEqual([
          "base_cctp_owner_authorized",
          "base_cctp_submitted",
          "base_direct_owner_authorized",
          "base_direct_submitted",
        ]);
      } finally {
        await sql.transaction([
          sql`DELETE FROM payment_events WHERE payment_id IN (${directId}::uuid, ${cctpId}::uuid)`,
          sql`DELETE FROM base_cctp_operations WHERE payment_id IN (${directId}::uuid, ${cctpId}::uuid)`,
          sql`DELETE FROM payments WHERE id IN (${directId}::uuid, ${cctpId}::uuid)`,
          sql`DELETE FROM messages WHERE id = ${messageId}::uuid`,
          sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`,
          sql`DELETE FROM wallets WHERE id = ${walletId}::uuid`,
          sql`DELETE FROM users WHERE id = ${userId}::uuid`,
        ]);
      }
    },
    30_000,
  );
});
