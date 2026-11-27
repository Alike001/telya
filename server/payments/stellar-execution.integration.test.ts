import { randomBytes, randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { neon, neonConfig } from "@neondatabase/serverless";
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  linkStellarCctpPaymentAuthorization,
  linkStellarPaymentAuthorization,
  recordStellarUsdcTransferSubmission,
  validateStellarCctpPaymentAuthorization,
  validateStellarPaymentAuthorization,
} from "../../src/server/stellar-relayer-requests.ts";
import type {
  ValidatedStellarCctpBurn,
  ValidatedStellarUsdcTransfer,
} from "../../src/stellar/relayer.ts";
import { reserveBaseCctpOperation } from "../../src/server/base-cctp.ts";
import {
  consumeStellarPaymentExecutionSession,
  createStellarPaymentExecutionSession,
} from "./stellar-execution-session.ts";
import { reconcileStellarDirectPayment } from "./stellar-reconciliation.ts";

function useNeonHttpsTransport(): void {
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
}

describe("linked Stellar direct payment execution on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "advances only the owned exact payment from passkey authorization to verified completion",
    async () => {
      useNeonHttpsTransport();
      const sql = neon(process.env.DATABASE_URL!);
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const authSessionId = `telya-linked-${randomUUID()}`;
      const walletId = randomUUID();
      const conversationId = randomUUID();
      const messageId = randomUUID();
      const paymentId = randomUUID();
      const requestHash = randomBytes(32).toString("hex");
      const clientHash = randomBytes(32).toString("hex");
      const transactionHash = randomBytes(32).toString("hex");
      const sender = StrKey.encodeContract(randomBytes(32));
      const recipient = StrKey.encodeContract(randomBytes(32));
      const tokenContract = StrKey.encodeContract(randomBytes(32));
      const transfer = {
        kind: "usdc_transfer",
        func: null as never,
        auth: [],
        tokenContract,
        sender,
        recipient,
        amountRaw: 12_500_000n,
        authorizationKind: "owner",
        contextRuleId: 0,
        signerAddress: sender,
      } satisfies ValidatedStellarUsdcTransfer;

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did) VALUES
            (${userId}::uuid, ${`did:privy:telya_linked_payment_${userId}`}),
            (${otherUserId}::uuid, ${`did:privy:telya_linked_payment_${otherUserId}`})`,
          sql`INSERT INTO auth_sessions (
              privy_session_id, user_id, verified_at, expires_at
            ) VALUES (
              ${authSessionId}, ${userId}::uuid, now(), now() + interval '1 hour'
            )`,
          sql`INSERT INTO wallets (
              id, user_id, network, address, normalized_address,
              verification_status, verified_at
            ) VALUES (
              ${walletId}::uuid, ${userId}::uuid, 'stellar', ${sender}, ${sender},
              'verified', now()
            )`,
          sql`INSERT INTO conversations (id, user_id)
            VALUES (${conversationId}::uuid, ${userId}::uuid)`,
          sql`INSERT INTO messages (
              id, conversation_id, role, content, structured_intent
            ) VALUES (
              ${messageId}::uuid, ${conversationId}::uuid, 'user',
              ${`Send 1.25 USDC to ${recipient} on Stellar`},
              ${JSON.stringify({ selectedSourceWallet: { id: walletId, network: "stellar", address: sender } })}::jsonb
            )`,
          sql`INSERT INTO payments (
              id, user_id, conversation_id, intent_message_id, idempotency_key,
              route_id, source_network, destination_network, rail,
              recipient_address, expected_recipient_amount, status
            ) VALUES (
              ${paymentId}::uuid, ${userId}::uuid, ${conversationId}::uuid,
              ${messageId}::uuid, ${`dbtest:${randomUUID()}`}, 'stellar_to_stellar',
              'stellar', 'stellar', 'stellar_direct', ${recipient}, 1.25,
              'awaiting_confirmation'
            )`,
          sql`INSERT INTO stellar_relayer_requests (
              request_hash, client_key_hash, status, operation_kind,
              authorization_kind, context_rule_id, signer_address,
              token_contract, sender_address, recipient_address,
              expected_amount_atomic
            ) VALUES (
              ${requestHash}, ${clientHash}, 'pending', 'usdc_transfer',
              'owner', 0, ${sender}, ${tokenContract}, ${sender}, ${recipient},
              12500000
            )`,
        ]);

        await expect(validateStellarPaymentAuthorization(
          otherUserId, paymentId, transfer,
        )).rejects.toThrow("does not match the owned payment review");
        await expect(createStellarPaymentExecutionSession({
          id: otherUserId,
          privyUserId: `did:privy:telya_linked_payment_${otherUserId}`,
          sessionId: authSessionId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        }, paymentId)).rejects.toThrow("not ready for Stellar passkey authorization");
        const handoff = await createStellarPaymentExecutionSession({
          id: userId,
          privyUserId: `did:privy:telya_linked_payment_${userId}`,
          sessionId: authSessionId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        }, paymentId);
        expect(handoff.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const storedSessions = await sql`
          SELECT token_hash FROM stellar_payment_execution_sessions
          WHERE payment_id = ${paymentId}::uuid
        `;
        expect(storedSessions).toHaveLength(1);
        expect(storedSessions[0]?.token_hash).not.toBe(handoff.token);
        await expect(consumeStellarPaymentExecutionSession(handoff.token)).resolves.toEqual({
          userId,
          paymentId,
        });
        await expect(consumeStellarPaymentExecutionSession(handoff.token)).resolves.toBeNull();
        const revokedHandoff = await createStellarPaymentExecutionSession({
          id: userId,
          privyUserId: `did:privy:telya_linked_payment_${userId}`,
          sessionId: authSessionId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        }, paymentId);
        await sql`UPDATE auth_sessions SET revoked_at = now()
          WHERE privy_session_id = ${authSessionId}`;
        await expect(consumeStellarPaymentExecutionSession(revokedHandoff.token)).resolves.toBeNull();
        await sql`UPDATE auth_sessions SET revoked_at = NULL
          WHERE privy_session_id = ${authSessionId}`;
        await validateStellarPaymentAuthorization(userId, paymentId, transfer);
        await linkStellarPaymentAuthorization(userId, paymentId, requestHash, transfer);
        await recordStellarUsdcTransferSubmission(requestHash, {
          transactionHash,
          ledger: 100,
        });
        const verifyTransfer = vi.fn()
          .mockResolvedValueOnce({ status: "pending" })
          .mockResolvedValueOnce({
            status: "verified",
            ledger: 101,
            recipient,
            amountRaw: transfer.amountRaw,
          });
        const rpc = {} as never;
        await expect(reconcileStellarDirectPayment(userId, paymentId, {
          rpc,
          verifyTransfer,
        })).resolves.toEqual({ status: "pending", transactionHash });
        const pending = await sql`
          SELECT status FROM payments WHERE id = ${paymentId}::uuid
        `;
        expect(pending[0]?.status).toBe("submitted");
        await expect(reconcileStellarDirectPayment(userId, paymentId, {
          rpc,
          verifyTransfer,
        })).resolves.toEqual({ status: "completed", transactionHash });
        await expect(reconcileStellarDirectPayment(userId, paymentId, {
          rpc,
          verifyTransfer,
        })).resolves.toEqual({ status: "completed", transactionHash });
        expect(verifyTransfer).toHaveBeenCalledTimes(2);

        const payments = await sql`
          SELECT status, source_transaction_hash, destination_transaction_hash,
            verified_recipient_address, verified_recipient_amount::text AS verified_amount
          FROM payments WHERE id = ${paymentId}::uuid
        `;
        expect(payments[0]).toMatchObject({
          status: "completed",
          source_transaction_hash: transactionHash,
          destination_transaction_hash: transactionHash,
          verified_recipient_address: recipient,
          verified_amount: "1.250000000000000000",
        });
        const events = await sql`
          SELECT event_key FROM payment_events WHERE payment_id = ${paymentId}::uuid
          ORDER BY occurred_at, event_key
        `;
        expect(events.map((event) => event.event_key)).toEqual([
          "stellar_owner_authorized",
          "stellar_submitted",
          "stellar_destination_confirmed",
          "stellar_payment_completed",
          "stellar_recipient_verified",
        ]);
      } finally {
        await sql.transaction([
          sql`DELETE FROM payment_events WHERE payment_id = ${paymentId}::uuid`,
          sql`DELETE FROM stellar_direct_payment_events WHERE request_hash = ${requestHash}`,
          sql`DELETE FROM stellar_relayer_requests WHERE request_hash = ${requestHash}`,
          sql`DELETE FROM stellar_payment_execution_sessions WHERE payment_id = ${paymentId}::uuid`,
          sql`DELETE FROM payments WHERE id = ${paymentId}::uuid`,
          sql`DELETE FROM messages WHERE id = ${messageId}::uuid`,
          sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`,
          sql`DELETE FROM wallets WHERE id = ${walletId}::uuid`,
          sql`DELETE FROM auth_sessions WHERE privy_session_id = ${authSessionId}`,
          sql`DELETE FROM users WHERE id IN (${userId}::uuid, ${otherUserId}::uuid)`,
        ]);
      }
    },
    30_000,
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "binds a one-use handoff to the exact reviewed Stellar CCTP burn",
    async () => {
      useNeonHttpsTransport();
      const sql = neon(process.env.DATABASE_URL!);
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const authSessionId = `telya-cctp-linked-${randomUUID()}`;
      const walletId = randomUUID();
      const conversationId = randomUUID();
      const messageId = randomUUID();
      const paymentId = randomUUID();
      const requestHash = randomBytes(32).toString("hex");
      const clientHash = randomBytes(32).toString("hex");
      const sender = StrKey.encodeContract(randomBytes(32));
      const recipient = `0x${randomBytes(20).toString("hex")}`;
      const tokenContract = StrKey.encodeContract(randomBytes(32));
      const burn = {
        kind: "cctp_burn",
        func: null as never,
        auth: [],
        smartAccount: sender,
        tokenMessenger: StrKey.encodeContract(randomBytes(32)),
        burnToken: tokenContract,
        recipient,
        amountRaw: 50_526_830n,
        maxFeeRaw: 526_830n,
      } satisfies ValidatedStellarCctpBurn;

      try {
        await sql.transaction([
          sql`INSERT INTO users (id, privy_did) VALUES
            (${userId}::uuid, ${`did:privy:telya_cctp_payment_${userId}`}),
            (${otherUserId}::uuid, ${`did:privy:telya_cctp_payment_${otherUserId}`})`,
          sql`INSERT INTO auth_sessions (
              privy_session_id, user_id, verified_at, expires_at
            ) VALUES (
              ${authSessionId}, ${userId}::uuid, now(), now() + interval '1 hour'
            )`,
          sql`INSERT INTO wallets (
              id, user_id, network, address, normalized_address,
              verification_status, verified_at
            ) VALUES (
              ${walletId}::uuid, ${userId}::uuid, 'stellar', ${sender}, ${sender},
              'verified', now()
            )`,
          sql`INSERT INTO conversations (id, user_id)
            VALUES (${conversationId}::uuid, ${userId}::uuid)`,
          sql`INSERT INTO messages (
              id, conversation_id, role, content, structured_intent
            ) VALUES (
              ${messageId}::uuid, ${conversationId}::uuid, 'user',
              ${`Send 5 USDC from Stellar to ${recipient} on Base`},
              ${JSON.stringify({ selectedSourceWallet: { id: walletId, network: "stellar", address: sender } })}::jsonb
            )`,
          sql`INSERT INTO payments (
              id, user_id, conversation_id, intent_message_id, idempotency_key,
              route_id, source_network, destination_network, rail,
              recipient_address, expected_recipient_amount, status, fees
            ) VALUES (
              ${paymentId}::uuid, ${userId}::uuid, ${conversationId}::uuid,
              ${messageId}::uuid, ${`dbtest:${randomUUID()}`}, 'stellar_to_base',
              'stellar', 'base', 'circle_cctp_standard', ${recipient}, 5,
              'awaiting_confirmation',
              ${JSON.stringify([{ kind: "provider", payer: "sender", asset: "USDC", amount: "0.052683", label: "Circle destination forwarding fee" }])}::jsonb
            )`,
        ]);
        await reserveBaseCctpOperation({
          paymentId,
          burnAmount: "5.052683",
          maxFee: "0.052683",
        });
        await sql`INSERT INTO stellar_relayer_requests (
            request_hash, client_key_hash, status, operation_kind,
            authorization_kind, context_rule_id, signer_address,
            token_contract, sender_address, recipient_address,
            expected_amount_atomic, cctp_destination_domain, cctp_max_fee_atomic
          ) VALUES (
            ${requestHash}, ${clientHash}, 'pending', 'cctp_burn',
            'owner', 0, ${sender}, ${tokenContract}, ${sender}, ${recipient},
            ${burn.amountRaw.toString()}::numeric, 6, ${burn.maxFeeRaw.toString()}::numeric
          )`;

        await expect(validateStellarCctpPaymentAuthorization(
          otherUserId,
          paymentId,
          burn,
        )).rejects.toThrow("does not match the owned payment review");
        await expect(validateStellarCctpPaymentAuthorization(
          userId,
          paymentId,
          { ...burn, maxFeeRaw: burn.maxFeeRaw + 1n },
        )).rejects.toThrow("does not match the owned payment review");
        const handoff = await createStellarPaymentExecutionSession({
          id: userId,
          privyUserId: `did:privy:telya_cctp_payment_${userId}`,
          sessionId: authSessionId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        }, paymentId);
        await expect(consumeStellarPaymentExecutionSession(handoff.token)).resolves.toEqual({
          userId,
          paymentId,
        });
        await validateStellarCctpPaymentAuthorization(userId, paymentId, burn);
        await linkStellarCctpPaymentAuthorization(userId, paymentId, requestHash, burn);

        const linked = await sql`
          SELECT p.status, r.payment_id
          FROM payments p JOIN stellar_relayer_requests r ON r.request_hash = ${requestHash}
          WHERE p.id = ${paymentId}::uuid
        `;
        expect(linked[0]).toMatchObject({ status: "authorized", payment_id: paymentId });
        const events = await sql`
          SELECT event_key FROM payment_events WHERE payment_id = ${paymentId}::uuid
        `;
        expect(events.map((event) => event.event_key)).toEqual([
          "stellar_cctp_owner_authorized",
        ]);
      } finally {
        await sql.transaction([
          sql`DELETE FROM payment_events WHERE payment_id = ${paymentId}::uuid`,
          sql`DELETE FROM stellar_relayer_requests WHERE request_hash = ${requestHash}`,
          sql`DELETE FROM stellar_payment_execution_sessions WHERE payment_id = ${paymentId}::uuid`,
          sql`DELETE FROM base_cctp_operations WHERE payment_id = ${paymentId}::uuid`,
          sql`DELETE FROM payments WHERE id = ${paymentId}::uuid`,
          sql`DELETE FROM messages WHERE id = ${messageId}::uuid`,
          sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`,
          sql`DELETE FROM wallets WHERE id = ${walletId}::uuid`,
          sql`DELETE FROM auth_sessions WHERE privy_session_id = ${authSessionId}`,
          sql`DELETE FROM users WHERE id IN (${userId}::uuid, ${otherUserId}::uuid)`,
        ]);
      }
    },
    30_000,
  );
});
