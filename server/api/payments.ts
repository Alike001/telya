import { authenticateRequest } from "../auth/privy.ts";
import {
  AmbiguousRecipientError,
  ContactInputError,
  ContactNotFoundError,
  resolveRecipient,
} from "../contacts/service.ts";
import { appendAssistantMessage } from "../conversations/service.ts";
import type { Fee, Network } from "../../src/domain/contracts.ts";
import {
  createPaymentRecord,
  getPaymentWithEvents,
  getVerifiedSourceWallets,
  listPayments,
  PaymentConflictError,
  PaymentInputError,
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
  validatePaymentIntentMessage,
} from "../payments/service.ts";
import type { BalanceProvider, FeeQuoteProvider } from "../payments/service.ts";
import { resolvePaymentRoute } from "../payments/routing.ts";
import { createAuthenticatedHandler, isRecord, jsonResponse, readJson } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

export type PaymentApiOptions = {
  readonly authenticate?: AuthenticateRequest;
  readonly getBalances?: BalanceProvider;
  readonly quoteFees?: FeeQuoteProvider;
};

function isNetwork(value: unknown): value is Network | null {
  return value === null || value === "stellar" || value === "base";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseIntent(value: unknown): {
  amount: string;
  asset: "USDC";
  recipientInput: string;
  requestedSourceNetwork: Network | null;
  requestedDestinationNetwork: Network | null;
} | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.amount !== "string" ||
    typeof value.recipientInput !== "string" ||
    value.asset !== "USDC" ||
    !isNetwork(value.requestedSourceNetwork) ||
    !isNetwork(value.requestedDestinationNetwork)
  ) return null;
  return {
    amount: value.amount,
    asset: "USDC",
    recipientInput: value.recipientInput,
    requestedSourceNetwork: value.requestedSourceNetwork,
    requestedDestinationNetwork: value.requestedDestinationNetwork,
  };
}

function parseFeeJson(value: unknown): readonly Fee[] {
  if (Array.isArray(value)) return value as Fee[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Fee[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function paymentSummary(payment: Record<string, unknown>) {
  return {
    id: payment.id,
    status: payment.status,
    routeId: payment.route_id,
    sourceNetwork: payment.source_network,
    destinationNetwork: payment.destination_network,
    rail: payment.rail,
    recipientAddress: payment.recipient_address,
    expectedRecipientAmount: String(payment.expected_recipient_amount),
    verifiedRecipientAddress: payment.verified_recipient_address,
    verifiedRecipientAmount: payment.verified_recipient_amount == null
      ? null
      : String(payment.verified_recipient_amount),
    sourceTransactionHash: payment.source_transaction_hash,
    destinationTransactionHash: payment.destination_transaction_hash,
    failureCode: payment.failure_code,
    fees: parseFeeJson(payment.fees),
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
  };
}

export function createPaymentHandler(options: PaymentApiOptions = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method === "GET") {
        const url = new URL(request.url);
        if (url.searchParams.has("id")) {
          const payment = await getPaymentWithEvents(user, url.searchParams.get("id") ?? "");
          return jsonResponse({ payment: {
            ...paymentSummary(payment),
            reasons: parseJsonArray(payment.route_reasons),
            events: parseJsonArray(payment.events),
          } });
        }
        const limitRaw = url.searchParams.get("limit") ?? "20";
        if (!/^[1-9]\d?$/.test(limitRaw) || Number(limitRaw) > 50) {
          return jsonResponse({ error: "invalid_page_size" }, 400);
        }
        const beforeId = url.searchParams.get("before");
        if (beforeId === "") return jsonResponse({ error: "invalid_payment_cursor" }, 400);
        const result = await listPayments(user, {
          ...(beforeId !== null ? { beforeId } : {}),
          limit: Number(limitRaw),
        });
        return jsonResponse({
          payments: result.items.map(paymentSummary),
          nextCursor: result.nextCursor,
        });
      }
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      if (!options.getBalances || !options.quoteFees) throw new PaymentProviderUnavailableError();

      const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
        return jsonResponse({ error: "valid_idempotency_key_required" }, 400);
      }

      const body = await readJson(request, 24_576);
      if (!isRecord(body)) return jsonResponse({ error: "invalid_payment_request" }, 400);
      const intent = parseIntent(body.intent);
      if (
        !intent ||
        typeof body.conversationId !== "string" || !isUuid(body.conversationId) ||
        typeof body.intentMessageId !== "string" || !isUuid(body.intentMessageId) ||
        !(body.inputMode === "text" || body.inputMode === "voice" || body.inputMode === "manual") ||
        !(body.selectedSourceWalletId === null || body.selectedSourceWalletId === undefined ||
          (typeof body.selectedSourceWalletId === "string" && isUuid(body.selectedSourceWalletId)))
      ) return jsonResponse({ error: "invalid_payment_request" }, 400);
      await validatePaymentIntentMessage(user, {
        conversationId: body.conversationId,
        intentMessageId: body.intentMessageId,
        inputMode: body.inputMode,
        intent,
      });
      const recipient = await resolveRecipient(user, intent.recipientInput);
      const sourceWallets = await getVerifiedSourceWallets(user);
      let balances: Awaited<ReturnType<BalanceProvider>>;
      try {
        balances = await options.getBalances(user, sourceWallets);
      } catch {
        throw new PaymentProviderUnavailableError();
      }
      const route = resolvePaymentRoute({
        recipient,
        amount: intent.amount,
        requestedSourceNetwork: intent.requestedSourceNetwork,
        requestedDestinationNetwork: intent.requestedDestinationNetwork,
        selectedSourceWalletId: typeof body.selectedSourceWalletId === "string" ? body.selectedSourceWalletId : null,
        sourceWallets,
        balances,
      });
      if (route.status === "needs_clarification") {
        const message = await appendAssistantMessage(user, body.conversationId, route.question, {
          status: route.status,
          reasons: route.reasons,
          recipientInput: intent.recipientInput,
          amount: intent.amount,
        });
        return jsonResponse({ status: route.status, question: route.question, reasons: route.reasons, message }, 200);
      }
      if (route.status === "unavailable") {
        const messageByReason = {
          invalid_amount: "The amount is invalid. Enter a positive USDC amount and try again.",
          recipient_network_unavailable: "The recipient does not have a verified wallet on that network.",
          source_wallet_unavailable: "There is no verified source wallet available for this route.",
          balance_unavailable: "I couldn't verify your USDC balance right now. Try again shortly.",
          insufficient_balance: "The selected wallet does not have enough USDC for this payment.",
        } as const;
        const message = await appendAssistantMessage(user, body.conversationId, messageByReason[route.reason], {
          status: route.status,
          reason: route.reason,
          reasons: route.reasons,
          recipientInput: intent.recipientInput,
          amount: intent.amount,
        });
        return jsonResponse({ status: route.status, reason: route.reason, reasons: route.reasons, message }, 422);
      }

      let fees: readonly Fee[] | null;
      try {
        fees = await options.quoteFees({
          route: route.route,
          amount: intent.amount,
          sourceWallet: route.sourceWallet,
          destinationAddress: route.destinationAddress,
        });
      } catch {
        throw new PaymentProviderUnavailableError();
      }
      if (fees === null) throw new PaymentProviderUnavailableError();

      const result = await createPaymentRecord(user, {
        idempotencyKey,
        conversationId: body.conversationId,
        intentMessageId: body.intentMessageId,
        inputMode: body.inputMode,
        intent,
        selectedSourceWalletId: typeof body.selectedSourceWalletId === "string" ? body.selectedSourceWalletId : null,
      }, route, fees);
      const payment = result.payment;
      return jsonResponse({
        status: payment.status,
        reused: result.reused,
        payment: {
          id: payment.id,
          status: payment.status,
          routeId: payment.route_id,
          sourceNetwork: payment.source_network,
          destinationNetwork: payment.destination_network,
          rail: payment.rail,
          recipientAddress: payment.recipient_address,
          expectedRecipientAmount: String(payment.expected_recipient_amount),
          fees: parseFeeJson(payment.fees),
          reasons: Array.isArray(payment.route_reasons) ? payment.route_reasons : [],
          createdAt: payment.created_at,
        },
        explanation: "Review the recipient, amount, route, and fees. No transaction has been submitted.",
      }, result.reused ? 200 : 201);
    },
    (error) => {
      if (error instanceof ContactInputError) return jsonResponse({ error: "invalid_recipient", message: error.message }, 400);
      if (error instanceof ContactNotFoundError) return jsonResponse({ error: "recipient_unavailable", message: error.message }, 404);
      if (error instanceof AmbiguousRecipientError) return jsonResponse({ error: "ambiguous_recipient", clarificationRequired: true }, 409);
      if (error instanceof PaymentInputError) return jsonResponse({ error: "invalid_payment", message: error.message }, 400);
      if (error instanceof PaymentNotFoundError) return jsonResponse({ error: "payment_not_found" }, 404);
      if (error instanceof PaymentConflictError) return jsonResponse({ error: "payment_conflict", message: error.message }, 409);
      if (error instanceof PaymentProviderUnavailableError) return jsonResponse({ error: "payment_provider_unavailable" }, 503);
      return null;
    },
  );
}
