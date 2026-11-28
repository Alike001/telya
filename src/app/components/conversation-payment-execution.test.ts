import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
} from "../../base/evm.ts";
import type { SmartAccountPublicConfig } from "../../stellar/smart-account.ts";
import type { PaymentReview } from "./conversation-payment.ts";
import { approveConversationCctpAllowance, executeConversationPayment } from "./conversation-payment-execution.ts";

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
const sourceHash = "b".repeat(64);
const destinationHash = `0x${"d".repeat(64)}`;
const cctpReview: PaymentReview = {
  ...review,
  routeId: "stellar_to_base",
  destinationNetwork: "base",
  rail: "circle_cctp_standard",
  recipientAddress: `0x${"1".repeat(40)}`,
  expectedRecipientAmount: "5",
  fees: [{
    kind: "provider",
    amount: "0.052683",
    asset: "USDC",
    payer: "sender",
    label: "Circle destination forwarding fee",
  }],
};
const baseSender = `0x${"2".repeat(40)}`;
const baseRecipient = `0x${"3".repeat(40)}`;
const baseHash = `0x${"c".repeat(64)}`;
const contract = (byte: number) => StrKey.encodeContract(Buffer.alloc(32, byte));
const baseDirectReview: PaymentReview = {
  ...review,
  routeId: "base_to_base",
  sourceNetwork: "base",
  destinationNetwork: "base",
  rail: "base_direct",
  recipientAddress: baseRecipient,
  expectedRecipientAmount: "5",
};
const baseCctpReview: PaymentReview = {
  ...review,
  routeId: "base_to_stellar",
  sourceNetwork: "base",
  destinationNetwork: "stellar",
  rail: "circle_cctp_standard",
  recipientAddress: contract(9),
  expectedRecipientAmount: "5",
};
const cctpConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  usdcContract: contract(1),
  tokenMessenger: contract(2),
  messageTransmitter: contract(3),
  forwarder: contract(4),
  baseDomain: 6,
  stellarDomain: 27,
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("conversation payment execution", () => {
  it("shows exact approval terms and verifies allowance without submitting a burn", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "approval_authorization_ready",
        approval: {
          owner: smartAccount.contractId, spender: cctpConfig.tokenMessenger,
          amount: "5.052683", expirationLedger: 5_970_000, paymentId: cctpReview.id,
        },
      }, 201))
      .mockResolvedValueOnce(json({ config: cctpConfig }))
      .mockResolvedValueOnce(json({ status: "ready", amount: "5.052683" }));
    const confirmReview = vi.fn().mockReturnValue(true);
    const submitApproval = vi.fn().mockResolvedValue({ txHash });
    const result = await approveConversationCctpAllowance(cctpReview, {
      config, smartAccount, request,
      createKit: vi.fn().mockReturnValue({ contractId: smartAccount.contractId }),
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitApproval, confirmReview,
    });
    expect(result.status).toBe("approved");
    expect(confirmReview.mock.calls[0]?.[0]).toContain("5.052683");
    expect(confirmReview.mock.calls[0]?.[0]).toContain(cctpConfig.tokenMessenger);
    expect(submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      amount: "5.052683", expirationLedger: 5_970_000,
    }));
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("rejects wrong approval amount before passkey access", async () => {
    const confirmReview = vi.fn();
    const submitApproval = vi.fn();
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "approval_authorization_ready",
        approval: {
          owner: smartAccount.contractId, spender: cctpConfig.tokenMessenger,
          amount: "5.052684", expirationLedger: 5_970_000, paymentId: cctpReview.id,
        },
      }, 201))
      .mockResolvedValueOnce(json({ config: cctpConfig }));
    await expect(approveConversationCctpAllowance(cctpReview, {
      config, smartAccount, request, createKit: vi.fn(), restoreAccount: vi.fn(),
      submitApproval, confirmReview,
    })).rejects.toThrow("do not match");
    expect(confirmReview).not.toHaveBeenCalled();
    expect(submitApproval).not.toHaveBeenCalled();
  });
  it("submits only the exact server-authorized Base direct transfer and keeps pending truthful", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          sender: baseSender,
          token: BASE_SEPOLIA_USDC,
          recipient: baseRecipient.toUpperCase().replace("0X", "0x"),
          amount: "5.000000000000000000",
        },
      }))
      .mockResolvedValueOnce(json({ status: "pending", transactionHash: baseHash }, 202));
    const provider = { request: vi.fn() };
    const submitBaseTransfer = vi.fn().mockResolvedValue(baseHash);

    await expect(executeConversationPayment(baseDirectReview, {
      config: null,
      smartAccount: null,
      request,
      createKit: vi.fn(),
      restoreAccount: vi.fn(),
      submitTransfer: vi.fn(),
      getBaseProvider: vi.fn().mockResolvedValue(provider),
      submitBaseTransfer,
    })).resolves.toEqual({
      status: "pending",
      transactionHash: baseHash,
      message: "The Base USDC transfer is recorded. Finality and exact recipient verification are still pending.",
    });
    expect(submitBaseTransfer).toHaveBeenCalledWith({
      provider,
      sender: baseSender,
      recipient: baseRecipient,
      amount: "5.000000000000000000",
    });
  });

  it("rejects a Base direct authorization for a different recipient before wallet access", async () => {
    const getBaseProvider = vi.fn();
    const submitBaseTransfer = vi.fn();

    await expect(executeConversationPayment(baseDirectReview, {
      config: null,
      smartAccount: null,
      request: vi.fn().mockResolvedValue(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          sender: baseSender,
          token: BASE_SEPOLIA_USDC,
          recipient: `0x${"4".repeat(40)}`,
          amount: "5",
        },
      })),
      createKit: vi.fn(),
      restoreAccount: vi.fn(),
      submitTransfer: vi.fn(),
      getBaseProvider,
      submitBaseTransfer,
    })).rejects.toThrow("The Base payment authorization does not match this review.");
    expect(getBaseProvider).not.toHaveBeenCalled();
    expect(submitBaseTransfer).not.toHaveBeenCalled();
  });

  it("submits only the exact server-authorized Base CCTP burn and exposes the persisted burn hash", async () => {
    const mintRecipient = `0x${"4".repeat(64)}`;
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          sender: baseSender,
          token: BASE_SEPOLIA_USDC,
          tokenMessenger: BASE_SEPOLIA_TOKEN_MESSENGER,
          burnAmount: "5",
          maxFee: "0",
          destinationDomain: 27,
          mintRecipient,
          destinationCaller: mintRecipient,
          forwardRecipient: baseCctpReview.recipientAddress,
        },
      }))
      .mockResolvedValueOnce(json({ status: "pending", sourceTransactionHash: baseHash }, 202));
    const provider = { request: vi.fn() };
    const submitBaseCctpBurn = vi.fn().mockResolvedValue({ transactionHash: baseHash });

    await expect(executeConversationPayment(baseCctpReview, {
      config: null,
      smartAccount: null,
      request,
      createKit: vi.fn(),
      restoreAccount: vi.fn(),
      submitTransfer: vi.fn(),
      getBaseProvider: vi.fn().mockResolvedValue(provider),
      submitBaseCctpBurn,
    })).resolves.toEqual({
      status: "pending",
      transactionHash: baseHash,
      message: "The Base burn is recorded. Base finality, Circle attestation, Stellar settlement, and recipient verification are still pending.",
    });
    expect(submitBaseCctpBurn).toHaveBeenCalledWith({
      provider,
      sender: baseSender,
      burnAmount: "5",
      maxFee: "0",
      destinationDomain: 27,
      mintRecipient,
      destinationCaller: mintRecipient,
      forwardRecipient: baseCctpReview.recipientAddress,
    });
  });

  it("accepts exact Base CCTP authorization against Neon-padded 18-decimal review amounts", async () => {
    const mintRecipient = `0x${"4".repeat(64)}`;
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          sender: baseSender,
          token: BASE_SEPOLIA_USDC,
          tokenMessenger: BASE_SEPOLIA_TOKEN_MESSENGER,
          burnAmount: "0.1",
          maxFee: "0",
          destinationDomain: 27,
          mintRecipient,
          destinationCaller: mintRecipient,
          forwardRecipient: baseCctpReview.recipientAddress,
        },
      }))
      .mockResolvedValueOnce(json({ status: "pending", sourceTransactionHash: baseHash }, 202));
    const submitBaseCctpBurn = vi.fn().mockResolvedValue({ transactionHash: baseHash });
    await expect(executeConversationPayment({
      ...baseCctpReview,
      expectedRecipientAmount: "0.100000000000000000",
      fees: [{ kind: "provider", amount: "0.000000000000000000", asset: "USDC", payer: "sender", label: "Circle CCTP Standard fee" }],
    }, {
      config: null,
      smartAccount: null,
      request,
      createKit: vi.fn(),
      restoreAccount: vi.fn(),
      submitTransfer: vi.fn(),
      getBaseProvider: vi.fn().mockResolvedValue({ request: vi.fn() }),
      submitBaseCctpBurn,
    })).resolves.toMatchObject({ status: "pending", transactionHash: baseHash });
    expect(submitBaseCctpBurn).toHaveBeenCalledOnce();
  });

  it("rejects a nonzero sub-micro-USDC review amount before Base wallet access", async () => {
    const getBaseProvider = vi.fn();
    await expect(executeConversationPayment({
      ...baseCctpReview,
      expectedRecipientAmount: "0.100000100000000000",
    }, {
      config: null,
      smartAccount: null,
      request: vi.fn().mockResolvedValue(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID, sender: baseSender,
          token: BASE_SEPOLIA_USDC, tokenMessenger: BASE_SEPOLIA_TOKEN_MESSENGER,
          burnAmount: "0.1", maxFee: "0", destinationDomain: 27,
          mintRecipient: `0x${"4".repeat(64)}`,
          destinationCaller: `0x${"4".repeat(64)}`,
          forwardRecipient: baseCctpReview.recipientAddress,
        },
      })),
      createKit: vi.fn(), restoreAccount: vi.fn(), submitTransfer: vi.fn(),
      getBaseProvider, submitBaseCctpBurn: vi.fn(),
    })).rejects.toThrow("The Base CCTP authorization does not match this review.");
    expect(getBaseProvider).not.toHaveBeenCalled();
  });

  it("rejects a Base CCTP authorization with an unreviewed fee before wallet access", async () => {
    const getBaseProvider = vi.fn();
    const submitBaseCctpBurn = vi.fn();

    await expect(executeConversationPayment(baseCctpReview, {
      config: null,
      smartAccount: null,
      request: vi.fn().mockResolvedValue(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          sender: baseSender,
          token: BASE_SEPOLIA_USDC,
          tokenMessenger: BASE_SEPOLIA_TOKEN_MESSENGER,
          burnAmount: "5.1",
          maxFee: "0.1",
          destinationDomain: 27,
          mintRecipient: `0x${"4".repeat(64)}`,
          destinationCaller: `0x${"4".repeat(64)}`,
          forwardRecipient: baseCctpReview.recipientAddress,
        },
      })),
      createKit: vi.fn(),
      restoreAccount: vi.fn(),
      submitTransfer: vi.fn(),
      getBaseProvider,
      submitBaseCctpBurn,
    })).rejects.toThrow("The Base CCTP authorization does not match this review.");
    expect(getBaseProvider).not.toHaveBeenCalled();
    expect(submitBaseCctpBurn).not.toHaveBeenCalled();
  });

  it.each([
    { name: "a different forward recipient", recipient: contract(8), caller: `0x${"4".repeat(64)}` },
    { name: "a zero destination caller", recipient: baseCctpReview.recipientAddress, caller: `0x${"0".repeat(64)}` },
  ])("rejects $name before opening the Base wallet", async ({ recipient, caller }) => {
    const getBaseProvider = vi.fn();
    const submitBaseCctpBurn = vi.fn();
    await expect(executeConversationPayment(baseCctpReview, {
      config: null, smartAccount: null,
      request: vi.fn().mockResolvedValue(json({
        status: "authorization_ready",
        transaction: {
          chainId: BASE_SEPOLIA_CHAIN_ID, sender: baseSender,
          token: BASE_SEPOLIA_USDC, tokenMessenger: BASE_SEPOLIA_TOKEN_MESSENGER,
          burnAmount: "5", maxFee: "0", destinationDomain: 27,
          mintRecipient: `0x${"4".repeat(64)}`,
          destinationCaller: caller,
          forwardRecipient: recipient,
        },
      })),
      createKit: vi.fn(), restoreAccount: vi.fn(), submitTransfer: vi.fn(),
      getBaseProvider, submitBaseCctpBurn,
    })).rejects.toThrow("The Base CCTP authorization does not match this review.");
    expect(getBaseProvider).not.toHaveBeenCalled();
    expect(submitBaseCctpBurn).not.toHaveBeenCalled();
  });

  it("authorizes the exact Stellar CCTP burn and completes only from the forwarded Base receipt", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        burn: { burnAmount: "5.052683", maxFee: "0.052683" },
      }, 201))
      .mockResolvedValueOnce(json({ config: cctpConfig }))
      .mockResolvedValueOnce(json({
        status: "completed",
        destinationTransactionHash: destinationHash,
      }))
      .mockResolvedValueOnce(json({ payment: {
        id: cctpReview.id,
        status: "completed",
        recipientAddress: cctpReview.recipientAddress.toUpperCase().replace("0X", "0x"),
        expectedRecipientAmount: "5.000000000000000000",
        verifiedRecipientAddress: cctpReview.recipientAddress,
        verifiedRecipientAmount: "5.000000000000000000",
        destinationTransactionHash: destinationHash,
        events: [
          { stage: "recipient_verification", status: "recipient_verified", txHash: destinationHash },
          { stage: "completion", status: "completed", txHash: destinationHash },
        ],
      } }));
    const submitCctpBurn = vi.fn().mockResolvedValue({ txHash: sourceHash });

    await expect(executeConversationPayment(cctpReview, {
      config,
      smartAccount,
      request,
      createKit: vi.fn().mockReturnValue({}),
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitTransfer: vi.fn(),
      submitCctpBurn,
    })).resolves.toEqual({
      status: "completed",
      transactionHash: destinationHash,
      verifiedRecipient: cctpReview.recipientAddress,
      verifiedAmount: "5.000000000000000000",
    });
    expect(submitCctpBurn).toHaveBeenCalledWith(expect.objectContaining({
      config: { ...cctpConfig, rpcUrl: `${cctpConfig.rpcUrl}/` },
      recipient: cctpReview.recipientAddress,
      burnAmount: "5.052683",
      maxFee: "0.052683",
    }));
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/payments/stellar/cctp/authorize",
      "/api/stellar/cctp/config",
      `/api/payments/base/cctp/source?id=${cctpReview.id}`,
      `/api/payments?id=${cctpReview.id}`,
    ]);
  });

  it("recovers an interrupted CCTP response from the persisted source hash without resubmission", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        burn: { burnAmount: "5.052683", maxFee: "0.052683" },
      }, 201))
      .mockResolvedValueOnce(json({ config: cctpConfig }))
      .mockResolvedValueOnce(json({
        status: "pending",
        sourceTransactionHash: sourceHash,
      }, 202));
    const submitCctpBurn = vi.fn().mockRejectedValue(new Error("response lost"));

    await expect(executeConversationPayment(cctpReview, {
      config,
      smartAccount,
      request,
      createKit: vi.fn().mockReturnValue({}),
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitTransfer: vi.fn(),
      submitCctpBurn,
    })).resolves.toEqual({
      status: "pending",
      transactionHash: sourceHash,
      message: "The Stellar burn is recorded. Circle attestation, Base finality, and exact recipient verification are still pending.",
    });
    expect(submitCctpBurn).toHaveBeenCalledTimes(1);
  });

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

  it("does not offer resubmission after a hashless relayer or sponsor failure", async () => {
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
        errorCode: "RELAYER_UNAVAILABLE",
        message: "The Stellar fee sponsor is unavailable",
        txHash: null,
      }),
    })).resolves.toEqual({
      status: "failed",
      transactionHash: null,
      message: "The Stellar fee sponsor is unavailable No transaction hash was returned; create a new review only after checking Activity.",
    });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/payments/stellar/direct/authorize",
      `/api/payments/stellar/direct/reconcile?id=${review.id}`,
    ]);
  });

  it("reconciles persisted state instead of resubmitting after an interrupted SDK response", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, 201))
      .mockResolvedValueOnce(json({ status: "pending", transactionHash: txHash }));
    const submitTransfer = vi.fn().mockRejectedValue(new Error("response lost"));

    await expect(executeConversationPayment(review, {
      config,
      smartAccount,
      request,
      createKit: vi.fn().mockReturnValue({}),
      restoreAccount: vi.fn().mockResolvedValue(smartAccount),
      submitTransfer,
    })).resolves.toEqual({
      status: "pending",
      transactionHash: txHash,
      message: "Stellar submission is recorded, but final recipient and amount verification is still pending.",
    });
    expect(submitTransfer).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/payments/stellar/direct/authorize",
      `/api/payments/stellar/direct/reconcile?id=${review.id}`,
    ]);
  });

  it("blocks resubmission when an interrupted SDK response cannot yet be reconciled", async () => {
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
      submitTransfer: vi.fn().mockRejectedValue(new Error("response lost")),
    })).resolves.toEqual({
      status: "status_unknown",
      transactionHash: null,
      message: "The authorization response was interrupted and persisted status is temporarily unavailable. Do not submit again; refresh the existing payment status.",
    });
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
