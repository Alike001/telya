import { afterEach, describe, expect, it, vi } from "vitest";

import { BASE_SEPOLIA_USDC } from "../../src/base/evm.ts";
import { quoteSupportedPaymentFees } from "./quotes.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("quotes Base direct gas from exact transfer calldata and live RPC quantities", async () => {
    vi.stubEnv("BASE_SEPOLIA_RPC_URL", "https://base-sepolia.example.test");
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const method = (JSON.parse(String(init?.body)) as { method: string }).method;
      const result = {
        eth_chainId: "0x14a34",
        eth_estimateGas: "0x5208",
        eth_gasPrice: "0x3b9aca00",
      }[method];
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(quoteSupportedPaymentFees({
      route: { id: "base_to_base", sourceNetwork: "base", destinationNetwork: "base", rail: "base_usdc" },
      amount: "5",
      sourceWallet: { id: "base-wallet", network: "base", address: `0x${"a".repeat(40)}` },
      destinationAddress: `0x${"b".repeat(40)}`,
    })).resolves.toEqual([{
      kind: "network",
      payer: "sender",
      asset: "ETH",
      amount: "0.000021",
      label: "Estimated Base Sepolia gas",
    }]);
    const estimateBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      method: string;
      params: readonly unknown[];
    };
    expect(estimateBody.method).toBe("eth_estimateGas");
    expect(estimateBody.params).toEqual([expect.objectContaining({
      from: `0x${"a".repeat(40)}`,
      to: BASE_SEPOLIA_USDC.toLowerCase(),
      data: expect.stringMatching(/^0xa9059cbb/),
    }), "latest"]);
  });
});
