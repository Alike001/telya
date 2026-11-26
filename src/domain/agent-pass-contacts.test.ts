import { describe, expect, it } from "vitest";
import type { Contact, RampTransaction } from "./contracts";

describe("Agent Pass & Contact Domain Invariants", () => {
  it("enforces contact structure with preferred receive network", () => {
    const contact: Contact = {
      id: "contact_1",
      ownerUserId: "user_1",
      displayName: "Alice Vance",
      username: "alice",
      destinations: [
        {
          network: "stellar",
          address: "CDMZP4Y6Y5W57GPYJ6Z2V637AAYY2V7L7D4U2QY35D2L4F5E6X7Y8Z90",
          isVerified: true,
        },
      ],
      preferredReceiveNetwork: "stellar",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(contact.username).toBe("alice");
    expect(contact.preferredReceiveNetwork).toBe("stellar");
    expect(contact.destinations[0]?.isVerified).toBe(true);
  });

  it("calculates agent remaining allowance without floating point errors", () => {
    const spendingLimitAtomic = 25000000n; // 25.00 USDC (7 decimals)
    const spentAtomic = 5500000n; // 5.50 USDC
    const remainingAtomic =
      spentAtomic >= spendingLimitAtomic ? 0n : spendingLimitAtomic - spentAtomic;

    expect(remainingAtomic).toBe(19500000n); // exactly 19.50 USDC
  });

  it("clamps remaining allowance to zero when spent exceeds limit", () => {
    const spendingLimitAtomic = 10000000n;
    const spentAtomic = 15000000n;
    const remainingAtomic =
      spentAtomic >= spendingLimitAtomic ? 0n : spendingLimitAtomic - spentAtomic;

    expect(remainingAtomic).toBe(0n);
  });

  it("validates MoneyGram sandbox transaction model", () => {
    const rampTx: RampTransaction = {
      id: "ramp_123",
      userId: "user_1",
      provider: "moneygram",
      environment: "sandbox",
      direction: "cash_in",
      status: "completed",
      fiatCurrency: "USD",
      fiatAmount: "100.00",
      usdcAmount: "98.50",
      providerFeeAmount: "1.50",
      providerReference: "MG-98765432",
      failureCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    expect(rampTx.provider).toBe("moneygram");
    expect(rampTx.environment).toBe("sandbox");
    expect(Number(rampTx.fiatAmount) - Number(rampTx.providerFeeAmount)).toBe(
      Number(rampTx.usdcAmount),
    );
  });
});
