import { Buffer } from "node:buffer";

import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
  type BaseRpc,
  type BaseTransactionReceipt,
} from "../base/evm";
import { verifyBaseCctpSource } from "./base-cctp";

const SOURCE_HASH = `0x${"a".repeat(64)}`;
const SOURCE_WALLET = `0x${"b".repeat(40)}`;
const STELLAR_FORWARDER = StrKey.encodeContract(Buffer.alloc(32, 0x44));
const STELLAR_TOKEN_MESSENGER = StrKey.encodeContract(Buffer.alloc(32, 0x22));
const MESSAGE_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";

function uint32(value: number): string {
  return value.toString(16).padStart(8, "0");
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function contractAddressAsBytes32(address: string): string {
  return Buffer.from(StrKey.decodeContract(address)).toString("hex");
}

function buildCctpMessage(
  amount: bigint,
  maxFee: bigint,
  options: {
    readonly sender?: string;
    readonly recipient?: string;
    readonly minFinalityThreshold?: number;
    readonly finalityThresholdExecuted?: number;
    readonly expirationBlock?: bigint;
  } = {},
): string {
  const header = [
    uint32(1), uint32(6), uint32(27),
    "0".repeat(64),
    options.sender ?? BASE_SEPOLIA_TOKEN_MESSENGER.slice(2).toLowerCase().padStart(64, "0"),
    options.recipient ?? contractAddressAsBytes32(STELLAR_TOKEN_MESSENGER),
    "0".repeat(64),
    uint32(options.minFinalityThreshold ?? 2_000),
    uint32(options.finalityThresholdExecuted ?? 0),
  ].join("");
  const body = [
    uint32(1),
    BASE_SEPOLIA_USDC.slice(2).toLowerCase().padStart(64, "0"),
    Buffer.from(StrKey.decodeContract(STELLAR_FORWARDER)).toString("hex"),
    word(amount),
    `0x${SOURCE_WALLET.slice(2).padStart(64, "0")}`.slice(2),
    word(maxFee), word(0n), word(options.expirationBlock ?? 0n), word(0n),
  ].join("");
  return `0x${header}${body}`;
}

function attestCctpMessage(sourceMessage: string, executedFinality = 2_000): string {
  const bytes = sourceMessage.slice(2);
  return `0x${bytes.slice(0, 288)}${uint32(executedFinality)}${bytes.slice(296, 688)}${word(123_456n)}${bytes.slice(752)}`;
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
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const message = attestCctpMessage(sourceMessage);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
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
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const message = attestCctpMessage(sourceMessage);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.2",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
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

  it("rejects an arbitrary MessageTransmitter message not sent by Base TokenMessenger", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n, {
      sender: `0x${"9".repeat(64)}`.slice(2),
    });
    const message = attestCctpMessage(sourceMessage);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
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

  it("rejects a source message with the wrong Base TokenMessenger header sender", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n, {
      sender: `0x${"0".repeat(24)}${"3".repeat(40)}`.slice(2),
    });
    const message = attestCctpMessage(sourceMessage);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
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

  it("rejects a source message addressed to the wrong Stellar TokenMessenger", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n, {
      recipient: "f".repeat(64),
    });
    const message = attestCctpMessage(sourceMessage);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
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

  it.each([
    { name: "Fast Transfer minimum", minFinalityThreshold: 1_000, finalityThresholdExecuted: 1_000 },
    { name: "non-Standard minimum", minFinalityThreshold: 3_000, finalityThresholdExecuted: 3_000 },
    { name: "execution below Standard finality", minFinalityThreshold: 2_000, finalityThresholdExecuted: 1_000 },
  ])("rejects $name finality", async ({ minFinalityThreshold, finalityThresholdExecuted }) => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n, {
      minFinalityThreshold,
    });
    const message = attestCctpMessage(sourceMessage, finalityThresholdExecuted);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
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
