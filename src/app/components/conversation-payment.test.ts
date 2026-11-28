import { describe, expect, it } from "vitest";

import {
  parseAuthorizationReady,
  parseCompletedPaymentReceipt,
  mergeVerifiedBalanceSnapshots,
  parsePaymentReview,
  parseResumableBaseCctpReview,
  parseResumableStellarCctpReview,
  parseReconciliation,
  parseVerifiedBalances,
} from "./conversation-payment.ts";

describe("conversation financial response parsing", () => {
  it("restores only the exact authorized Base CCTP review with no recorded burn", () => {
    const id = "e6829ba5-616a-4696-96a4-6a252d1ac5d2";
    const persisted = { payment: {
      id, status: "authorized", routeId: "base_to_stellar",
      sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard",
      recipientAddress: "CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R",
      expectedRecipientAmount: "0.100000000000000000",
      fees: [{ kind: "provider", amount: "0", asset: "USDC", payer: "sender", label: "Circle CCTP Standard fee" }],
      reasons: ["explicit_user_instruction"],
      sourceTransactionHash: null, destinationTransactionHash: null,
      events: [{ stage: "authorization", status: "authorized" }],
    } };
    expect(parseResumableBaseCctpReview(persisted, id)).toMatchObject({
      id, status: "authorized", routeId: "base_to_stellar",
      expectedRecipientAmount: "0.100000000000000000",
    });
    expect(parseResumableBaseCctpReview(persisted, "another-id")).toBeNull();
    expect(parseResumableBaseCctpReview({ payment: { ...persisted.payment, sourceTransactionHash: "a".repeat(64) } }, id)).toBeNull();
    expect(parseResumableBaseCctpReview({ payment: { ...persisted.payment, status: "completed" } }, id)).toBeNull();
    expect(parseResumableBaseCctpReview({ payment: { ...persisted.payment, events: [] } }, id)).toBeNull();
  });

  it("restores only the exact hashless Stellar CCTP review for separate approval", () => {
    const id = "e46fc276-6f38-4aeb-a392-0f9ab270de11";
    const payment = {
      id, status: "awaiting_confirmation", routeId: "stellar_to_base",
      sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard",
      recipientAddress: "0x1234567890123456789012345678901234567890",
      expectedRecipientAmount: "0.100000000000000000",
      fees: [{ kind: "provider", amount: "0.0531450", asset: "USDC", payer: "sender", label: "Circle forward fee" }],
      reasons: ["explicit_user_instruction"],
      sourceTransactionHash: null, destinationTransactionHash: null,
      events: [{ stage: "review", status: "awaiting_confirmation" }],
    };
    const persisted = { payment };
    expect(parseResumableStellarCctpReview(persisted, id)).toMatchObject({
      id, status: "awaiting_confirmation", routeId: "stellar_to_base",
      expectedRecipientAmount: "0.100000000000000000",
    });
    expect(parseResumableStellarCctpReview(persisted, "another-id")).toBeNull();
    expect(parseResumableStellarCctpReview({ payment: { ...payment, sourceTransactionHash: "a".repeat(64) } }, id)).toBeNull();
    expect(parseResumableStellarCctpReview({ payment: { ...payment, status: "completed" } }, id)).toBeNull();
    expect(parseResumableStellarCctpReview({ payment: { ...payment, routeId: "base_to_stellar" } }, id)).toBeNull();
  });

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
