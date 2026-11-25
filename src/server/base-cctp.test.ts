import { Buffer } from "node:buffer";

import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_USDC,
  type BaseRpc,
  type BaseTransactionReceipt,
} from "../base/evm";
import { verifyBaseCctpSource } from "./base-cctp";

const SOURCE_HASH = `0x${"a".repeat(64)}`;
const SOURCE_WALLET = `0x${"b".repeat(40)}`;
const STELLAR_FORWARDER = StrKey.encodeContract(Buffer.alloc(32, 0x44));
const MESSAGE_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";

function uint32(value: number): string {
  return value.toString(16).padStart(8, "0");
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function buildCctpMessage(amount: bigint, maxFee: bigint): string {
  const header = [
    uint32(1), uint32(6), uint32(27),
    "0".repeat(64),
    "1".repeat(64),
    "2".repeat(64),
    "0".repeat(64), uint32(2_000), uint32(2_000),
  ].join("");
  const body = [
    uint32(1),
    BASE_SEPOLIA_USDC.slice(2).toLowerCase().padStart(64, "0"),
    Buffer.from(StrKey.decodeContract(STELLAR_FORWARDER)).toString("hex"),
    word(amount),
    `0x${SOURCE_WALLET.slice(2).padStart(64, "0")}`.slice(2),
    word(maxFee), word(0n), word(0n), word(0n),
  ].join("");
  return `0x${header}${body}`;
}

function sourceRpc(message: string): BaseRpc {
  const data = message.slice(2);
  const encodedEvent = `${word(32n)}${word(BigInt(data.length / 2))}${data.padEnd(Math.ceil(data.length / 64) * 64, "0")}`;
  const receipt: BaseTransactionReceipt = {
    transactionHash: SOURCE_HASH,
    status: "0x1",
    blockNumber: "0x10",
    logs: [{
      address: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
      topics: [MESSAGE_TOPIC],
      data: `0x${encodedEvent}`,
    }],
  };
  const request = vi.fn(async (method: string) => {
    if (method === "eth_getTransactionReceipt") return receipt;
    if (method === "eth_getBlockByNumber") return { number: "0x11" };
    throw new Error(`Unexpected RPC method ${method}`);
  });
  return { request: request as unknown as BaseRpc["request"] };
}

describe("Base-to-Stellar CCTP source verification", () => {
  it("accepts only the finalized Base message Circle attested for the reserved intent", async () => {
    const message = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(message),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedMintRecipient: STELLAR_FORWARDER,
      fetchCircle: vi.fn().mockResolvedValue({
        status: "complete",
        sourceTransactionHash: SOURCE_HASH,
        message,
        attestation: `0x${"c".repeat(130)}`,
        messageHash: "1".repeat(64),
        attestationHash: "2".repeat(64),
      }),
    });
    expect(result).toMatchObject({
      status: "verified",
      sourceTransactionHash: SOURCE_HASH,
      amountAtomic: "5100000",
    });
  });

  it("rejects a callback whose reserved max fee differs from Circle's attested message", async () => {
    const message = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(message),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.2",
      expectedMintRecipient: STELLAR_FORWARDER,
      fetchCircle: vi.fn().mockResolvedValue({
        status: "complete",
        sourceTransactionHash: SOURCE_HASH,
        message,
        attestation: `0x${"c".repeat(130)}`,
        messageHash: "1".repeat(64),
        attestationHash: "2".repeat(64),
      }),
    });
    expect(result.status).toBe("mismatch");
  });
});
