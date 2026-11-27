import { describe, expect, it, vi } from "vitest";

import {
  executeAgentPassPayment,
  prepareAgentPassPayment,
} from "./agent-pass-payment-execution";
import type { PaymentReview } from "./conversation-payment";

const review: PaymentReview = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "awaiting_confirmation",
  routeId: "stellar_to_stellar",
  sourceNetwork: "stellar",
  destinationNetwork: "stellar",
  rail: "stellar_direct",
  recipientAddress: `C${"A".repeat(55)}`,
  expectedRecipientAmount: "1.25",
  fees: [{ kind: "sponsor", payer: "sponsor", asset: "XLM", amount: "0", label: "Sponsored" }],
  reasons: ["direct route"],
  explanation: "Review the exact payment.",
};

describe("Agent Pass payment orchestration", () => {
  it("creates a normal authenticated direct-Stellar review before execution", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({
        conversation: { id: "11111111-1111-4111-8111-111111111111" },
        message: { id: "22222222-2222-4222-8222-222222222222" },
      }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        status: "awaiting_confirmation",
        payment: {
          ...review,
          expectedRecipientAmount: "1.250000000000000000",
          fees: review.fees,
          reasons: review.reasons,
        },
        explanation: review.explanation,
      }, { status: 201 }));

    await expect(prepareAgentPassPayment({
      recipientInput: "@recipient",
      amount: "1.25",
      request,
    })).resolves.toEqual({
      ...review,
      expectedRecipientAmount: "1.250000000000000000",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/payments", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "idempotency-key": "agent-pass:22222222-2222-4222-8222-222222222222",
      }),
    }));
    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body.intent).toEqual({
      amount: "1.25",
      asset: "USDC",
      recipientInput: "@recipient",
      requestedSourceNetwork: "stellar",
      requestedDestinationNetwork: "stellar",
    });
  });

  it("submits only the reviewed recipient and amount through the payment handoff", async () => {
    const hash = "a".repeat(64);
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ status: "pending", transactionHash: hash }, { status: 202 }));
    const submitTransfer = vi.fn().mockResolvedValue({
      success: true,
      hash,
      ledger: 123,
    });
    const pass = { ruleId: 7 } as never;
    const kit = {} as never;

    await expect(executeAgentPassPayment({
      review,
      kit,
      pass,
      tokenContract: `C${"B".repeat(55)}`,
      request,
      submitTransfer,
    })).resolves.toEqual({
      status: "pending",
      transactionHash: hash,
      message: "Stellar submission is recorded, but final recipient and amount verification is still pending.",
    });
    expect(submitTransfer).toHaveBeenCalledWith({
      kit,
      pass,
      tokenContract: `C${"B".repeat(55)}`,
      recipient: review.recipientAddress,
      amount: "1.25",
    });
    expect(request).toHaveBeenNthCalledWith(1, "/api/payments/stellar/direct/authorize", expect.objectContaining({
      method: "POST",
    }));
  });

  it("does not retry when submission status becomes unknown", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({
        status: "authorization_ready",
        relayerUrl: "/api/stellar/relayer/payment",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ error: "temporarily unavailable" }, { status: 503 }));
    const submitTransfer = vi.fn().mockRejectedValue(new Error("interrupted"));

    await expect(executeAgentPassPayment({
      review,
      kit: {} as never,
      pass: {} as never,
      tokenContract: `C${"B".repeat(55)}`,
      request,
      submitTransfer,
    })).resolves.toMatchObject({
      status: "status_unknown",
      transactionHash: null,
    });
    expect(submitTransfer).toHaveBeenCalledTimes(1);
  });

  it("reports an explicit hashless policy rejection without pretending status is unknown", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({
      status: "authorization_ready",
      relayerUrl: "/api/stellar/relayer/payment",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, { status: 201 }));
    const submitTransfer = vi.fn().mockResolvedValue({
      success: false,
      hash: null,
      error: {
        code: "PAYMENT_MISMATCH",
        message: "The Agent Pass is inactive or its remaining allowance is insufficient",
      },
    });

    await expect(executeAgentPassPayment({
      review,
      kit: {} as never,
      pass: {} as never,
      tokenContract: `C${"B".repeat(55)}`,
      request,
      submitTransfer,
    })).resolves.toEqual({
      status: "failed",
      transactionHash: null,
      message: "The Agent Pass is inactive or its remaining allowance is insufficient",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
