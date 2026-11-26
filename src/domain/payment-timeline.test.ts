import { describe, expect, it } from "vitest";

import type { PersistedPayment, PersistedPaymentEvent } from "./payment-activity";
import {
  buildPaymentReceipt,
  computePaymentTimeline,
  formatDuration,
  getExplorerUrl,
} from "./payment-timeline";

const paymentId = "11111111-1111-4111-8111-111111111111";
const txHash = "a".repeat(64);
const now = Date.now();

const events: readonly PersistedPaymentEvent[] = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    paymentId,
    recordStage: "authorization",
    stage: "authorized",
    network: "stellar",
    txHash: null,
    explorerUrl: null,
    publicMessage: "Passkey authorization recorded.",
    errorCode: null,
    occurredAt: new Date(now - 14_000).toISOString(),
    completedAt: new Date(now - 14_000).toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    paymentId,
    recordStage: "source_submission",
    stage: "submitted",
    network: "stellar",
    txHash,
    explorerUrl: getExplorerUrl("stellar", txHash),
    publicMessage: "USDC transfer submitted to Stellar Testnet.",
    errorCode: null,
    occurredAt: new Date(now - 10_000).toISOString(),
    completedAt: new Date(now - 10_000).toISOString(),
  },
];

const payment: PersistedPayment = {
  id: paymentId,
  status: "submitted",
  route: {
    id: "stellar_to_stellar",
    sourceNetwork: "stellar",
    destinationNetwork: "stellar",
    rail: "stellar_usdc",
  },
  recipientAddress: "CRECIPIENT",
  expectedAmount: "10.00",
  verifiedRecipient: null,
  verifiedAmount: null,
  asset: "USDC",
  fees: [{ kind: "sponsor", amount: "0", asset: "XLM", payer: "sponsor", label: "Network fee" }],
  sourceTransaction: { network: "stellar", txHash, explorerUrl: getExplorerUrl("stellar", txHash) },
  destinationTransaction: null,
  failureCode: null,
  createdAt: new Date(now - 15_000).toISOString(),
  updatedAt: new Date(now - 10_000).toISOString(),
  completedAt: null,
  events,
};

describe("persisted payment timeline", () => {
  it("formats real elapsed duration", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(65)).toBe("1m 5s");
  });

  it("uses Testnet explorers for supported networks", () => {
    expect(getExplorerUrl("stellar", txHash)).toContain("stellar.expert/explorer/testnet");
    expect(getExplorerUrl("base", `0x${txHash}`)).toContain("sepolia.basescan.org");
  });

  it("derives direct Stellar progress only from persisted status and events", () => {
    const timeline = computePaymentTimeline(payment, events, now);
    expect(timeline.steps[0]?.status).toBe("completed");
    expect(timeline.steps[1]?.status).toBe("current");
    expect(timeline.steps[1]?.txHash).toBe(txHash);
    expect(timeline.latestMessage).toBe("USDC transfer submitted to Stellar Testnet.");
  });

  it("does not mark awaiting user confirmation as stalled", () => {
    expect(computePaymentTimeline({
      ...payment,
      status: "awaiting_confirmation",
      createdAt: new Date(now - 120_000).toISOString(),
      events: [],
    }, [], now).isStalled).toBe(false);
  });

  it("marks network waiting stalled only after the latest persisted event is old", () => {
    const oldEvents = events.map((event) => ({
      ...event,
      occurredAt: new Date(now - 110_000).toISOString(),
      completedAt: new Date(now - 110_000).toISOString(),
    }));
    expect(computePaymentTimeline({
      ...payment,
      createdAt: new Date(now - 120_000).toISOString(),
      events: oldEvents,
    }, oldEvents, now).isStalled).toBe(true);
  });

  it("does not invent an exact failure stage when persistence has only a failure code", () => {
    const timeline = computePaymentTimeline({ ...payment, status: "failed", failureCode: "TX_FAILED" }, events, now);
    expect(timeline.isFailed).toBe(true);
    expect(timeline.failureStage).toBeNull();
    expect(timeline.steps.every((step) => step.status !== "failed")).toBe(true);
  });

  it("uses the full CCTP lifecycle for a persisted cross-chain route", () => {
    const timeline = computePaymentTimeline({
      ...payment,
      route: {
        id: "base_to_stellar_cctp",
        sourceNetwork: "base",
        destinationNetwork: "stellar",
        rail: "circle_cctp_standard",
      },
      status: "awaiting_attestation",
      sourceTransaction: null,
      events: [],
    }, [], now);
    expect(timeline.steps).toHaveLength(8);
    expect(timeline.steps[3]?.status).toBe("current");
  });

  it("builds a receipt only with exact persisted completion evidence", () => {
    const completedEvents: readonly PersistedPaymentEvent[] = [
      ...events,
      {
        ...events[1]!,
        id: "22222222-2222-4222-8222-222222222223",
        recordStage: "recipient_verification",
        stage: "recipient_verified",
        publicMessage: "Exact recipient and amount verified.",
      },
      {
        ...events[1]!,
        id: "22222222-2222-4222-8222-222222222224",
        recordStage: "completion",
        stage: "completed",
        publicMessage: "Payment completed.",
      },
    ];
    const completed: PersistedPayment = {
      ...payment,
      status: "completed",
      verifiedRecipient: payment.recipientAddress,
      verifiedAmount: payment.expectedAmount,
      destinationTransaction: payment.sourceTransaction,
      completedAt: completedEvents.at(-1)!.completedAt,
      events: completedEvents,
    };
    expect(buildPaymentReceipt(completed, completedEvents)).toMatchObject({
      isFullySettled: true,
      verifiedRecipient: payment.recipientAddress,
      verifiedAmount: payment.expectedAmount,
    });
    expect(buildPaymentReceipt(completed, events)).toBeNull();
    expect(buildPaymentReceipt({ ...completed, verifiedAmount: "9.99" }, completedEvents)).toBeNull();
  });
});

