import { describe, expect, it } from "vitest";

import {
  parseAuthorizationReady,
  parseCompletedPaymentReceipt,
  mergeVerifiedBalanceSnapshots,
  parsePaymentReview,
  parseOwnedStellarIdentity,
  parseReconciliation,
  parseVerifiedBalances,
} from "./conversation-payment.ts";

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

  it("replaces only the matching unavailable Base wallet with its independently verified balance", () => {
    const primary = parseVerifiedBalances({ balances: [
      { walletId: "stellar-1", network: "stellar", address: "CACCOUNT", amount: "4.5", status: "verified" },
      { walletId: "base-1", network: "base", address: "0x01", amount: null, status: "unavailable" },
    ] });
    const base = parseVerifiedBalances({ balances: [
      { walletId: "base-1", network: "base", address: "0x01", amount: "2.75", status: "verified" },
    ] });

    expect(mergeVerifiedBalanceSnapshots(primary, base)).toEqual([
      { walletId: "stellar-1", network: "stellar", address: "CACCOUNT", amount: "4.5", status: "verified" },
      { walletId: "base-1", network: "base", address: "0x01", amount: "2.75", status: "verified" },
    ]);
    expect(mergeVerifiedBalanceSnapshots(primary, [])).toEqual(primary);
  });

  it("accepts a restored Stellar account only after an owner-scoped identity lookup", () => {
    expect(parseOwnedStellarIdentity({ found: true, username: "alice" })).toBe(true);
    expect(parseOwnedStellarIdentity({ found: true })).toBe(false);
    expect(parseOwnedStellarIdentity({ found: false, username: "alice" })).toBe(false);
    expect(parseOwnedStellarIdentity({ found: true, username: "   " })).toBe(false);
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

    const parsedReview = parsePaymentReview(review)!;
    const txHash = "a".repeat(64);
    const receipt = {
      payment: {
        id: "payment-1",
        status: "completed",
        recipientAddress: "CRECIPIENT",
        expectedRecipientAmount: "1.250000000000000000",
        verifiedRecipientAddress: "CRECIPIENT",
        verifiedRecipientAmount: "1.250000000000000000",
        destinationTransactionHash: txHash,
        events: [
          { stage: "recipient_verification", status: "recipient_verified", txHash },
          { stage: "completion", status: "completed", txHash },
        ],
      },
    };
    expect(parseCompletedPaymentReceipt(receipt, parsedReview, txHash)).toMatchObject({
      status: "completed",
      transactionHash: txHash,
      verifiedRecipient: "CRECIPIENT",
    });
    expect(parseCompletedPaymentReceipt({
      payment: { ...receipt.payment, verifiedRecipientAddress: "CDIFFERENT" },
    }, parsedReview, txHash)).toBeNull();
    expect(parseCompletedPaymentReceipt({
      payment: { ...receipt.payment, verifiedRecipientAmount: "1.24" },
    }, parsedReview, txHash)).toBeNull();
    expect(parseCompletedPaymentReceipt({
      payment: { ...receipt.payment, destinationTransactionHash: "b".repeat(64) },
    }, parsedReview, txHash)).toBeNull();
  });

  it("accepts only the fixed same-origin relayer and explicit reconciliation states", () => {
    expect(parseAuthorizationReady({
      status: "authorization_ready",
      relayerUrl: "/api/stellar/relayer/payment",
      expiresAt: "2030-01-01T00:00:00.000Z",
    })).not.toBeNull();
    expect(parseAuthorizationReady({
      status: "authorization_ready",
      relayerUrl: "https://attacker.test/relayer",
      expiresAt: "2030-01-01T00:00:00.000Z",
    })).toBeNull();
    expect(parseReconciliation({ status: "pending", transactionHash: "a".repeat(64) })).toEqual({
      status: "pending",
      transactionHash: "a".repeat(64),
    });
    expect(parseReconciliation({ status: "completed", transactionHash: "not-a-hash" })).toBeNull();
  });
});
