import { afterEach, describe, expect, it, vi } from "vitest";
import * as dbClient from "../db/client.ts";
import { PaymentInputError, validatePaymentIntentMessage } from "./service.ts";

const user = { id: "00000000-0000-0000-0000-000000000001" };
const baseInput = {
  conversationId: "00000000-0000-0000-0000-000000000002",
  intentMessageId: "00000000-0000-0000-0000-000000000003",
  inputMode: "manual" as const,
  intent: {
    amount: "2",
    asset: "USDC" as const,
    recipientInput: "@alice",
    requestedSourceNetwork: null,
    requestedDestinationNetwork: null,
  },
};

afterEach(() => vi.restoreAllMocks());

describe("saved payment intent validation", () => {
  it("rejects changed amount or recipient in manual mode just as in text mode", async () => {
    const sql = vi.fn().mockResolvedValue([{ content: "Send 2 USDC to @alice" }]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);

    await expect(validatePaymentIntentMessage(user, baseInput)).resolves.toBeUndefined();
    await expect(validatePaymentIntentMessage(user, {
      ...baseInput,
      intent: { ...baseInput.intent, amount: "20" },
    })).rejects.toBeInstanceOf(PaymentInputError);
    await expect(validatePaymentIntentMessage(user, {
      ...baseInput,
      intent: { ...baseInput.intent, recipientInput: "@mallory" },
    })).rejects.toBeInstanceOf(PaymentInputError);
  });

  it("rejects a network override that was absent from the saved manual request", async () => {
    const sql = vi.fn().mockResolvedValue([{ content: "Send 2 USDC to @alice" }]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);

    await expect(validatePaymentIntentMessage(user, {
      ...baseInput,
      intent: { ...baseInput.intent, requestedSourceNetwork: "base" },
    })).rejects.toBeInstanceOf(PaymentInputError);
  });
});
