import { describe, expect, it } from "vitest";
import type { Payment, PaymentEvent } from "./contracts";
import {
  buildPaymentReceipt,
  computePaymentTimeline,
  formatDuration,
  getExplorerUrl,
} from "./payment-timeline";

const mockStellarPayment: Payment = {
  id: "pay_stellar_123",
  userId: "user_1",
  paymentIntentId: "intent_1",
  routeDecisionId: "route_1",
  idempotencyKey: "idem_123",
  route: {
    id: "stellar_to_stellar",
    sourceNetwork: "stellar",
    destinationNetwork: "stellar",
    rail: "stellar_usdc",
  },
  sourceWalletId: "wallet_stellar_1",
  recipient: { kind: "username", username: "alice" },
  expectedRecipient: "@alice",
  asset: "USDC",
  expectedAmount: "10.00",
  fees: [
    {
      kind: "sponsor",
      amount: "0.00",
      asset: "USDC",
      payer: "sponsor",
      label: "Sponsored Fee",
    },
  ],
  feeAmount: "0.00",
  sourceTransaction: {
    network: "stellar",
    txHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    explorerUrl:
      "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  },
  destinationTransaction: null,
  status: "submitted",
  actualRecipient: null,
  actualAmount: null,
  failureCode: null,
  failureStage: null,
  createdAt: new Date(Date.now() - 15000).toISOString(),
  updatedAt: new Date(Date.now() - 5000).toISOString(),
  completedAt: null,
};

const mockEvents: readonly PaymentEvent[] = [
  {
    id: "evt_1",
    paymentId: "pay_stellar_123",
    sequence: 1,
    stage: "authorized",
    status: "succeeded",
    network: "stellar",
    txHash: null,
    explorerUrl: null,
    publicMessage: "Passkey biometric authorization succeeded.",
    debugMessage: null,
    errorCode: null,
    startedAt: new Date(Date.now() - 15000).toISOString(),
    completedAt: new Date(Date.now() - 14000).toISOString(),
  },
  {
    id: "evt_2",
    paymentId: "pay_stellar_123",
    sequence: 2,
    stage: "submitted",
    status: "succeeded",
    network: "stellar",
    txHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    explorerUrl:
      "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    publicMessage: "USDC transfer submitted to Stellar Testnet relayer.",
    debugMessage: null,
    errorCode: null,
    startedAt: new Date(Date.now() - 14000).toISOString(),
    completedAt: new Date(Date.now() - 10000).toISOString(),
  },
];

describe("Payment Timeline & Invariants", () => {
  it("formats elapsed duration accurately without mock units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(65)).toBe("1m 5s");
    expect(formatDuration(180)).toBe("3m 0s");
  });

  it("returns verified explorer URLs for each supported network", () => {
    const stellarHash = "abcdef0123456789";
    const baseHash = "0x9876543210fedcba";
    expect(getExplorerUrl("stellar", stellarHash)).toContain("stellar.expert");
    expect(getExplorerUrl("base", baseHash)).toContain("basescan.org");
  });

  it("computes active in-progress timeline for direct Stellar payment", () => {
    const timeline = computePaymentTimeline(mockStellarPayment, mockEvents);

    expect(timeline.routeId).toBe("stellar_to_stellar");
    expect(timeline.isCompleted).toBe(false);
    expect(timeline.isFailed).toBe(false);
    expect(timeline.steps).toHaveLength(5);

    // Step 0: authorized should be completed
    expect(timeline.steps[0]?.status).toBe("completed");
    // Step 1: submitted should be current
    expect(timeline.steps[1]?.status).toBe("current");
    expect(timeline.steps[1]?.txHash).toBe(mockStellarPayment.sourceTransaction?.txHash);
    expect(timeline.steps[1]?.explorerUrl).toContain("stellar.expert");
    // Step 2, 3, 4: should be pending
    expect(timeline.steps[2]?.status).toBe("pending");
    expect(timeline.steps[3]?.status).toBe("pending");
    expect(timeline.steps[4]?.status).toBe("pending");

    expect(timeline.elapsedSeconds).toBeGreaterThanOrEqual(14);
    expect(timeline.latestMessage).toBe("USDC transfer submitted to Stellar Testnet relayer.");
  });

  it("detects stalled condition when step has had no progress beyond threshold", () => {
    const stalledPayment: Payment = {
      ...mockStellarPayment,
      createdAt: new Date(Date.now() - 120_000).toISOString(), // 120 seconds ago
    };

    const timeline = computePaymentTimeline(stalledPayment, mockEvents);
    expect(timeline.isStalled).toBe(true);
    expect(timeline.steps[1]?.status).toBe("stalled");
  });

  it("identifies exact failure stage and error details when payment fails", () => {
    const failedPayment: Payment = {
      ...mockStellarPayment,
      status: "failed",
      failureStage: "submitted",
      failureCode: "RELAYER_TRANSACTION_REVERTED",
    };

    const timeline = computePaymentTimeline(failedPayment, mockEvents);
    expect(timeline.isFailed).toBe(true);
    expect(timeline.failureStage).toBe("submitted");
    expect(timeline.failureReason).toBe("RELAYER_TRANSACTION_REVERTED");
    expect(timeline.steps[1]?.status).toBe("failed");
    expect(timeline.steps[1]?.errorMessage).toBe("RELAYER_TRANSACTION_REVERTED");
    expect(timeline.steps[2]?.status).toBe("pending");
  });

  it("computes full 8-step lifecycle for Base-to-Stellar CCTP cross-chain payment", () => {
    const cctpPayment: Payment = {
      ...mockStellarPayment,
      route: {
        id: "base_to_stellar_cctp",
        sourceNetwork: "base",
        destinationNetwork: "stellar",
        rail: "circle_cctp_standard",
      },
      status: "awaiting_attestation",
    };

    const timeline = computePaymentTimeline(cctpPayment, []);
    expect(timeline.steps).toHaveLength(8);
    expect(timeline.steps.map((s) => s.stage)).toEqual([
      "authorized",
      "submitted",
      "source_confirmed",
      "awaiting_attestation",
      "destination_submitted",
      "destination_confirmed",
      "recipient_verified",
      "completed",
    ]);
    expect(timeline.steps[3]?.status).toBe("current");
    expect(timeline.steps[3]?.title).toBe("Circle CCTP Attestation");
  });

  it("generates verified payment receipt with destination proof for completed payments", () => {
    const completedPayment: Payment = {
      ...mockStellarPayment,
      status: "completed",
      actualRecipient: "GAVERTIFIEDRECIPIENT123",
      actualAmount: "10.00",
      destinationTransaction: {
        network: "stellar",
        txHash: "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
        explorerUrl:
          "https://stellar.expert/explorer/testnet/tx/f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
      },
      recipientVerification: {
        recipientAddress: "GAVERTIFIEDRECIPIENT123",
        receivedAmount: "10.00",
        verifiedAt: new Date().toISOString(),
      },
      completedAt: new Date().toISOString(),
    };

    const receipt = buildPaymentReceipt(completedPayment, mockEvents);
    expect(receipt.isFullySettled).toBe(true);
    expect(receipt.verifiedRecipient).toBe("GAVERTIFIEDRECIPIENT123");
    expect(receipt.verifiedAmount).toBe("10.00");
    expect(receipt.destinationTransaction?.txHash).toBe(
      completedPayment.destinationTransaction.txHash,
    );
    expect(receipt.totalFee).toBe("0.00");
  });
});
