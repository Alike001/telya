import { rpc } from "@stellar/stellar-sdk";

import {
  BaseEvmError,
  baseEvmConfigFromEnvironment,
  createBaseRpc,
  normalizeBaseUsdcAmount,
} from "../../src/base/evm.js";
import type { DecimalAmount } from "../../src/domain/contracts.js";
import { CircleCctpError } from "../../src/base/circle.js";
import { BaseCctpPersistenceError } from "../../src/server/base-cctp.js";
import {
  reconcileBaseDirectPayment,
  reconcileBaseToStellarCctp,
  prepareStellarToBaseCctpDestination,
  reconcileStellarToBaseDestination,
  recordStellarToBaseDestinationSubmitted,
  reserveBaseCctpOperation,
} from "../../src/server/base-cctp.js";
import { stellarCctpConfigFromEnvironment } from "../../src/stellar/cctp.js";
import {
  PaymentConflictError,
  PaymentInputError,
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
  getPaymentWithEvents,
} from "../payments/service.js";
import {
  createAuthenticatedHandler,
  isRecord,
  jsonResponse,
  readJson,
} from "./http.js";
import type { AuthenticateRequest } from "./http.js";
import { authenticateRequest } from "../auth/privy.js";

function paymentId(request: Request): string {
  return new URL(request.url).searchParams.get("id") ?? "";
}

function parseTransactionHash(value: unknown, base: boolean): string | null {
  if (typeof value !== "string") return null;
  const pattern = base ? /^0x[0-9a-fA-F]{64}$/ : /^(?:0x)?[0-9a-fA-F]{64}$/;
  return pattern.test(value) ? value.toLowerCase() : null;
}

function mapBasePaymentError(error: unknown): Response | null {
  if (error instanceof PaymentNotFoundError) return jsonResponse({ error: "payment_not_found" }, 404);
  if (error instanceof PaymentInputError) return jsonResponse({ error: "invalid_payment" }, 400);
  if (error instanceof PaymentConflictError || error instanceof BaseCctpPersistenceError) {
    return jsonResponse({ error: "payment_state_conflict" }, 409);
  }
  if (error instanceof CircleCctpError || error instanceof PaymentProviderUnavailableError) {
    return jsonResponse({ error: "payment_provider_unavailable" }, 503);
  }
  if (error instanceof BaseEvmError) {
    if (["INVALID_ADDRESS", "INVALID_AMOUNT", "WRONG_NETWORK", "TRANSACTION_MISMATCH"].includes(error.code)) {
      return jsonResponse({ error: "invalid_base_transaction" }, 400);
    }
    return jsonResponse({ error: "base_chain_unavailable" }, 503);
  }
  return null;
}

export interface TrustedCctpBurnIntent {
  readonly burnAmount: DecimalAmount;
  readonly maxFee: DecimalAmount;
}

function parseFeeRows(value: unknown): readonly Record<string, unknown>[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter((fee): fee is Record<string, unknown> => isRecord(fee))
    : [];
}

function decimalToUnits(amount: string, decimals: number): bigint {
  const value = amount.trim();
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(value)) throw new PaymentInputError("CCTP amount is not representable on its source network");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

function unitsToDecimal(amount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Build burn values from the reviewed payment and server-quoted USDC provider fee. */
export function trustedCctpBurnIntent(payment: Record<string, unknown>): TrustedCctpBurnIntent {
  const routeId = payment.route_id;
  const sourceNetwork = payment.source_network;
  if (
    (routeId !== "base_to_stellar" && routeId !== "stellar_to_base") ||
    (sourceNetwork !== "base" && sourceNetwork !== "stellar") ||
    typeof payment.expected_recipient_amount !== "string" && typeof payment.expected_recipient_amount !== "number"
  ) throw new PaymentInputError("Payment is not a Circle CCTP route");
  const decimals = sourceNetwork === "base" ? 6 : 7;
  const expected = decimalToUnits(String(payment.expected_recipient_amount), decimals);
  const providerFee = parseFeeRows(payment.fees)
    .filter((fee) => fee.kind === "provider" && fee.asset === "USDC" && fee.payer === "sender")
    .reduce((sum, fee) => {
      if (typeof fee.amount !== "string") throw new PaymentInputError("Stored Circle fee quote is invalid");
      return sum + decimalToUnits(fee.amount, decimals);
    }, 0n);
  const burnAmount = expected + providerFee;
  if (burnAmount <= providerFee || providerFee < 0n) {
    throw new PaymentInputError("Stored Circle fee quote does not produce a valid burn amount");
  }
  if (sourceNetwork === "base") {
    normalizeBaseUsdcAmount(unitsToDecimal(burnAmount, decimals));
  }
  return {
    burnAmount: unitsToDecimal(burnAmount, decimals),
    maxFee: unitsToDecimal(providerFee, decimals),
  };
}

export function createBaseDirectPaymentHandler(options: { authenticate?: AuthenticateRequest } = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      const id = paymentId(request);
      const payment = await getPaymentWithEvents(user, id);
      if (payment.route_id !== "base_to_base") return jsonResponse({ error: "unsupported_payment_route" }, 409);
      const body = await readJson(request, 2_048);
      const transactionHash = isRecord(body) ? parseTransactionHash(body.transactionHash, true) : null;
      if (!transactionHash) return jsonResponse({ error: "invalid_transaction_hash" }, 400);
      const config = baseEvmConfigFromEnvironment();
      const result = await reconcileBaseDirectPayment({
        paymentId: id,
        transactionHash,
        rpc: createBaseRpc(config),
      });
      return jsonResponse(result, result.status === "pending" ? 202 : 200);
    },
    mapBasePaymentError,
  );
}

/** Reserve trusted source amount and Circle fee only after the owner confirmed the payment. */
export function createBaseCctpAuthorizationHandler(options: { authenticate?: AuthenticateRequest } = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      const id = paymentId(request);
      const payment = await getPaymentWithEvents(user, id);
      if (payment.status !== "authorized") return jsonResponse({ error: "payment_not_authorized" }, 409);
      const intent = trustedCctpBurnIntent(payment);
      const operation = await reserveBaseCctpOperation({ paymentId: id, ...intent });
      return jsonResponse({ paymentId: id, status: "authorized", ...operation }, 200);
    },
    mapBasePaymentError,
  );
}

export function createBaseCctpSourceHandler(options: { authenticate?: AuthenticateRequest } = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      const id = paymentId(request);
      const payment = await getPaymentWithEvents(user, id);
      const body = await readJson(request, 2_048);
      if (!isRecord(body)) return jsonResponse({ error: "invalid_request" }, 400);
      if (payment.route_id === "base_to_stellar") {
        const txHash = parseTransactionHash(body.sourceTransactionHash, true);
        if (!txHash) return jsonResponse({ error: "invalid_transaction_hash" }, 400);
        const config = baseEvmConfigFromEnvironment();
        const result = await reconcileBaseToStellarCctp({
          paymentId: id,
          sourceTransactionHash: txHash,
          rpc: createBaseRpc(config),
        });
        return jsonResponse(result, result.status === "pending" || result.status === "in_progress" ? 202 : 200);
      }
      if (payment.route_id === "stellar_to_base") {
        const txHash = parseTransactionHash(body.sourceTransactionHash, false);
        if (!txHash) return jsonResponse({ error: "invalid_transaction_hash" }, 400);
        const config = stellarCctpConfigFromEnvironment();
        const result = await prepareStellarToBaseCctpDestination({
          paymentId: id,
          stellarSourceTransactionHash: txHash,
          stellarRpc: new rpc.Server(config.rpcUrl),
        });
        return jsonResponse(result, result.status === "pending" || result.status === "in_progress" ? 202 : 200);
      }
      return jsonResponse({ error: "unsupported_payment_route" }, 409);
    },
    mapBasePaymentError,
  );
}

export function createBaseCctpDestinationHandler(options: { authenticate?: AuthenticateRequest } = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      const id = paymentId(request);
      const payment = await getPaymentWithEvents(user, id);
      if (payment.route_id !== "stellar_to_base") return jsonResponse({ error: "unsupported_payment_route" }, 409);
      const body = await readJson(request, 2_048);
      const transactionHash = isRecord(body) ? parseTransactionHash(body.transactionHash, true) : null;
      if (!transactionHash) return jsonResponse({ error: "invalid_transaction_hash" }, 400);
      const config = baseEvmConfigFromEnvironment();
      await recordStellarToBaseDestinationSubmitted({
        paymentId: id,
        destinationTransactionHash: transactionHash,
      });
      const result = await reconcileStellarToBaseDestination({
        paymentId: id,
        destinationTransactionHash: transactionHash,
        rpc: createBaseRpc(config),
      });
      return jsonResponse(result, result.status === "pending" ? 202 : 200);
    },
    mapBasePaymentError,
  );
}
