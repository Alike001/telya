import type {
  ConnectedSmartAccount,
  SmartAccountLifecycleKit,
  SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import type {
  StellarUsdcSubmission,
  StellarUsdcTransferKit,
} from "../../stellar/usdc";
import {
  apiMessage,
  parseAuthorizationReady,
  parseCompletedPaymentReceipt,
  parseReconciliation,
} from "./conversation-payment";
import type {
  PaymentExecutionResult,
  PaymentReview,
} from "./conversation-payment";

export type AuthenticatedRequest = (input: string, init: RequestInit) => Promise<Response>;
type ConversationPaymentKit = StellarUsdcTransferKit & SmartAccountLifecycleKit;

export async function reconcileConversationPayment(
  review: PaymentReview,
  submittedTransactionHash: string | undefined,
  request: AuthenticatedRequest,
): Promise<PaymentExecutionResult> {
  const response = await request(
    `/api/payments/stellar/direct/reconcile?id=${encodeURIComponent(review.id)}`,
    { method: "POST", credentials: "same-origin" },
  );
  const payload: unknown = await response.json();
  const reconciliation = parseReconciliation(payload);
  if (!reconciliation) {
    throw new Error(apiMessage(
      payload,
      "The submitted payment status could not be verified. Do not submit it again.",
    ));
  }
  if (
    submittedTransactionHash &&
    reconciliation.transactionHash !== submittedTransactionHash
  ) {
    throw new Error("The persisted transaction hash does not match this submission. Do not submit again.");
  }
  if (reconciliation.status === "failed") {
    return {
      status: "failed",
      transactionHash: reconciliation.transactionHash,
      message: `The finalized transaction failed exact payment verification (${reconciliation.reason}).`,
    };
  }
  if (reconciliation.status === "pending") {
    return {
      status: "pending",
      transactionHash: reconciliation.transactionHash,
      message: "Stellar submission is recorded, but final recipient and amount verification is still pending.",
    };
  }
  const receiptResponse = await request(
    `/api/payments?id=${encodeURIComponent(review.id)}`,
    { cache: "no-store", credentials: "same-origin" },
  );
  const receiptPayload: unknown = await receiptResponse.json();
  const completed = receiptResponse.ok
    ? parseCompletedPaymentReceipt(receiptPayload, review, reconciliation.transactionHash)
    : null;
  return completed ?? {
    status: "pending",
    transactionHash: reconciliation.transactionHash,
    message: "Stellar finalized, but the canonical recipient and amount receipt is not available yet.",
  };
}

export async function executeConversationPayment(
  review: PaymentReview,
  input: {
    readonly config: SmartAccountPublicConfig;
    readonly smartAccount: ConnectedSmartAccount;
    readonly request: AuthenticatedRequest;
    readonly createKit: (config: SmartAccountPublicConfig) => ConversationPaymentKit;
    readonly restoreAccount: (kit: ConversationPaymentKit) => Promise<ConnectedSmartAccount | null>;
    readonly submitTransfer: (input: {
      readonly kit: ConversationPaymentKit;
      readonly tokenContract: string;
      readonly recipient: string;
      readonly amount: string;
    }) => Promise<StellarUsdcSubmission>;
  },
): Promise<PaymentExecutionResult> {
  if (
    review.routeId !== "stellar_to_stellar" ||
    review.sourceNetwork !== "stellar" ||
    review.destinationNetwork !== "stellar"
  ) {
    throw new Error("This route is not available for direct Stellar passkey execution.");
  }
  const authorizationResponse = await input.request(
    "/api/payments/stellar/direct/authorize",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: review.id }),
    },
  );
  const authorizationPayload: unknown = await authorizationResponse.json();
  const authorization = authorizationResponse.ok
    ? parseAuthorizationReady(authorizationPayload)
    : null;
  if (!authorization) {
    throw new Error(apiMessage(
      authorizationPayload,
      "This payment is not ready for passkey authorization.",
    ));
  }
  const paymentKit = input.createKit({
    ...input.config,
    relayerUrl: authorization.relayerUrl,
  });
  const restored = await input.restoreAccount(paymentKit);
  if (!restored || restored.contractId !== input.smartAccount.contractId) {
    throw new Error("The active passkey does not match the verified source wallet for this payment.");
  }
  let submission: StellarUsdcSubmission;
  try {
    submission = await input.submitTransfer({
      kit: paymentKit,
      tokenContract: input.config.usdcContract,
      recipient: review.recipientAddress,
      amount: review.expectedRecipientAmount,
    });
  } catch {
    try {
      return await reconcileConversationPayment(review, undefined, input.request);
    } catch {
      return {
        status: "status_unknown",
        transactionHash: null,
        message: "The authorization response was interrupted and persisted status is temporarily unavailable. Do not submit again; refresh the existing payment status.",
      };
    }
  }
  if (submission.status === "failed") {
    if (submission.txHash) {
      try {
        return await reconcileConversationPayment(review, submission.txHash, input.request);
      } catch {
        return {
          status: "unverified",
          transactionHash: submission.txHash,
          message: "The relayer returned a transaction hash without canonical payment verification. Do not submit again.",
        };
      }
    }
    try {
      return await reconcileConversationPayment(review, undefined, input.request);
    } catch {
      return {
        status: "failed",
        transactionHash: null,
        message: `${submission.message} No transaction hash was returned; create a new review only after checking Activity.`,
      };
    }
  }
  return reconcileConversationPayment(review, submission.txHash, input.request);
}
