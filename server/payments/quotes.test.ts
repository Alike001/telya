import { afterEach, describe, expect, it, vi } from "vitest";

import { quoteSupportedPaymentFees } from "./quotes.ts";

afterEach(() => vi.unstubAllEnvs());

describe("mounted payment fee policy", () => {
  const sourceWallet = { id: "wallet", network: "stellar" as const, address: "CADDRESS" };
  const direct = { id: "stellar_to_stellar" as const, sourceNetwork: "stellar" as const,
    destinationNetwork: "stellar" as const, rail: "stellar_usdc" as const };

  it("reports no sender-paid USDC fee only when direct Stellar sponsorship is configured", async () => {
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "configured-in-test");
    await expect(quoteSupportedPaymentFees({ route: direct, amount: "1", sourceWallet, destinationAddress: "CDEST" }))
      .resolves.toEqual([]);
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "");
    await expect(quoteSupportedPaymentFees({ route: direct, amount: "1", sourceWallet, destinationAddress: "CDEST" }))
      .resolves.toBeNull();
  });

  it("keeps CCTP unavailable without a real Circle fee quote", async () => {
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "configured-in-test");
    await expect(quoteSupportedPaymentFees({
      route: { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" },
      amount: "1", sourceWallet, destinationAddress: `0x${"1".repeat(40)}`,
    })).resolves.toBeNull();
  });
});
