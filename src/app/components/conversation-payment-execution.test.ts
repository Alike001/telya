import { describe, expect, it, vi } from "vitest";

import type { SmartAccountPublicConfig } from "../../stellar/smart-account.ts";
import type { PaymentReview } from "./conversation-payment.ts";
import { executeConversationPayment } from "./conversation-payment-execution.ts";

const txHash = "a".repeat(64);
const review: PaymentReview = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "awaiting_confirmation",
  routeId: "stellar_to_stellar",
  sourceNetwork: "stellar",
  destinationNetwork: "stellar",
  rail: "stellar_direct",
  recipientAddress: "CRECIPIENT",
  expectedRecipientAmount: "1.25",
  fees: [],
  reasons: [],
  explanation: "Review only",
};
const config = {
  rpcUrl: "https://rpc.test",
  networkPassphrase: "Test SDF Network ; September 2015",
  accountWasmHash: "a".repeat(64),
  webauthnVerifierAddress: "CWEB",
  ed25519VerifierAddress: "CED",
  spendingLimitPolicyAddress: "CPOLICY",
  usdcContract: "CUSDC",
  relayerUrl: "/api/stellar/relayer",
} satisfies SmartAccountPublicConfig;
const smartAccount = { contractId: "CSENDER", credentialId: "credential" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("conversation payment execution", () => {
  it("uses the fixed protected relayer and completes only from exact persisted receipt evidence", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, 201))
      .mockResolvedValueOnce(json({ status: "completed", transactionHash: txHash }))
      .mockResolvedValueOnce(json({ payment: {
        id: review.id,
        status: "completed",
        recipientAddress: review.recipientAddress,
        expectedRecipientAmount: "1.250000000000000000",
        verifiedRecipientAddress: review.recipientAddress,
        verifiedRecipientAmount: "1.250000000000000000",
        destinationTransactionHash: txHash,
        events: [
          { stage: "recipient_verification", status: "recipient_verified", txHash },
          { stage: "completion", status: "completed", txHash },
        ],
      } }));
    const createKit = vi.fn().mockReturnValue({});
    const submitTransfer = vi.fn().mockResolvedValue({
      status: "submitted",
      txHash,
      ledger: 100,
      recipient: review.recipientAddress,
      amount: review.expectedRecipientAmount,
    });

    await expect(executeConversationPayment(review, {
      config,
      smartAccount,
      request,
      createKit,
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitTransfer,
    })).resolves.toEqual({
      status: "completed",
      transactionHash: txHash,
      verifiedRecipient: review.recipientAddress,
      verifiedAmount: "1.250000000000000000",
    });
    expect(createKit).toHaveBeenCalledWith({
      ...config,
      relayerUrl: "/api/stellar/relayer/payment",
    });
    expect(submitTransfer).toHaveBeenCalledWith(expect.objectContaining({
      tokenContract: config.usdcContract,
      recipient: review.recipientAddress,
      amount: review.expectedRecipientAmount,
    }));
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/payments/stellar/direct/authorize",
      `/api/payments/stellar/direct/reconcile?id=${review.id}`,
      `/api/payments?id=${review.id}`,
    ]);
  });

  it("keeps a completed chain response pending when canonical receipt evidence mismatches", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, 201))
      .mockResolvedValueOnce(json({ status: "completed", transactionHash: txHash }))
      .mockResolvedValueOnce(json({ payment: {
        id: review.id,
        status: "completed",
        recipientAddress: review.recipientAddress,
        expectedRecipientAmount: "1.25",
        verifiedRecipientAddress: "CDIFFERENT",
        verifiedRecipientAmount: "1.25",
        destinationTransactionHash: txHash,
        events: [
          { stage: "recipient_verification", status: "recipient_verified", txHash },
          { stage: "completion", status: "completed", txHash },
        ],
      } }));

    await expect(executeConversationPayment(review, {
      config,
      smartAccount,
      request,
      createKit: vi.fn().mockReturnValue({}),
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitTransfer: vi.fn().mockResolvedValue({
        status: "submitted", txHash, ledger: 100,
        recipient: review.recipientAddress, amount: review.expectedRecipientAmount,
      }),
    })).resolves.toMatchObject({ status: "pending", transactionHash: txHash });
  });

  it("labels a relayer hash unverified when canonical reconciliation has no matching evidence", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, 201))
      .mockResolvedValueOnce(json({ error: "payment_state_conflict" }, 409));

    await expect(executeConversationPayment(review, {
      config,
      smartAccount,
      request,
      createKit: vi.fn().mockReturnValue({}),
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitTransfer: vi.fn().mockResolvedValue({
        status: "failed",
        errorCode: "NETWORK_ERROR",
        message: "Response was lost",
        txHash,
      }),
    })).resolves.toMatchObject({ status: "unverified", transactionHash: txHash });
  });

  it("never invokes signing when the restored passkey account differs", async () => {
    const submitTransfer = vi.fn();
    await expect(executeConversationPayment(review, {
      config,
      smartAccount,
      request: vi.fn().mockResolvedValue(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, 201)),
      createKit: vi.fn().mockReturnValue({}),
      restoreAccount: vi.fn().mockResolvedValue({ contractId: "COTHER", credentialId: "other" }),
      submitTransfer,
    })).rejects.toThrow("does not match the verified source wallet");
    expect(submitTransfer).not.toHaveBeenCalled();
  });
});
