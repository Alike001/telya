import { describe, expect, it, vi } from "vitest";

import { parseAiPaymentIntent, resolveConversationIntent } from "./conversation-intent";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe("conversation intent boundary", () => {
  it("accepts only a constrained AI payment draft and preserves input mode", () => {
    expect(parseAiPaymentIntent({
      status: "parsed",
      intent: {
        action: "send",
        amount: "1.25",
        asset: "USDC",
        recipientInput: "@alice",
        requestedSourceNetwork: "base",
        requestedDestinationNetwork: "stellar",
      },
    }, "Please pay @alice 1.25 USDC from Base to Stellar", "voice")).toEqual({
      kind: "payment",
      originalInput: "Please pay @alice 1.25 USDC from Base to Stellar",
      inputMode: "voice",
      amount: "1.25",
      recipientInput: "@alice",
      requestedSourceNetwork: "base",
      requestedDestinationNetwork: "stellar",
    });
  });

  it("rejects malformed or financially unsupported AI fields", () => {
    expect(parseAiPaymentIntent({
      status: "parsed",
      intent: {
        action: "send",
        amount: "1.0000001",
        asset: "USDC",
        recipientInput: "@alice",
        requestedSourceNetwork: "base",
        requestedDestinationNetwork: "solana",
      },
    }, "send", "text")).toBeNull();
  });

  it("uses the authenticated AI draft without granting execution authority", async () => {
    const request = vi.fn().mockResolvedValue(json({
      status: "parsed",
      intent: {
        action: "send",
        amount: "5",
        asset: "USDC",
        recipientInput: "Alice Smith",
        requestedSourceNetwork: null,
        requestedDestinationNetwork: null,
      },
    }));

    await expect(resolveConversationIntent(
      "Please send Alice Smith 5 USDC",
      "text",
      request,
    )).resolves.toMatchObject({
      kind: "payment",
      amount: "5",
      recipientInput: "Alice Smith",
    });
    expect(request).toHaveBeenCalledWith("/api/intent", expect.objectContaining({ method: "POST" }));
  });

  it("produces the same payment fields for typed and successful voice input", async () => {
    const payload = {
      status: "parsed",
      intent: {
        action: "send",
        amount: "5",
        asset: "USDC",
        recipientInput: "@alice",
        requestedSourceNetwork: null,
        requestedDestinationNetwork: "stellar",
      },
    };
    const typed = await resolveConversationIntent(
      "Send 5 USDC to @alice on Stellar",
      "text",
      vi.fn().mockResolvedValue(json(payload)),
    );
    const voice = await resolveConversationIntent(
      "Send 5 USDC to @alice on Stellar",
      "voice",
      vi.fn().mockResolvedValue(json(payload)),
    );

    expect({ ...typed, inputMode: undefined }).toEqual({ ...voice, inputMode: undefined });
    expect(typed.inputMode).toBe("text");
    expect(voice.inputMode).toBe("voice");
  });

  it.each([
    ["provider fallback", json({ status: "manual_fallback", reason: "provider_unavailable" })],
    ["provider error", json({ error: "provider_unavailable" }, 503)],
  ])("keeps the deterministic typed path during %s", async (_label, response) => {
    await expect(resolveConversationIntent(
      "Send 5 USDC to @alice",
      "text",
      vi.fn().mockResolvedValue(response),
    )).resolves.toMatchObject({
      kind: "payment",
      amount: "5",
      recipientInput: "@alice",
      inputMode: "text",
    });
  });

  it("keeps the deterministic typed path when the AI request throws", async () => {
    await expect(resolveConversationIntent(
      "Send 5 USDC to @alice",
      "text",
      vi.fn().mockRejectedValue(new Error("offline")),
    )).resolves.toMatchObject({ kind: "payment", amount: "5", recipientInput: "@alice" });
  });

  it("does not call AI for deterministic account queries", async () => {
    const request = vi.fn();
    await expect(resolveConversationIntent("Check my balance", "text", request))
      .resolves.toMatchObject({ kind: "balance_check" });
    expect(request).not.toHaveBeenCalled();
  });
});
