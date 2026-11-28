import { describe, expect, it } from "vitest";
import { PaymentProviderUnavailableError, paymentSpendFitsBalance, validateFeeList } from "./service.ts";

const providerFee = {
  kind: "provider" as const,
  payer: "sender" as const,
  asset: "USDC",
  amount: "0.125001",
  label: "Circle fee",
};

describe("payment review affordability", () => {
  it("requires enough source USDC for the recipient amount plus sender-paid USDC fees", () => {
    expect(paymentSpendFitsBalance({
      balance: "5",
      expectedRecipientAmount: "5",
      fees: [providerFee],
    })).toBe(false);
    expect(paymentSpendFitsBalance({
      balance: "5.125001",
      expectedRecipientAmount: "5",
      fees: [providerFee],
    })).toBe(true);
    expect(paymentSpendFitsBalance({
      balance: "5.125000",
      expectedRecipientAmount: "5",
      fees: [providerFee],
    })).toBe(false);
  });

  it("does not subtract a sponsor-paid fee from the user's USDC balance", () => {
    expect(paymentSpendFitsBalance({
      balance: "5",
      expectedRecipientAmount: "5",
      fees: [{ ...providerFee, payer: "sponsor" }],
    })).toBe(true);
  });

  it("fails closed when the balance or a quoted sender fee cannot be parsed", () => {
    expect(paymentSpendFitsBalance({
      balance: null,
      expectedRecipientAmount: "5",
      fees: [providerFee],
    })).toBeNull();
    expect(paymentSpendFitsBalance({
      balance: "5",
      expectedRecipientAmount: "5",
      fees: [{ ...providerFee, amount: "unavailable" }],
    })).toBeNull();
  });

  it("rejects a malformed provider quote before calculating or saving a payment", () => {
    expect(() => validateFeeList([{ ...providerFee, amount: "unavailable" }])).toThrow(PaymentProviderUnavailableError);
    expect(() => validateFeeList([null] as unknown as typeof providerFee[])).toThrow(PaymentProviderUnavailableError);
  });
});
