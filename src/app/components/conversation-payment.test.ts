import { describe, expect, it } from "vitest";

import { parsePaymentReview, parseVerifiedBalances } from "./conversation-payment.ts";

describe("conversation financial response parsing", () => {
  it("accepts only server-verified balances and preserves unavailable networks", () => {
    expect(parseVerifiedBalances({ balances: [
      { walletId: "wallet-1", network: "stellar", address: "CACCOUNT", amount: "4.5", status: "verified" },
      { walletId: "wallet-2", network: "base", address: "0x01", amount: null, status: "unavailable" },
    ] })).toHaveLength(2);
    expect(parseVerifiedBalances({ balances: [{
      walletId: "wallet-1", network: "stellar", address: "CACCOUNT", amount: null, status: "verified",
    }] })).toEqual([]);
  });

  it("accepts only an awaiting-confirmation review and never promotes a hash to success", () => {
    const review = {
      status: "awaiting_confirmation",
      explanation: "Review only. No transaction has been submitted.",
      payment: {
        id: "payment-1", status: "awaiting_confirmation", routeId: "stellar_to_stellar",
        sourceNetwork: "stellar", destinationNetwork: "stellar", rail: "stellar_direct",
        recipientAddress: "CRECIPIENT", expectedRecipientAmount: "1.25",
        fees: [{ kind: "sponsor", amount: "0", asset: "XLM", payer: "sponsor", label: "Sponsored fee" }],
        reasons: ["only_sufficient_balance"],
      },
    };
    expect(parsePaymentReview(review)?.status).toBe("awaiting_confirmation");
    expect(parsePaymentReview({
      ...review, status: "completed",
      payment: { ...review.payment, status: "completed", destinationTransactionHash: "a".repeat(64) },
    })).toBeNull();
    expect(parsePaymentReview({
      ...review, status: "submitted",
      payment: { ...review.payment, status: "submitted", sourceTransactionHash: "a".repeat(64) },
    })).toBeNull();
  });
});
