import type { SmartAccountKit } from "smart-account-kit";

import type { ActiveAgentPass } from "../../stellar/agent-pass";
import { submitAgentPassTransfer } from "../../stellar/agent-pass";
import {
  apiMessage,
  parseAuthorizationReady,
  parsePaymentReview,
  type PaymentExecutionResult,
  type PaymentReview,
} from "./conversation-payment";
import {
  reconcileConversationPayment,
  type AuthenticatedRequest,
} from "./conversation-payment-execution";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function equalAmount(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

export async function prepareAgentPassPayment(input: {
  readonly recipientInput: string;
  readonly amount: string;
  readonly request: AuthenticatedRequest;
}): Promise<PaymentReview> {
  const message = `Agent Pass payment: send ${input.amount} USDC to ${input.recipientInput} on Stellar`;
  const conversationResponse = await input.request("/api/conversations", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const conversationPayload: unknown = await conversationResponse.json();
  const conversation = record(record(conversationPayload)?.conversation);
  const savedMessage = record(record(conversationPayload)?.message);
  if (!conversationResponse.ok || typeof conversation?.id !== "string" ||
      typeof savedMessage?.id !== "string") {
    throw new Error(apiMessage(
      conversationPayload,
      "The Agent Pass payment request could not be saved.",
    ));
  }

  const paymentResponse = await input.request("/api/payments", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `agent-pass:${savedMessage.id}`,
    },
    body: JSON.stringify({
      conversationId: conversation.id,
      intentMessageId: savedMessage.id,
      inputMode: "manual",
      selectedSourceWalletId: null,
      intent: {
        amount: input.amount,
        asset: "USDC",
        recipientInput: input.recipientInput,
        requestedSourceNetwork: "stellar",
        requestedDestinationNetwork: "stellar",
      },
    }),
  });
  const paymentPayload: unknown = await paymentResponse.json();
  const review = paymentResponse.ok ? parsePaymentReview(paymentPayload) : null;
  if (!review) {
    throw new Error(apiMessage(
      paymentPayload,
      "A verified Agent Pass payment review could not be created.",
    ));
  }
  if (
    review.routeId !== "stellar_to_stellar" ||
    review.sourceNetwork !== "stellar" ||
    review.destinationNetwork !== "stellar" ||
    review.rail !== "stellar_direct" ||
    !equalAmount(review.expectedRecipientAmount, input.amount)
  ) {
    throw new Error("The verified payment review does not match this direct Stellar Agent Pass request.");
  }
  return review;
}

export async function executeAgentPassPayment(input: {
  readonly review: PaymentReview;
  readonly kit: SmartAccountKit;
  readonly pass: ActiveAgentPass;
  readonly tokenContract: string;
  readonly request: AuthenticatedRequest;
  readonly submitTransfer?: typeof submitAgentPassTransfer;
}): Promise<PaymentExecutionResult> {
  const authorizationResponse = await input.request(
    "/api/payments/stellar/direct/authorize",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: input.review.id }),
    },
  );
  const authorizationPayload: unknown = await authorizationResponse.json();
  const authorization = authorizationResponse.ok
    ? parseAuthorizationReady(authorizationPayload)
    : null;
  if (!authorization) {
    throw new Error(apiMessage(
      authorizationPayload,
      "This payment is not ready for Agent Pass authorization.",
    ));
  }

  let result: Awaited<ReturnType<typeof submitAgentPassTransfer>>;
  try {
    result = await (input.submitTransfer ?? submitAgentPassTransfer)({
      kit: input.kit,
      pass: input.pass,
      tokenContract: input.tokenContract,
      recipient: input.review.recipientAddress,
      amount: input.review.expectedRecipientAmount,
    });
  } catch {
    try {
      return await reconcileConversationPayment(input.review, undefined, input.request);
    } catch {
      return {
        status: "status_unknown",
        transactionHash: null,
        message: "The Agent Pass response was interrupted and persisted status is temporarily unavailable. Do not submit again; refresh Activity.",
      };
    }
  }
  if (!result.success) {
    if (!result.hash) {
      return {
        status: "failed",
        transactionHash: null,
        message: result.error.message || "The Agent Pass transfer was rejected before submission.",
      };
    }
    try {
      return await reconcileConversationPayment(input.review, result.hash, input.request);
    } catch {
      return {
        status: "unverified",
        transactionHash: result.hash,
        message: "The Agent Pass transfer returned a hash without canonical payment verification. Do not submit again.",
      };
    }
  }
  const transactionHash = result.hash;

  try {
    return await reconcileConversationPayment(input.review, transactionHash, input.request);
  } catch {
    return {
      status: "unverified",
      transactionHash,
      message: "The relayer returned a Stellar hash without canonical payment verification. Do not submit again.",
    };
  }
}
