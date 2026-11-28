import { authenticateRequest } from "../auth/privy.ts";
import {
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
  getPaymentWithEvents,
} from "../payments/service.ts";
import { reserveBaseCctpOperation } from "../../src/server/base-cctp.ts";
import { trustedCctpBurnIntent } from "./base-payments.ts";
import {
  createStellarPaymentExecutionSession,
  stellarPaymentSessionCookie,
  STELLAR_PAYMENT_RELAYER_PATH,
} from "../payments/stellar-execution-session.ts";
import { reconcileStellarDirectPayment } from "../payments/stellar-reconciliation.ts";
import { createAuthenticatedHandler, isRecord, jsonResponse, readJson } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";
import { clearAgentPassSessionCookie } from "../agent-pass/execution-session.ts";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";
import { stellarCctpConfigFromEnvironment } from "../../src/stellar/cctp.ts";
import { normalizeStellarUsdcAmount } from "../../src/stellar/usdc.ts";
import { getSqlClient } from "../db/client.ts";

type ReconcileStellarPayment = typeof reconcileStellarDirectPayment;
type CreateExecutionSession = typeof createStellarPaymentExecutionSession;
type GetPayment = typeof getPaymentWithEvents;
type ReserveCctp = typeof reserveBaseCctpOperation;

const APPROVAL_VALIDITY_LEDGERS = 720;

async function existingCctpApproval(paymentId: string): Promise<"pending" | "succeeded" | null> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT status FROM stellar_relayer_requests
    WHERE approval_payment_id = ${paymentId}::uuid
      AND operation_kind = 'cctp_approval'
      AND status IN ('pending', 'succeeded')
    ORDER BY created_at DESC LIMIT 1
  `;
  const status = rows[0]?.status;
  return status === "pending" || status === "succeeded" ? status : null;
}

/** Read only; any unavailable or malformed ledger/allowance evidence fails closed. */
async function readStellarCctpAllowance(smartAccount: string): Promise<{
  readonly allowanceRaw: bigint;
  readonly latestLedger: number;
}> {
  const config = stellarCctpConfigFromEnvironment();
  const sponsorSecret = process.env.STELLAR_FEE_SPONSOR_SECRET;
  if (!sponsorSecret) throw new PaymentProviderUnavailableError();
  const server = new rpc.Server(config.rpcUrl);
  let source: Account;
  try {
    source = await server.getAccount(Keypair.fromSecret(sponsorSecret).publicKey());
  } catch {
    throw new PaymentProviderUnavailableError();
  }
  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
  }).addOperation(new Contract(config.usdcContract).call(
    "allowance", new Address(smartAccount).toScVal(), new Address(config.tokenMessenger).toScVal(),
  )).setTimeout(60).build();
  const simulation = await server.simulateTransaction(transaction);
  const allowance = rpc.Api.isSimulationSuccess(simulation) && simulation.result
    ? scValToNative(simulation.result.retval) as unknown : null;
  if (typeof allowance !== "bigint" || allowance < 0n ||
      !Number.isSafeInteger(simulation.latestLedger) || simulation.latestLedger <= 0) {
    throw new PaymentProviderUnavailableError();
  }
  return { allowanceRaw: allowance, latestLedger: simulation.latestLedger };
}

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
      response.headers.append("set-cookie", clearAgentPassSessionCookie());
      response.headers.append("set-cookie", stellarPaymentSessionCookie(session.token));
      return response;
    },
    paymentErrorResponse,
  );
}

export function createStellarCctpPaymentAuthorizationHandler(
  options: {
    readonly authenticate?: AuthenticateRequest;
    readonly createSession?: CreateExecutionSession;
    readonly getPayment?: GetPayment;
    readonly reserveCctp?: ReserveCctp;
    readonly readAllowance?: typeof readStellarCctpAllowance;
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
      const payment = await (options.getPayment ?? getPaymentWithEvents)(user, body.paymentId);
      if (payment.route_id !== "stellar_to_base") {
        return jsonResponse({ error: "unsupported_payment_route" }, 409);
      }
      const burn = trustedCctpBurnIntent(payment);
      await (options.reserveCctp ?? reserveBaseCctpOperation)({
        paymentId: body.paymentId,
        ...burn,
      });
      if (typeof payment.source_address !== "string") throw new PaymentConflictError("The verified Stellar source wallet is missing");
      const allowance = await (options.readAllowance ?? readStellarCctpAllowance)(payment.source_address);
      if (allowance.allowanceRaw < normalizeStellarUsdcAmount(burn.burnAmount).raw) {
        return jsonResponse({
          error: "stellar_cctp_approval_required",
          message: "An exact, expiring Circle TokenMessenger approval is required before this burn can be authorized.",
        }, 409);
      }
      const session = await (options.createSession ?? createStellarPaymentExecutionSession)(
        user,
        body.paymentId,
      );
      const response = jsonResponse({
        status: "authorization_ready",
        relayerUrl: STELLAR_PAYMENT_RELAYER_PATH,
        expiresAt: session.expiresAt,
        burn,
      }, 201);
      response.headers.append("set-cookie", clearAgentPassSessionCookie());
      response.headers.append("set-cookie", stellarPaymentSessionCookie(session.token));
      return response;
    },
    paymentErrorResponse,
  );
}

export function createStellarCctpApprovalAuthorizationHandler(
  options: {
    readonly authenticate?: AuthenticateRequest;
    readonly createSession?: CreateExecutionSession;
    readonly getPayment?: GetPayment;
    readonly reserveCctp?: ReserveCctp;
    readonly readAllowance?: typeof readStellarCctpAllowance;
    readonly getConfig?: typeof stellarCctpConfigFromEnvironment;
    readonly existingApproval?: typeof existingCctpApproval;
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
      const payment = await (options.getPayment ?? getPaymentWithEvents)(user, body.paymentId);
      if (payment.route_id !== "stellar_to_base" || payment.status !== "awaiting_confirmation" ||
          typeof payment.source_address !== "string") {
        return jsonResponse({ error: "payment_state_conflict" }, 409);
      }
      const burn = trustedCctpBurnIntent(payment);
      await (options.reserveCctp ?? reserveBaseCctpOperation)({ paymentId: body.paymentId, ...burn });
      const amountRaw = normalizeStellarUsdcAmount(burn.burnAmount).raw;
      const allowance = await (options.readAllowance ?? readStellarCctpAllowance)(payment.source_address);
      if (allowance.allowanceRaw >= amountRaw) {
        return jsonResponse({ status: "already_approved", message: "The exact burn already has sufficient on-chain allowance. Review the payment again before submitting." }, 200);
      }
      const existing = await (options.existingApproval ?? existingCctpApproval)(body.paymentId);
      if (existing) {
        return jsonResponse({
          error: "stellar_cctp_approval_pending",
          message: existing === "pending"
            ? "An approval attempt for this payment is still unresolved. Check its on-chain status before requesting another."
            : "The earlier approval for this payment is no longer sufficient. Create a fresh payment review; do not resubmit the same approval.",
        }, 409);
      }
      const expirationLedger = allowance.latestLedger + APPROVAL_VALIDITY_LEDGERS;
      if (!Number.isSafeInteger(expirationLedger) || expirationLedger > 0xffff_ffff) {
        throw new PaymentProviderUnavailableError();
      }
      const session = await (options.createSession ?? createStellarPaymentExecutionSession)(
        user, body.paymentId, "cctp_approval",
      );
      const response = jsonResponse({
        status: "approval_authorization_ready",
        relayerUrl: STELLAR_PAYMENT_RELAYER_PATH,
        expiresAt: session.expiresAt,
        approval: {
          owner: payment.source_address,
          spender: (options.getConfig ?? stellarCctpConfigFromEnvironment)().tokenMessenger,
          amount: burn.burnAmount,
          expirationLedger,
          paymentId: body.paymentId,
        },
      }, 201);
      response.headers.append("set-cookie", clearAgentPassSessionCookie());
      response.headers.append("set-cookie", stellarPaymentSessionCookie(session.token));
      return response;
    },
    paymentErrorResponse,
  );
}

export function createStellarCctpApprovalStatusHandler(
  options: {
    readonly authenticate?: AuthenticateRequest;
    readonly getPayment?: GetPayment;
    readonly readAllowance?: typeof readStellarCctpAllowance;
  } = {},
) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);
      const paymentId = new URL(request.url).searchParams.get("id") ?? "";
      const payment = await (options.getPayment ?? getPaymentWithEvents)(user, paymentId);
      if (payment.route_id !== "stellar_to_base" || typeof payment.source_address !== "string") {
        return jsonResponse({ error: "unsupported_payment_route" }, 409);
      }
      const burn = trustedCctpBurnIntent(payment);
      const allowance = await (options.readAllowance ?? readStellarCctpAllowance)(payment.source_address);
      const neededRaw = normalizeStellarUsdcAmount(burn.burnAmount).raw;
      return jsonResponse({
        status: allowance.allowanceRaw >= neededRaw ? "ready" : "insufficient",
        amount: burn.burnAmount,
        latestLedger: allowance.latestLedger,
      });
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
    (error) => error instanceof PaymentProviderUnavailableError
      ? jsonResponse({ error: "stellar_reconciliation_unavailable" }, 503)
      : paymentErrorResponse(error),
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
