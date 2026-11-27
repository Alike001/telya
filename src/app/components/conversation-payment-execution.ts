import type {
  ConnectedSmartAccount,
  SmartAccountLifecycleKit,
  SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import type {
  StellarUsdcSubmission,
  StellarUsdcTransferKit,
} from "../../stellar/usdc";
import type {
  StellarCctpConfig,
  StellarCctpSourceKit,
} from "../../stellar/cctp";
import type { Eip1193Provider } from "../../base/evm";
import {
  apiMessage,
  parseAuthorizationReady,
  parseBaseCctpAuthorization,
  parseBaseDirectAuthorization,
  parseBaseToStellarReconciliation,
  parseCctpAuthorizationReady,
  parseCctpReconciliation,
  parseCompletedPaymentReceipt,
  parseReconciliation,
  parseStellarCctpConfig,
} from "./conversation-payment";
import type {
  PaymentExecutionResult,
  PaymentReview,
} from "./conversation-payment";

export type AuthenticatedRequest = (input: string, init: RequestInit) => Promise<Response>;
type ConversationPaymentKit = StellarUsdcTransferKit & SmartAccountLifecycleKit;
type ConversationCctpKit = ConversationPaymentKit & StellarCctpSourceKit;

function equalAmount(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

function baseUsdcUnits(value: string): bigint | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,18}))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  // PostgreSQL renders numeric(38,18) with trailing zeroes. Accept those
  // canonical zeroes without rounding a nonzero sub-micro-USDC amount.
  if (fraction.length > 6 && /[1-9]/.test(fraction.slice(6))) return null;
  return BigInt(match[1]!) * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, "0") || "0");
}

function baseCctpAuthorizationMatchesReview(
  review: PaymentReview,
  authorization: { readonly burnAmount: string; readonly maxFee: string },
): boolean {
  const expected = baseUsdcUnits(review.expectedRecipientAmount);
  const burn = baseUsdcUnits(authorization.burnAmount);
  const maxFee = baseUsdcUnits(authorization.maxFee);
  if (expected === null || burn === null || maxFee === null) return false;
  let reviewedFee = 0n;
  for (const fee of review.fees) {
    if (fee.kind !== "provider" || fee.asset !== "USDC" || fee.payer !== "sender") continue;
    const units = baseUsdcUnits(fee.amount);
    if (units === null) return false;
    reviewedFee += units;
  }
  return maxFee === reviewedFee && burn === expected + reviewedFee;
}

async function completedReceipt(
  review: PaymentReview,
  transactionHash: string,
  request: AuthenticatedRequest,
  pendingMessage: string,
): Promise<PaymentExecutionResult> {
  const receiptResponse = await request(
    `/api/payments?id=${encodeURIComponent(review.id)}`,
    { cache: "no-store", credentials: "same-origin" },
  );
  const receiptPayload: unknown = await receiptResponse.json();
  const completed = receiptResponse.ok
    ? parseCompletedPaymentReceipt(receiptPayload, review, transactionHash)
    : null;
  return completed ?? {
    status: "pending",
    transactionHash,
    message: pendingMessage,
  };
}

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
  return completedReceipt(
    review,
    reconciliation.transactionHash,
    request,
    "Stellar finalized, but the canonical recipient and amount receipt is not available yet.",
  );
}

export async function reconcileConversationCctpPayment(
  review: PaymentReview,
  submittedSourceHash: string | undefined,
  request: AuthenticatedRequest,
): Promise<PaymentExecutionResult> {
  const response = await request(
    `/api/payments/base/cctp/source?id=${encodeURIComponent(review.id)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submittedSourceHash
        ? { sourceTransactionHash: submittedSourceHash }
        : {}),
    },
  );
  const payload: unknown = await response.json();
  const reconciliation = response.ok || response.status === 202
    ? parseCctpReconciliation(payload)
    : null;
  if (!reconciliation) {
    throw new Error(apiMessage(
      payload,
      "The cross-chain payment status could not be verified. Do not submit it again.",
    ));
  }
  if (submittedSourceHash && reconciliation.status !== "completed" &&
      reconciliation.sourceTransactionHash !== submittedSourceHash.replace(/^0x/i, "").toLowerCase()) {
    throw new Error("The persisted Stellar burn hash does not match this submission. Do not submit again.");
  }
  if (reconciliation.status !== "completed") {
    return {
      status: "pending",
      transactionHash: reconciliation.sourceTransactionHash,
      message: "The Stellar burn is recorded. Circle attestation, Base finality, and exact recipient verification are still pending.",
    };
  }
  return completedReceipt(
    review,
    reconciliation.destinationTransactionHash,
    request,
    "Circle forwarded the Base mint, but the canonical recipient and amount receipt is not available yet.",
  );
}

export async function reconcileConversationBaseDirectPayment(
  review: PaymentReview,
  transactionHash: string,
  request: AuthenticatedRequest,
): Promise<PaymentExecutionResult> {
  const response = await request(`/api/payments/base/direct?id=${encodeURIComponent(review.id)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactionHash }),
  });
  const payload: unknown = await response.json();
  const result = response.ok || response.status === 202 ? parseReconciliation(payload) : null;
  if (!result || result.status === "failed" ||
      result.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
    throw new Error(apiMessage(payload, "The Base payment hash could not be verified. Do not submit again."));
  }
  if (result.status === "pending") {
    return {
      status: "pending",
      transactionHash: result.transactionHash,
      message: "The Base USDC transfer is recorded. Finality and exact recipient verification are still pending.",
    };
  }
  return completedReceipt(
    review,
    result.transactionHash,
    request,
    "Base finalized, but the canonical recipient and amount receipt is not available yet.",
  );
}

export async function reconcileConversationBaseToStellarPayment(
  review: PaymentReview,
  sourceTransactionHash: string,
  request: AuthenticatedRequest,
): Promise<PaymentExecutionResult> {
  const response = await request(`/api/payments/base/cctp/source?id=${encodeURIComponent(review.id)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceTransactionHash }),
  });
  const payload: unknown = await response.json();
  const result = response.ok || response.status === 202
    ? parseBaseToStellarReconciliation(payload)
    : null;
  if (!result) {
    throw new Error(apiMessage(payload, "The Base CCTP status could not be verified. Do not submit again."));
  }
  if (result.status !== "completed") {
    if (result.sourceTransactionHash !== sourceTransactionHash.toLowerCase()) {
      throw new Error("The persisted Base burn hash differs from this wallet submission. Do not submit again.");
    }
    return {
      status: "pending",
      transactionHash: result.sourceTransactionHash,
      message: "The Base burn is recorded. Base finality, Circle attestation, Stellar settlement, and recipient verification are still pending.",
    };
  }
  return completedReceipt(
    review,
    result.destinationTransactionHash,
    request,
    "Stellar settlement finalized, but the canonical recipient and amount receipt is not available yet.",
  );
}

export async function executeConversationPayment(
  review: PaymentReview,
  input: {
    readonly config: SmartAccountPublicConfig | null;
    readonly smartAccount: ConnectedSmartAccount | null;
    readonly request: AuthenticatedRequest;
    readonly createKit: (config: SmartAccountPublicConfig) => ConversationPaymentKit;
    readonly restoreAccount: (kit: ConversationPaymentKit) => Promise<ConnectedSmartAccount | null>;
    readonly submitTransfer: (input: {
      readonly kit: ConversationPaymentKit;
      readonly tokenContract: string;
      readonly recipient: string;
      readonly amount: string;
    }) => Promise<StellarUsdcSubmission>;
    readonly submitCctpBurn?: (input: {
      readonly kit: ConversationCctpKit;
      readonly config: StellarCctpConfig;
      readonly recipient: string;
      readonly burnAmount: string;
      readonly maxFee: string;
    }) => Promise<{ readonly txHash: string }>;
    readonly getBaseProvider?: (sender: string) => Promise<Eip1193Provider>;
    readonly submitBaseTransfer?: (input: {
      readonly provider: Eip1193Provider;
      readonly sender: string;
      readonly recipient: string;
      readonly amount: string;
    }) => Promise<string>;
    readonly submitBaseCctpBurn?: (input: {
      readonly provider: Eip1193Provider;
      readonly sender: string;
      readonly burnAmount: string;
      readonly maxFee: string;
      readonly destinationDomain: number;
      readonly mintRecipient: string;
    }) => Promise<{ readonly transactionHash: string; readonly approvalTransactionHash?: string }>;
  },
): Promise<PaymentExecutionResult> {
  if (review.routeId === "base_to_base" && review.sourceNetwork === "base" && review.destinationNetwork === "base") {
    if (!input.getBaseProvider || !input.submitBaseTransfer) throw new Error("Base wallet execution is unavailable.");
    const response = await input.request(`/api/payments/base/direct?id=${encodeURIComponent(review.id)}`, {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}",
    });
    const payload: unknown = await response.json();
    const authorization = response.ok ? parseBaseDirectAuthorization(payload) : null;
    if (!authorization || authorization.recipient !== review.recipientAddress.toLowerCase() ||
        !equalAmount(authorization.amount, review.expectedRecipientAmount)) {
      throw new Error(apiMessage(payload, "The Base payment authorization does not match this review."));
    }
    const provider = await input.getBaseProvider(authorization.sender);
    let transactionHash: string;
    try {
      transactionHash = await input.submitBaseTransfer({ provider, ...authorization });
    } catch {
      return {
        status: "status_unknown", transactionHash: null,
        message: "Base wallet submission did not return a verifiable hash. Check the wallet and Activity before creating another payment.",
      };
    }
    try {
      return await reconcileConversationBaseDirectPayment(review, transactionHash, input.request);
    } catch {
      return {
        status: "unverified", transactionHash,
        message: "The Base wallet returned a hash without canonical payment verification. Do not submit again.",
      };
    }
  }
  if (review.routeId === "base_to_stellar" && review.sourceNetwork === "base" && review.destinationNetwork === "stellar") {
    if (!input.getBaseProvider || !input.submitBaseCctpBurn) throw new Error("Base-to-Stellar wallet execution is unavailable.");
    const response = await input.request(`/api/payments/base/cctp/authorize?id=${encodeURIComponent(review.id)}`, {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}",
    });
    const payload: unknown = await response.json();
    const authorization = response.ok ? parseBaseCctpAuthorization(payload) : null;
    if (!authorization || !baseCctpAuthorizationMatchesReview(review, authorization)) {
      throw new Error(apiMessage(payload, "The Base CCTP authorization does not match this review."));
    }
    const provider = await input.getBaseProvider(authorization.sender);
    let sourceTransactionHash: string;
    try {
      const submitted = await input.submitBaseCctpBurn({ provider, ...authorization });
      sourceTransactionHash = submitted.transactionHash;
    } catch {
      return {
        status: "status_unknown", transactionHash: null,
        message: "Base CCTP submission did not return a verifiable burn hash. Check the wallet and Activity before creating another payment.",
      };
    }
    try {
      return await reconcileConversationBaseToStellarPayment(review, sourceTransactionHash, input.request);
    } catch {
      return {
        status: "unverified", transactionHash: sourceTransactionHash,
        message: "The Base wallet returned a burn hash without canonical cross-chain verification. Do not submit again.",
      };
    }
  }
  if (review.routeId === "stellar_to_base" &&
      review.sourceNetwork === "stellar" && review.destinationNetwork === "base") {
    if (!input.submitCctpBurn) {
      throw new Error("Stellar-to-Base passkey execution is unavailable.");
    }
    const authorizationResponse = await input.request(
      "/api/payments/stellar/cctp/authorize",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: review.id }),
      },
    );
    const authorizationPayload: unknown = await authorizationResponse.json();
    const authorization = authorizationResponse.ok
      ? parseCctpAuthorizationReady(authorizationPayload)
      : null;
    if (!authorization) {
      throw new Error(apiMessage(
        authorizationPayload,
        "This cross-chain payment is not ready for passkey authorization.",
      ));
    }
    const configResponse = await input.request(
      "/api/stellar/cctp/config",
      { cache: "no-store", credentials: "same-origin" },
    );
    const configPayload: unknown = await configResponse.json();
    const cctpConfig = configResponse.ok ? parseStellarCctpConfig(configPayload) : null;
    if (!cctpConfig) {
      throw new Error(apiMessage(configPayload, "Stellar CCTP configuration is unavailable."));
    }
    if (!input.config || !input.smartAccount) throw new Error("Connect the verified Stellar passkey account before authorizing.");
    const paymentKit = input.createKit({
      ...input.config,
      relayerUrl: authorization.relayerUrl,
    }) as ConversationCctpKit;
    const restored = await input.restoreAccount(paymentKit);
    if (!restored || restored.contractId !== input.smartAccount.contractId) {
      throw new Error("The active passkey does not match the verified source wallet for this payment.");
    }
    let sourceTransactionHash: string;
    try {
      const submission = await input.submitCctpBurn({
        kit: paymentKit,
        config: cctpConfig,
        recipient: review.recipientAddress,
        burnAmount: authorization.burnAmount,
        maxFee: authorization.maxFee,
      });
      sourceTransactionHash = submission.txHash;
    } catch {
      try {
        return await reconcileConversationCctpPayment(review, undefined, input.request);
      } catch {
        return {
          status: "status_unknown",
          transactionHash: null,
          message: "The CCTP authorization response was interrupted and persisted status is temporarily unavailable. Do not submit again; refresh the existing payment status.",
        };
      }
    }
    try {
      return await reconcileConversationCctpPayment(
        review,
        sourceTransactionHash,
        input.request,
      );
    } catch {
      return {
        status: "unverified",
        transactionHash: sourceTransactionHash,
        message: "The relayer returned a Stellar burn hash without canonical cross-chain verification. Do not submit again.",
      };
    }
  }
  if (
    review.routeId !== "stellar_to_stellar" ||
    review.sourceNetwork !== "stellar" ||
    review.destinationNetwork !== "stellar"
  ) {
    throw new Error("This route is not available for direct Stellar passkey execution.");
  }
  if (!input.config || !input.smartAccount) {
    throw new Error("Connect the verified Stellar passkey account before authorizing.");
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
