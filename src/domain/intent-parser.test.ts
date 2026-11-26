import { describe, expect, it } from "vitest";
import { parseNaturalLanguageIntent } from "./intent-parser";

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

  it("parses activity and 'where is my money right now' queries", () => {
    const result1 = parseNaturalLanguageIntent("Where is my money right now?");
    expect(result1.kind).toBe("activity_check");

    const result2 = parseNaturalLanguageIntent("Show my payment activity");
    expect(result2.kind).toBe("activity_check");

    const result3 = parseNaturalLanguageIntent("view transaction history");
    expect(result3.kind).toBe("activity_check");
  });

  it("parses contacts directory queries", () => {
    const result1 = parseNaturalLanguageIntent("open my contacts");
    expect(result1.kind).toBe("contacts_check");

    const result2 = parseNaturalLanguageIntent("who can I pay?");
    expect(result2.kind).toBe("contacts_check");
  });

  it("parses MoneyGram cash ramp queries", () => {
    const result1 = parseNaturalLanguageIntent("add money with MoneyGram");
    expect(result1.kind).toBe("ramp_check");

    const result2 = parseNaturalLanguageIntent("deposit cash in store");
    expect(result2.kind).toBe("ramp_check");

    const result3 = parseNaturalLanguageIntent("withdraw cash");
    expect(result3.kind).toBe("ramp_check");
  });

  it("parses Judge mode and evaluator guide queries", () => {
    const result1 = parseNaturalLanguageIntent("open judge mode");
    expect(result1.kind).toBe("judge_check");

    const result2 = parseNaturalLanguageIntent("how to test Telya");
    expect(result2.kind).toBe("judge_check");
  });

  it("parses full payment intent with @username and amount", () => {
    const result = parseNaturalLanguageIntent("Send 5 USDC to @alice");
    expect(result.kind).toBe("payment");
    expect(result.amount).toBe("5");
    expect(result.recipientInput).toBe("@alice");
  });

  it("parses payment intent with dollar sign and lowercase handle", () => {
    const result = parseNaturalLanguageIntent("Pay @bob $12.50 from Base");
    expect(result.kind).toBe("payment");
    expect(result.amount).toBe("12.50");
    expect(result.recipientInput).toBe("@bob");
    expect(result.requestedSourceNetwork).toBe("base");
  });

  it("preserves seven-decimal amounts without rounding", () => {
    const result = parseNaturalLanguageIntent("Send 0.0000001 USDC to @alice");
    expect(result.kind).toBe("payment");
    expect(result.amount).toBe("0.0000001");
  });

  it("does not take an amount from digits in a username", () => {
    const result = parseNaturalLanguageIntent("Send USDC to @alice123");
    expect(result.kind).toBe("clarification");
    expect(result.recipientInput).toBe("@alice123");
    expect(result.amount).toBeUndefined();
  });

  it("prompts for clarification when amount is provided without recipient", () => {
    const result = parseNaturalLanguageIntent("Send 10 USDC");
    expect(result.kind).toBe("clarification");
    expect(result.amount).toBe("10");
    expect(result.clarificationQuestion).toContain("Who would you like to send 10 USDC to?");
  });

  it("prompts for clarification when recipient is provided without amount", () => {
    const result = parseNaturalLanguageIntent("Transfer USDC to @charlie");
    expect(result.kind).toBe("clarification");
    expect(result.recipientInput).toBe("@charlie");
    expect(result.clarificationQuestion).toContain("How much USDC would you like to send to @charlie?");
  });
});
