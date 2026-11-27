import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
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

  it("keeps Stellar-to-Base unavailable without a real Circle forwarding quote", async () => {
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "configured-in-test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Circle unavailable")));
    await expect(quoteSupportedPaymentFees({
      route: { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" },
      amount: "1", sourceWallet, destinationAddress: `0x${"1".repeat(40)}`,
    })).rejects.toThrow("fee request failed");
  });

  it("quotes the exact Stellar-to-Base Standard destination forwarding fee", async () => {
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "configured-in-test");
    const fetcher = vi.fn().mockResolvedValue(Response.json([
      { finalityThreshold: 2_000, minimumFee: 0, forwardFee: { med: 52_683 } },
    ]));
    vi.stubGlobal("fetch", fetcher);
    await expect(quoteSupportedPaymentFees({
      route: { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" },
      amount: "5",
      sourceWallet,
      destinationAddress: `0x${"1".repeat(40)}`,
    })).resolves.toEqual([{
      kind: "provider",
      payer: "sender",
      asset: "USDC",
      amount: "0.052683",
      label: "Circle destination forwarding fee",
    }]);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/27/6?forward=true",
    );
  });

  it("keeps CCTP unavailable when a nonzero Standard rate needs unproven gross/net rounding", async () => {
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "configured-in-test");
    const fetcher = vi.fn().mockResolvedValue(Response.json([
      { finalityThreshold: 2_000, minimumFee: 0.1 },
    ]));
    vi.stubGlobal("fetch", fetcher);
    await expect(quoteSupportedPaymentFees({
      route: { id: "base_to_stellar_cctp", sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard" },
      amount: "5",
      sourceWallet: { id: "base-wallet", network: "base", address: `0x${"a".repeat(40)}` },
      destinationAddress: StrKey.encodeContract(Buffer.alloc(32, 5)),
    })).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
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

  it("quotes Base-to-Stellar Standard provider, approval and burn fees from live inputs", async () => {
    vi.stubEnv("BASE_SEPOLIA_RPC_URL", "https://base-sepolia.example.test");
    vi.stubEnv("STELLAR_FEE_SPONSOR_SECRET", "configured-in-test");
    vi.stubEnv("STELLAR_RPC_URL", "https://stellar.example.test");
    vi.stubEnv("STELLAR_NETWORK_PASSPHRASE", Networks.TESTNET);
    vi.stubEnv("STELLAR_USDC_SAC", StrKey.encodeContract(Buffer.alloc(32, 1)));
    vi.stubEnv("CCTP_STELLAR_TOKEN_MESSENGER", StrKey.encodeContract(Buffer.alloc(32, 2)));
    vi.stubEnv("CCTP_STELLAR_MESSAGE_TRANSMITTER", StrKey.encodeContract(Buffer.alloc(32, 3)));
    vi.stubEnv("CCTP_STELLAR_FORWARDER", StrKey.encodeContract(Buffer.alloc(32, 4)));
    vi.stubEnv("CCTP_BASE_DOMAIN", "6");
    vi.stubEnv("CCTP_STELLAR_DOMAIN", "27");
    const rpcBodies: Array<{ method: string; params: readonly unknown[] }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://iris-api-sandbox.circle.com/")) {
        return Response.json([
          { finalityThreshold: 1_000, minimumFee: 1.3 },
          { finalityThreshold: 2_000, minimumFee: 0 },
        ]);
      }
      const body = JSON.parse(String(init?.body)) as { method: string; params: readonly unknown[] };
      rpcBodies.push(body);
      if (body.method === "eth_chainId") return Response.json({ jsonrpc: "2.0", id: 1, result: "0x14a34" });
      if (body.method === "eth_call") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      if (body.method === "eth_gasPrice") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x3b9aca00" });
      }
      const transaction = body.params[0] as { data: string };
      const result = transaction.data.startsWith("0x095ea7b3") ? "0xc350" : "0x186a0";
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(quoteSupportedPaymentFees({
      route: { id: "base_to_stellar_cctp", sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard" },
      amount: "5",
      sourceWallet: { id: "base-wallet", network: "base", address: `0x${"a".repeat(40)}` },
      destinationAddress: StrKey.encodeContract(Buffer.alloc(32, 5)),
    })).resolves.toEqual([
      { kind: "provider", payer: "sender", asset: "USDC", amount: "0", label: "Circle CCTP Standard fee" },
      {
        kind: "network",
        payer: "sender",
        asset: "ETH",
        amount: "0.00015",
        label: "Estimated Base approval and CCTP burn gas",
      },
    ]);
    expect(rpcBodies.filter((body) => body.method === "eth_estimateGas").map((body) =>
      (body.params[0] as { data: string }).data.slice(0, 10))).toEqual(["0x095ea7b3", "0x8e0250ee"]);
  });
});
