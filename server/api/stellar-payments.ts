import { authenticateRequest } from "../auth/privy.ts";
import {
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
} from "../payments/service.ts";
import {
  createStellarPaymentExecutionSession,
  stellarPaymentSessionCookie,
  STELLAR_PAYMENT_RELAYER_PATH,
} from "../payments/stellar-execution-session.ts";
import { reconcileStellarDirectPayment } from "../payments/stellar-reconciliation.ts";
import { createAuthenticatedHandler, isRecord, jsonResponse, readJson } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

type ReconcileStellarPayment = typeof reconcileStellarDirectPayment;
type CreateExecutionSession = typeof createStellarPaymentExecutionSession;

export function createStellarPaymentAuthorizationHandler(
  options: {
    readonly authenticate?: AuthenticateRequest;
    readonly createSession?: CreateExecutionSession;
  } = {},
) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      const body = await readJson(request);
      if (!isRecord(body) || typeof body.paymentId !== "string") {
        return jsonResponse({ error: "payment_id_required" }, 400);
      }
      const session = await (options.createSession ?? createStellarPaymentExecutionSession)(
        user,
        body.paymentId,
      );
      const response = jsonResponse({
        status: "authorization_ready",
        relayerUrl: STELLAR_PAYMENT_RELAYER_PATH,
        expiresAt: session.expiresAt,
      }, 201);
      response.headers.set("set-cookie", stellarPaymentSessionCookie(session.token));
      return response;
    },
    paymentErrorResponse,
  );
}

export function createStellarPaymentReconciliationHandler(
  options: {
    readonly authenticate?: AuthenticateRequest;
    readonly reconcile?: ReconcileStellarPayment;
  } = {},
) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      const paymentId = new URL(request.url).searchParams.get("id") ?? "";
      const result = await (options.reconcile ?? reconcileStellarDirectPayment)(user.id, paymentId);
      return jsonResponse(result, result.status === "pending" ? 202 : 200);
    },
    paymentErrorResponse,
  );
}

function paymentErrorResponse(error: unknown): Response | null {
  if (error instanceof PaymentNotFoundError) return jsonResponse({ error: "payment_not_found" }, 404);
  if (error instanceof PaymentConflictError) {
    return jsonResponse({ error: "payment_state_conflict", message: error.message }, 409);
  }
  if (error instanceof PaymentProviderUnavailableError) {
    return jsonResponse({ error: "stellar_chain_unavailable" }, 503);
  }
  return null;
}
