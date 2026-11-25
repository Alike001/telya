import { describe, expect, it, vi } from "vitest";

import { getCircleCctpStatus } from "./circle";

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
    });
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
