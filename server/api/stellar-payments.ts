import { authenticateRequest } from "../auth/privy.ts";
import {
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
} from "../payments/service.ts";
import { reconcileStellarDirectPayment } from "../payments/stellar-reconciliation.ts";
import { createAuthenticatedHandler, jsonResponse } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

type ReconcileStellarPayment = typeof reconcileStellarDirectPayment;

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
    (error) => {
      if (error instanceof PaymentNotFoundError) return jsonResponse({ error: "payment_not_found" }, 404);
      if (error instanceof PaymentConflictError) {
        return jsonResponse({ error: "payment_state_conflict", message: error.message }, 409);
      }
      if (error instanceof PaymentProviderUnavailableError) {
        return jsonResponse({ error: "stellar_chain_unavailable" }, 503);
      }
      return null;
    },
  );
}
