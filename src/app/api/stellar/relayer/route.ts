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
  completeStellarAgentPassCreation,
  completeStellarAgentPassRevocation,
  completeStellarUsdcTransferRequest,
  completeStellarRelayerRequest,
  recordStellarCctpBurnAuthorization,
  recordStellarCctpBurnSubmission,
  recordStellarAgentPassAuthorization,
  recordStellarUsdcTransferAuthorization,
  recordStellarUsdcTransferSubmission,
  recordVerifiedAgentPassSpend,
  reserveStellarRelayerRequest,
  stellarRelayerRequestIdentity,
} from "../../../../server/stellar-relayer-requests";
import { rpc } from "@stellar/stellar-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function errorResponse(error: unknown): Response {
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

export async function POST(request: Request): Promise<Response> {
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
    if (validated.kind === "usdc_transfer") {
      await assertActiveAgentPassForTransfer(validated);
      await recordStellarUsdcTransferAuthorization(identity.requestHash, validated);
    }
    if (validated.kind === "cctp_burn") {
      // The finalized burn is source evidence only. Issue #16's Circle
      // coordinator consumes the transaction hash and advances attestation;
      // this endpoint never marks the cross-chain payment complete.
      await recordStellarCctpBurnAuthorization(identity.requestHash, validated);
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
