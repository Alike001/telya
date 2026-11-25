import { describe, expect, it } from "vitest";
import {
  parseNaturalLanguageIntent,
  resolvePaymentRouteDecision,
} from "./intent-parser";

describe("Deterministic Intent Parser", () => {
  it("parses balance check queries", () => {
    const result1 = parseNaturalLanguageIntent("check my balance");
    expect(result1.kind).toBe("balance_check");

    const result2 = parseNaturalLanguageIntent("How much do I have?");
    expect(result2.kind).toBe("balance_check");
  });

  it("parses agent pass check queries", () => {
    const result = parseNaturalLanguageIntent("show my active agent passes");
    expect(result.kind).toBe("agent_pass_check");
  });

  it("parses full payment intent with @username and amount", () => {
    const result = parseNaturalLanguageIntent("Send 5 USDC to @alice");
    expect(result.kind).toBe("payment");
    expect(result.amount).toBe("5.00");
    expect(result.recipientInput).toBe("@alice");
  });

  it("parses payment intent with dollar sign and lowercase handle", () => {
    const result = parseNaturalLanguageIntent("Pay @bob $12.50 from Base");
    expect(result.kind).toBe("payment");
    expect(result.amount).toBe("12.50");
    expect(result.recipientInput).toBe("@bob");
    expect(result.requestedSourceNetwork).toBe("base");
  });

  it("prompts for clarification when amount is provided without recipient", () => {
    const result = parseNaturalLanguageIntent("Send 10 USDC");
    expect(result.kind).toBe("clarification");
    expect(result.amount).toBe("10.00");
    expect(result.clarificationQuestion).toContain("Who would you like to send 10.00 USDC to?");
  });

  it("prompts for clarification when recipient is provided without amount", () => {
    const result = parseNaturalLanguageIntent("Transfer USDC to @charlie");
    expect(result.kind).toBe("clarification");
    expect(result.recipientInput).toBe("@charlie");
    expect(result.clarificationQuestion).toContain("How much USDC would you like to send to @charlie?");
  });
});

describe("Deterministic Route Resolver", () => {
  it("resolves Stellar-to-Stellar direct route with sponsored fee", () => {
    const decision = resolvePaymentRouteDecision({
      paymentIntentId: "intent_1",
      amount: "5.00",
      recipientInput: "@alice",
      requestedSourceNetwork: "stellar",
      userBalances: { stellarUsdc: "100.00", baseUsdc: "0.00" },
    });

    expect(decision.status).toBe("resolved");
    if (decision.status === "resolved") {
      expect(decision.route.id).toBe("stellar_to_stellar");
      expect(decision.route.rail).toBe("stellar_usdc");
      expect(decision.fees[0]?.payer).toBe("sponsor");
      expect(decision.explanation.toLowerCase()).toContain("sponsored by telya");
    }
  });

  it("resolves Base-to-Stellar Circle CCTP route when funds are on Base", () => {
    const decision = resolvePaymentRouteDecision({
      paymentIntentId: "intent_2",
      amount: "15.00",
      recipientInput: "@alice",
      requestedSourceNetwork: "base",
      userBalances: { stellarUsdc: "0.00", baseUsdc: "50.00" },
    });

    expect(decision.status).toBe("resolved");
    if (decision.status === "resolved") {
      expect(decision.route.id).toBe("base_to_stellar_cctp");
      expect(decision.route.rail).toBe("circle_cctp_standard");
    }
  });

  it("requires clarification when user has sufficient balance on BOTH networks and did not specify", () => {
    const decision = resolvePaymentRouteDecision({
      paymentIntentId: "intent_3",
      amount: "10.00",
      recipientInput: "@bob",
      userBalances: { stellarUsdc: "100.00", baseUsdc: "100.00" },
    });

    expect(decision.status).toBe("needs_clarification");
    if (decision.status === "needs_clarification") {
      expect(decision.reasonCode).toBe("ambiguous_requires_clarification");
      expect(decision.clarificationQuestion).toContain("Which wallet would you like to send");
    }
  });
});
