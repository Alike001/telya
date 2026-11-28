import "server-only";

import {
  agentPassRuleIdFromReturnValue,
  parseStellarRelayerRequest,
  StellarRelayerError,
  submitStellarRelayerTransaction,
  validateStellarRelayerSubmission,
} from "../../../../stellar/relayer";
import {
  stellarUsdcAmountFromRawUnits,
  verifyStellarUsdcTransfer,
} from "../../../../stellar/usdc";
import {
  assertActiveAgentPassForTransfer,
  assertStellarPaymentRequestLink,
  completeStellarAgentPassCreation,
  completeStellarAgentPassRevocation,
  completeStellarUsdcTransferRequest,
  completeStellarRelayerRequest,
  recordStellarCctpBurnAuthorization,
  recordStellarCctpBurnSubmission,
  recordStellarCctpApprovalAuthorization,
  recordStellarCctpApprovalSubmission,
  assertStellarCctpApprovalRequestLink,
  recordStellarAgentPassAuthorization,
  recordStellarUsdcTransferAuthorization,
  recordStellarUsdcTransferSubmission,
  recordVerifiedAgentPassSpend,
  reserveStellarRelayerRequest,
  stellarRelayerRequestIdentity,
  linkStellarPaymentAuthorization,
  linkStellarCctpPaymentAuthorization,
  validateStellarCctpPaymentAuthorization,
  validateStellarPaymentAuthorization,
} from "../../../../server/stellar-relayer-requests";
import {
  AuthenticationError,
  AuthenticationUnavailableError,
  authenticateRequest,
} from "../../../../../server/auth/privy";
import { rpc } from "@stellar/stellar-sdk";

function errorResponse(error: unknown): Response {
  if (error instanceof AuthenticationError) {
    return Response.json(
      { success: false, error: "Authentication is required", errorCode: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof AuthenticationUnavailableError) {
    return Response.json(
      { success: false, error: "Authentication is temporarily unavailable", errorCode: "AUTHENTICATION_UNAVAILABLE" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof StellarRelayerError) {
    return Response.json(
      { success: false, error: error.message, errorCode: error.code },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      {
        success: false,
        error: "Invalid relayer request",
        errorCode: "INVALID_REQUEST",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      success: false,
      error: "The Stellar relayer is temporarily unavailable",
      errorCode: "RELAYER_UNAVAILABLE",
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

export async function handleStellarRelayerRequest(
  request: Request,
  context?:
    | { readonly userId: string; readonly paymentId: string; readonly purpose?: "payment" | "cctp_approval" }
    | { readonly deployment: { readonly userId: string } }
    | { readonly agentPass: {
        readonly userId: string;
        readonly kind: "create" | "revoke";
        readonly smartAccount: string;
        readonly contextRuleId?: number;
      } },
): Promise<Response> {
  const paymentContext = context && "paymentId" in context ? context : undefined;
  const deploymentContext = context && "deployment" in context ? context.deployment : undefined;
  const agentPassContext = context && "agentPass" in context ? context.agentPass : undefined;
  let reservedRequestHash: string | undefined;
  let submittedTransfer:
    | { readonly transactionHash: string; readonly ledger: number }
    | undefined;
  let submittedOperation:
    | { readonly transactionHash: string; readonly ledger: number }
    | undefined;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isSafeInteger(contentLength) || contentLength > 48_000) {
      throw new StellarRelayerError(
        "INVALID_REQUEST",
        "Invalid relayer request",
        413,
      );
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new StellarRelayerError(
        "FORBIDDEN_DEPLOYMENT",
        "Origin is not allowed",
        403,
      );
    }
    const submission = parseStellarRelayerRequest(await request.json());
    if (
      paymentContext && submission.paymentId &&
      submission.paymentId !== paymentContext.paymentId
    ) {
      throw new StellarRelayerError(
        "PAYMENT_MISMATCH",
        "The relayer payment context does not match the request",
        409,
      );
    }
    const paymentId = paymentContext?.paymentId ?? submission.paymentId;
    const validated = validateStellarRelayerSubmission(submission, {
      accountWasmHash: process.env.STELLAR_ACCOUNT_WASM_HASH?.toLowerCase() ?? "",
      webauthnVerifierAddress: process.env.STELLAR_WEBAUTHN_VERIFIER ?? "",
      ed25519VerifierAddress: process.env.STELLAR_ED25519_VERIFIER ?? "",
      spendingLimitPolicyAddress:
        process.env.STELLAR_SPENDING_LIMIT_POLICY ?? "",
      usdcContract: process.env.STELLAR_USDC_SAC ?? "",
      cctpTokenMessenger: process.env.CCTP_STELLAR_TOKEN_MESSENGER ?? "",
      baseDomain: Number(process.env.CCTP_BASE_DOMAIN),
    });
    const paymentPurpose = paymentContext?.purpose ?? "payment";
    const isAgentPassOperation = validated.kind === "agent_pass_create" ||
      validated.kind === "agent_pass_revoke";
    if (validated.kind === "deployment" && !deploymentContext) {
      throw new AuthenticationError("Authenticated deployment authorization is required");
    }
    if ((validated.kind === "usdc_transfer" || validated.kind === "cctp_burn" || validated.kind === "cctp_approval") && !paymentContext) {
      throw new AuthenticationError("Authenticated payment authorization is required");
    }
    if (paymentContext && (validated.kind === "cctp_approval") !== (paymentPurpose === "cctp_approval")) {
      throw new StellarRelayerError("PAYMENT_MISMATCH", "Approval and payment authorizations cannot be interchanged", 409);
    }
    if (isAgentPassOperation && !agentPassContext) {
      throw new AuthenticationError("Authenticated Agent Pass authorization is required");
    }
    if (agentPassContext) {
      const expectedKind = validated.kind === "agent_pass_create" ? "create"
        : validated.kind === "agent_pass_revoke" ? "revoke" : null;
      if (
        expectedKind !== agentPassContext.kind ||
        !isAgentPassOperation ||
        validated.smartAccount !== agentPassContext.smartAccount ||
        (validated.kind === "agent_pass_revoke" &&
          validated.contextRuleId !== agentPassContext.contextRuleId)
      ) {
        throw new StellarRelayerError(
          "INVALID_REQUEST",
          "The Agent Pass operation does not match its authenticated authorization",
          409,
        );
      }
    }
    if (paymentId && validated.kind !== "usdc_transfer" && validated.kind !== "cctp_burn" && validated.kind !== "cctp_approval") {
      throw new StellarRelayerError(
        "INVALID_REQUEST",
        "A payment ID is accepted only for a USDC transfer",
        400,
      );
    }
    const paymentUserId = (validated.kind === "usdc_transfer" || validated.kind === "cctp_burn" || validated.kind === "cctp_approval") && paymentId
      ? paymentContext?.userId ?? (await authenticateRequest(request)).id
      : null;
    if (validated.kind === "cctp_approval") {
      const latest = await new rpc.Server(process.env.STELLAR_RPC_URL ?? "").getLatestLedger();
      if (validated.expirationLedger <= latest.sequence ||
          validated.expirationLedger > latest.sequence + 720) {
        throw new StellarRelayerError("PAYMENT_MISMATCH", "CCTP allowance approval has expired or exceeds its short validity", 409);
      }
    }
    if (paymentUserId && paymentId && validated.kind === "usdc_transfer") {
      await validateStellarPaymentAuthorization(
        paymentUserId,
        paymentId,
        validated,
      );
    }
    if (paymentUserId && paymentId && validated.kind === "cctp_burn") {
      await validateStellarCctpPaymentAuthorization(
        paymentUserId,
        paymentId,
        validated,
      );
    }
    const forwardedFor = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const clientAddress =
      forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
    const identity = stellarRelayerRequestIdentity(
      submission.func,
      submission.auth,
      clientAddress,
    );
    const reservation = await reserveStellarRelayerRequest(
      identity.requestHash,
      identity.clientKeyHash,
    );
    if (reservation.decision === "succeeded") {
      if (paymentUserId && paymentId) {
        if (validated.kind === "cctp_approval") {
          await assertStellarCctpApprovalRequestLink(paymentUserId, paymentId, identity.requestHash);
        } else {
          await assertStellarPaymentRequestLink(paymentUserId, paymentId, identity.requestHash);
        }
      }
      return Response.json(
        { success: true, hash: reservation.transactionHash, status: "SUCCESS" },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (reservation.decision === "in_progress") {
      throw new StellarRelayerError(
        "SUBMISSION_FAILED",
        "This sponsored Stellar operation is already in progress",
        409,
      );
    }
    if (reservation.decision === "limit_reached") {
      throw new StellarRelayerError(
        "FEE_LIMIT_EXCEEDED",
        "The Testnet sponsor daily limit has been reached",
        429,
      );
    }
    reservedRequestHash = identity.requestHash;
    if (validated.kind === "cctp_approval") {
      if (!paymentUserId || !paymentId) throw new AuthenticationError("Approval requires an owned payment");
      await recordStellarCctpApprovalAuthorization(paymentUserId, paymentId, identity.requestHash, validated);
    }
    if (validated.kind === "usdc_transfer") {
      await assertActiveAgentPassForTransfer(validated);
      await recordStellarUsdcTransferAuthorization(identity.requestHash, validated);
      if (paymentUserId && paymentId) {
        await linkStellarPaymentAuthorization(
          paymentUserId,
          paymentId,
          identity.requestHash,
          validated,
        );
      }
    }
    if (validated.kind === "cctp_burn") {
      // A finalized burn is source evidence only. The Circle coordinator
      // verifies the attestation and destination before completing payment.
      await recordStellarCctpBurnAuthorization(identity.requestHash, validated);
      if (paymentUserId && paymentId) {
        await linkStellarCctpPaymentAuthorization(
          paymentUserId,
          paymentId,
          identity.requestHash,
          validated,
        );
      }
    }
    if (
      validated.kind === "agent_pass_create" ||
      validated.kind === "agent_pass_revoke"
    ) {
      await recordStellarAgentPassAuthorization(identity.requestHash, validated);
    }
    const result = await submitStellarRelayerTransaction(validated);
    submittedOperation = {
      transactionHash: result.hash,
      ledger: result.ledger,
    };
    if (validated.kind === "usdc_transfer") {
      submittedTransfer = {
        transactionHash: result.hash,
        ledger: result.ledger,
      };
      await recordStellarUsdcTransferSubmission(
        identity.requestHash,
        submittedTransfer,
      );
      const verification = await verifyStellarUsdcTransfer({
        rpc: new rpc.Server(process.env.STELLAR_RPC_URL ?? ""),
        txHash: result.hash,
        tokenContract: validated.tokenContract,
        expectedSender: validated.sender,
        expectedRecipient: validated.recipient,
        expectedAmount: stellarUsdcAmountFromRawUnits(validated.amountRaw),
      });
      if (verification.status !== "verified") {
        throw new StellarRelayerError(
          "SUBMISSION_FAILED",
          "The Stellar transaction finalized without exact recipient and amount verification",
          502,
        );
      }
      await completeStellarUsdcTransferRequest(identity.requestHash, {
        transactionHash: result.hash,
        ledger: verification.ledger,
        recipient: verification.recipient,
        amountRaw: validated.amountRaw,
      });
      await recordVerifiedAgentPassSpend(validated, result.hash);
    } else if (validated.kind === "cctp_burn") {
      await recordStellarCctpBurnSubmission(identity.requestHash, {
        transactionHash: result.hash,
        ledger: result.ledger,
      });
      await completeStellarRelayerRequest(identity.requestHash, {
        status: "succeeded",
        transactionHash: result.hash,
      });
    } else if (validated.kind === "cctp_approval") {
      await recordStellarCctpApprovalSubmission(identity.requestHash, result.hash);
      await completeStellarRelayerRequest(identity.requestHash, {
        status: "succeeded",
        transactionHash: result.hash,
      });
    } else if (validated.kind === "agent_pass_create") {
      await completeStellarAgentPassCreation(identity.requestHash, validated, {
        transactionHash: result.hash,
        ruleId: agentPassRuleIdFromReturnValue(result.returnValue),
      });
    } else if (validated.kind === "agent_pass_revoke") {
      await completeStellarAgentPassRevocation(
        identity.requestHash,
        validated,
        result.hash,
      );
    } else {
      await completeStellarRelayerRequest(identity.requestHash, {
        status: "succeeded",
        transactionHash: result.hash,
      });
    }
    return Response.json(
      { success: true, hash: result.hash, status: "SUCCESS" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (reservedRequestHash && !submittedOperation) {
      const failureCode =
        error instanceof StellarRelayerError ? error.code : "RELAYER_UNAVAILABLE";
      try {
        await completeStellarRelayerRequest(reservedRequestHash, {
          status: "failed",
          failureCode,
        });
      } catch {
        // Preserve the original failure response. A stale pending reservation
        // fails closed and can be reconciled by an operator.
      }
    }
    if (submittedOperation) {
      // The on-chain operation already finalized. Return its hash so the SDK
      // and UI can reconcile chain state, while the durable receipt remains
      // failed instead of claiming unverified completion.
      return Response.json(
        {
          success: true,
          hash: submittedOperation.transactionHash,
          status: "SUCCESS",
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return errorResponse(error);
  }
}
