import { Buffer } from "node:buffer";
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { BaseApprovalRequiredError } from "../payments/quotes.ts";
import { createPaymentHandler } from "./payments.ts";

vi.mock("../payments/service.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../payments/service.ts")>()),
  validatePaymentIntentMessage: vi.fn(async () => {}),
  findPaymentReplay: vi.fn(async () => null),
  getVerifiedSourceWallets: vi.fn(async () => [{
    id: "11111111-1111-4111-8111-111111111111",
    network: "base",
    address: `0x${"1".repeat(40)}`,
  }]),
}));

const user = {
  id: "22222222-2222-4222-8222-222222222222",
  privyUserId: "did:privy:test-user",
  sessionId: "session",
  expiresAt: new Date(Date.now() + 60_000),
};

function paymentRequest(): Request {
  return new Request("http://localhost/api/payments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "approval-test-idempotency" },
    body: JSON.stringify({
      conversationId: "33333333-3333-4333-8333-333333333333",
      intentMessageId: "44444444-4444-4444-8444-444444444444",
      inputMode: "text",
      selectedSourceWalletId: null,
      intent: {
        amount: "0.1",
        asset: "USDC",
        recipientInput: StrKey.encodeContract(Buffer.alloc(32, 5)),
        requestedSourceNetwork: "base",
        requestedDestinationNetwork: "stellar",
      },
    }),
  });
}

describe("Base CCTP approval-required payment review", () => {
  it("returns an exact approval-required 409 without creating a payment", async () => {
    const quoteFees = vi.fn().mockRejectedValue(new BaseApprovalRequiredError("0.1"));
    const handler = createPaymentHandler({
      authenticate: async () => user,
      getBalances: async () => ({ "11111111-1111-4111-8111-111111111111": "1" }),
      quoteFees,
    });
    const response = await handler(paymentRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "base_approval_required",
      message: expect.stringContaining("Approve exactly 0.1 USDC"),
    });
    expect(quoteFees).toHaveBeenCalledOnce();
  });

  it("keeps an unrelated fee-provider failure unavailable", async () => {
    const handler = createPaymentHandler({
      authenticate: async () => user,
      getBalances: async () => ({ "11111111-1111-4111-8111-111111111111": "1" }),
      quoteFees: async () => { throw new Error("RPC unavailable"); },
    });
    const response = await handler(paymentRequest());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "payment_provider_unavailable" });
  });
});
