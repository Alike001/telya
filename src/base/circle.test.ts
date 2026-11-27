import { describe, expect, it, vi } from "vitest";

import { getCircleCctpStandardFeeQuote, getCircleCctpStatus } from "./circle";

const SOURCE_TX = `0x${"a".repeat(64)}`;
const MESSAGE = `0x${"01".repeat(200)}`;
const ATTESTATION = `0x${"ab".repeat(65)}`;

describe("Circle CCTP Testnet status", () => {
  it("treats not-yet-indexed burns as pending", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(getCircleCctpStatus({
      sourceDomain: 6,
      sourceTransactionHash: SOURCE_TX,
      fetcher,
    })).resolves.toEqual({ status: "pending", sourceTransactionHash: SOURCE_TX });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash=${SOURCE_TX}`,
    );
  });

  it("returns durable message and attestation hashes only for a complete matching response", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      sourceTxHash: SOURCE_TX,
      messages: [{
        message: MESSAGE,
        eventNonce: "9",
        attestation: ATTESTATION,
        status: "complete",
        cctpVersion: 2,
        forwardTxHash: `0x${"d".repeat(64)}`,
      }],
    }));
    await expect(getCircleCctpStatus({
      sourceDomain: 6,
      sourceTransactionHash: SOURCE_TX,
      fetcher,
    })).resolves.toMatchObject({
      status: "complete",
      sourceTransactionHash: SOURCE_TX,
      message: MESSAGE,
      attestation: ATTESTATION,
      messageHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      attestationHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      forwardTransactionHash: `0x${"d".repeat(64)}`,
    });
  });

  it("rejects a malformed forwarding transaction hash", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      sourceTxHash: SOURCE_TX,
      messages: [{
        message: MESSAGE,
        eventNonce: "9",
        attestation: ATTESTATION,
        status: "complete",
        forwardTxHash: "not-a-hash",
      }],
    }));
    await expect(getCircleCctpStatus({
      sourceDomain: 27,
      sourceTransactionHash: SOURCE_TX,
      fetcher,
    })).rejects.toThrow("forwarding transaction hash is invalid");
  });

  it("rejects a response for another source transaction and refuses a mainnet API host", async () => {
    await expect(getCircleCctpStatus({
      sourceDomain: 6,
      sourceTransactionHash: SOURCE_TX,
      fetcher: vi.fn().mockResolvedValue(Response.json({
        sourceTxHash: `0x${"b".repeat(64)}`,
        messages: [],
      })),
    })).rejects.toThrow("does not match the requested source transaction");
    await expect(getCircleCctpStatus({
      sourceDomain: 6,
      sourceTransactionHash: SOURCE_TX,
      apiBaseUrl: "https://iris-api.circle.com",
      fetcher: vi.fn(),
    })).rejects.toThrow("restricted to Circle Testnet");
  });
});

describe("Circle CCTP Standard Transfer fee quote", () => {
  it.each([
    { sourceDomain: 6, destinationDomain: 27 },
    { sourceDomain: 27, destinationDomain: 6 },
  ])("returns the exact Standard quote for $sourceDomain -> $destinationDomain", async (route) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([
      { finalityThreshold: 1_000, minimumFee: 1.3 },
      { finalityThreshold: 2_000, minimumFee: 0 },
    ]));
    await expect(getCircleCctpStandardFeeQuote({ ...route, fetcher })).resolves.toEqual({
      ...route,
      finalityThreshold: 2_000,
      minimumFeeBps: "0",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/${route.sourceDomain}/${route.destinationDomain}`,
    );
  });

  it("returns the exact Standard Forwarding Service quote", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([
      { finalityThreshold: 1_000, minimumFee: 0, forwardFee: { med: 52_100 } },
      { finalityThreshold: 2_000, minimumFee: 0, forwardFee: { med: 52_683 } },
    ]));
    await expect(getCircleCctpStandardFeeQuote({
      sourceDomain: 27,
      destinationDomain: 6,
      forward: true,
      fetcher,
    })).resolves.toEqual({
      sourceDomain: 27,
      destinationDomain: 6,
      finalityThreshold: 2_000,
      minimumFeeBps: "0",
      forwardFeeAtomic: "52683",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/27/6?forward=true",
    );
  });

  it.each([undefined, -1, 1.5, "01", "not-a-fee"])(
    "rejects malformed Forwarding Service median fee %s",
    async (med) => {
      await expect(getCircleCctpStandardFeeQuote({
        sourceDomain: 27,
        destinationDomain: 6,
        forward: true,
        fetcher: vi.fn().mockResolvedValue(Response.json([
          { finalityThreshold: 2_000, minimumFee: 0, forwardFee: { med } },
        ])),
      })).rejects.toThrow("Forwarding Service fee");
    },
  );

  it.each([
    { name: "no standard entry", payload: [{ finalityThreshold: 1_000, minimumFee: 1 }] },
    { name: "duplicate standard entries", payload: [
      { finalityThreshold: 2_000, minimumFee: 0 },
      { finalityThreshold: 2_000, minimumFee: 0 },
    ] },
    { name: "negative fee", payload: [{ finalityThreshold: 2_000, minimumFee: -1 }] },
    { name: "fee over 100 percent", payload: [{ finalityThreshold: 2_000, minimumFee: 10_001 }] },
    { name: "non-list response", payload: { finalityThreshold: 2_000, minimumFee: 0 } },
  ])("rejects $name", async ({ payload }) => {
    await expect(getCircleCctpStandardFeeQuote({
      sourceDomain: 6,
      destinationDomain: 27,
      fetcher: vi.fn().mockResolvedValue(Response.json(payload)),
    })).rejects.toThrow();
  });

  it("rejects unsupported routes and non-Testnet API hosts before fetching", async () => {
    const fetcher = vi.fn();
    await expect(getCircleCctpStandardFeeQuote({
      sourceDomain: 6,
      destinationDomain: 0,
      fetcher,
    })).rejects.toThrow("Unsupported Telya CCTP fee route");
    await expect(getCircleCctpStandardFeeQuote({
      sourceDomain: 6,
      destinationDomain: 27,
      apiBaseUrl: "https://iris-api.circle.com",
      fetcher,
    })).rejects.toThrow("restricted to Circle Testnet");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
