import { afterEach, describe, expect, it, vi } from "vitest";
import * as dbClient from "../db/client.ts";
import { createPaymentHandler } from "../api/payments.ts";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  privyUserId: "did:privy:verified",
  sessionId: "verified-session",
  expiresAt: new Date(Date.now() + 60_000),
};
const conversationId = "00000000-0000-0000-0000-000000000002";
const intentMessageId = "00000000-0000-0000-0000-000000000003";
const intent = {
  amount: "1.25",
  asset: "USDC",
  recipientInput: "@alice",
  requestedSourceNetwork: null,
  requestedDestinationNetwork: "stellar",
};

function request(changes: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/payments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "retry-safe-key-001" },
    body: JSON.stringify({
      conversationId,
      intentMessageId,
      inputMode: "text",
      selectedSourceWalletId: null,
      intent,
      ...changes,
    }),
  });
}

function savedPayment() {
  return {
    id: "00000000-0000-0000-0000-000000000004",
    status: "submitted",
    route_id: "stellar_to_stellar",
    source_network: "stellar",
    destination_network: "stellar",
    rail: "stellar_direct",
    recipient_address: "CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3",
    expected_recipient_amount: "1.25",
    verified_recipient_address: null,
    verified_recipient_amount: null,
    source_transaction_hash: null,
    destination_transaction_hash: null,
    failure_code: null,
    fees: [],
    route_reasons: [],
    created_at: "2026-11-26T12:00:00Z",
    updated_at: "2026-11-26T12:00:00Z",
    conversation_id: conversationId,
    intent_message_id: intentMessageId,
    structured_intent: {
      action: "send",
      ...intent,
      inputMode: "text",
      requestedSourceWalletId: null,
      selectedSourceWallet: { id: "00000000-0000-0000-0000-000000000005" },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("payment creation retry", () => {
  it("returns the owner-scoped persisted status when live providers are unavailable", async () => {
    const sql = vi.fn()
      .mockResolvedValueOnce([{ content: "Send 1.25 USDC to @alice on Stellar" }])
      .mockResolvedValueOnce([savedPayment()]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    const handle = createPaymentHandler({ authenticate: async () => user });

    const response = await handle(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reused).toBe(true);
    expect(body.payment.status).toBe("submitted");
    expect(body.payment.verifiedRecipientAmount).toBeNull();
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1]?.[0]?.join(" ")).toContain("p.user_id = ");
    expect(sql.mock.calls[1]?.slice(1)).toContain(user.id);
  });

  it("rejects reuse of a key with a different requested wallet", async () => {
    const sql = vi.fn()
      .mockResolvedValueOnce([{ content: "Send 1.25 USDC to @alice on Stellar" }])
      .mockResolvedValueOnce([savedPayment()]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    const handle = createPaymentHandler({ authenticate: async () => user });

    const response = await handle(request({ selectedSourceWalletId: "00000000-0000-0000-0000-000000000006" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("payment_conflict");
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("keeps first-time creation unavailable without trusted providers", async () => {
    const sql = vi.fn()
      .mockResolvedValueOnce([{ content: "Send 1.25 USDC to @alice on Stellar" }])
      .mockResolvedValueOnce([]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    const handle = createPaymentHandler({ authenticate: async () => user });

    const response = await handle(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("payment_provider_unavailable");
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
