import { describe, expect, it } from "vitest";

import {
  parsePaymentActivityDetail,
  parsePaymentActivityPage,
} from "./payment-activity";

const paymentId = "11111111-1111-4111-8111-111111111111";
const txHash = "a".repeat(64);
const basePayment = {
  id: paymentId,
  status: "awaiting_confirmation",
  routeId: "stellar_to_stellar",
  sourceNetwork: "stellar",
  destinationNetwork: "stellar",
  rail: "stellar_direct",
  recipientAddress: "CRECIPIENT",
  expectedRecipientAmount: "1.25",
  verifiedRecipientAddress: null,
  verifiedRecipientAmount: null,
  sourceTransactionHash: null,
  destinationTransactionHash: null,
  failureCode: null,
  fees: [{ kind: "sponsor", amount: "0", asset: "XLM", payer: "sponsor", label: "Network fee" }],
  createdAt: "2026-11-26T12:00:00.000Z",
  updatedAt: "2026-11-26T12:00:00.000Z",
};

describe("persisted payment API parsing", () => {
  it("accepts only complete owner-scoped activity pages", () => {
    expect(parsePaymentActivityPage({ payments: [basePayment], nextCursor: null })).toMatchObject({
      payments: [{ id: paymentId, status: "awaiting_confirmation", expectedAmount: "1.25" }],
      nextCursor: null,
    });
    expect(parsePaymentActivityPage({
      payments: [{ ...basePayment, routeId: "unsupported_route" }],
      nextCursor: null,
    })).toBeNull();
    expect(parsePaymentActivityPage({ payments: [basePayment], nextCursor: "not-a-uuid" })).toBeNull();
  });

  it("normalizes persisted database CCTP route names without adding a route", () => {
    const parsed = parsePaymentActivityPage({
      payments: [{
        ...basePayment,
        routeId: "base_to_stellar",
        sourceNetwork: "base",
        destinationNetwork: "stellar",
        rail: "circle_cctp_standard",
      }],
      nextCursor: null,
    });
    expect(parsed?.payments[0]?.route.id).toBe("base_to_stellar_cctp");
  });

  it("recovers an already completed Base-to-Stellar receipt with a bare persisted Base source hash", () => {
    const sourceHash = "e".repeat(64);
    const destinationHash = "d".repeat(64);
    const payment = {
      ...basePayment,
      status: "completed",
      routeId: "base_to_stellar",
      sourceNetwork: "base",
      destinationNetwork: "stellar",
      rail: "circle_cctp_standard",
      verifiedRecipientAddress: basePayment.recipientAddress,
      verifiedRecipientAmount: basePayment.expectedRecipientAmount,
      sourceTransactionHash: sourceHash,
      destinationTransactionHash: destinationHash,
      events: [
        { id: "22222222-2222-4222-8222-222222222223", stage: "recipient_verification", status: "recipient_verified", network: "stellar", txHash: destinationHash, publicMessage: "Exact recipient verified.", errorCode: null, occurredAt: "2026-11-26T12:01:00.000Z", completedAt: "2026-11-26T12:01:00.000Z" },
        { id: "22222222-2222-4222-8222-222222222224", stage: "completion", status: "completed", network: "stellar", txHash: destinationHash, publicMessage: "Delivered.", errorCode: null, occurredAt: "2026-11-26T12:01:01.000Z", completedAt: "2026-11-26T12:01:01.000Z" },
      ],
    };
    const page = parsePaymentActivityPage({ payments: [payment], nextCursor: null });
    expect(page?.payments[0]?.sourceTransaction?.txHash).toBe(`0x${sourceHash}`);
    expect(page?.payments[0]?.destinationTransaction?.txHash).toBe(destinationHash);
    expect(parsePaymentActivityDetail({ payment })?.status).toBe("completed");
  });

  it("accepts completed detail only with exact recipient, amount, hash and persisted events", () => {
    const completed = {
      ...basePayment,
      status: "completed",
      verifiedRecipientAddress: basePayment.recipientAddress,
      verifiedRecipientAmount: "1.250000000000000000",
      sourceTransactionHash: txHash,
      destinationTransactionHash: txHash,
      events: [
        {
          id: "22222222-2222-4222-8222-222222222221",
          stage: "recipient_verification",
          status: "recipient_verified",
          network: "stellar",
          txHash,
          publicMessage: "Recipient verified.",
          errorCode: null,
          occurredAt: "2026-11-26T12:01:00.000Z",
          completedAt: "2026-11-26T12:01:00.000Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          stage: "completion",
          status: "completed",
          network: "stellar",
          txHash,
          publicMessage: "Payment completed.",
          errorCode: null,
          occurredAt: "2026-11-26T12:01:01.000Z",
          completedAt: "2026-11-26T12:01:01.000Z",
        },
      ],
    };
    expect(parsePaymentActivityDetail({ payment: completed })).toMatchObject({
      status: "completed",
      verifiedRecipient: basePayment.recipientAddress,
      verifiedAmount: "1.250000000000000000",
      completedAt: "2026-11-26T12:01:01.000Z",
    });
    expect(parsePaymentActivityDetail({ payment: { ...completed, events: completed.events.slice(0, 1) } })).toBeNull();
    expect(parsePaymentActivityDetail({ payment: { ...completed, verifiedRecipientAmount: "1.24" } })).toBeNull();
    expect(parsePaymentActivityDetail({ payment: { ...completed, destinationTransactionHash: "b".repeat(64) } })).toBeNull();
  });

  it("rejects a hash whose format does not match the persisted network", () => {
    expect(parsePaymentActivityPage({
      payments: [{ ...basePayment, sourceTransactionHash: "0x1234" }],
      nextCursor: null,
    })).toBeNull();
  });
});
