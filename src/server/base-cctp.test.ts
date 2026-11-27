import { Buffer } from "node:buffer";

import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
  encodeCctpForwarderHookData,
  type BaseRpc,
  type BaseTransactionReceipt,
} from "../base/evm";
import { verifyBaseCctpSource } from "./base-cctp";

const SOURCE_HASH = `0x${"a".repeat(64)}`;
const SOURCE_WALLET = `0x${"b".repeat(40)}`;
const STELLAR_FORWARDER = StrKey.encodeContract(Buffer.alloc(32, 0x44));
const STELLAR_FINAL_RECIPIENT = StrKey.encodeContract(Buffer.alloc(32, 0x55));
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
    readonly nonce?: string;
    readonly sender?: string;
    readonly recipient?: string;
    readonly minFinalityThreshold?: number;
    readonly finalityThresholdExecuted?: number;
    readonly feeExecuted?: bigint;
    readonly expirationBlock?: bigint;
    readonly destinationCaller?: string;
    readonly hookData?: string;
  } = {},
): string {
  const header = [
    uint32(1), uint32(6), uint32(27),
    options.nonce ?? "0".repeat(64),
    options.sender ?? BASE_SEPOLIA_TOKEN_MESSENGER.slice(2).toLowerCase().padStart(64, "0"),
    options.recipient ?? contractAddressAsBytes32(STELLAR_TOKEN_MESSENGER),
    options.destinationCaller ?? contractAddressAsBytes32(STELLAR_FORWARDER),
    uint32(options.minFinalityThreshold ?? 2_000),
    uint32(options.finalityThresholdExecuted ?? 0),
  ].join("");
  const body = [
    uint32(1),
    BASE_SEPOLIA_USDC.slice(2).toLowerCase().padStart(64, "0"),
    Buffer.from(StrKey.decodeContract(STELLAR_FORWARDER)).toString("hex"),
    word(amount),
    `0x${SOURCE_WALLET.slice(2).padStart(64, "0")}`.slice(2),
    word(maxFee), word(options.feeExecuted ?? 0n),
    word(options.expirationBlock ?? 0n),
    (options.hookData ?? encodeCctpForwarderHookData(STELLAR_FINAL_RECIPIENT)).slice(2),
  ].join("");
  return `0x${header}${body}`;
}

function replaceBytes(message: string, offset: number, length: number, replacement: string): string {
  const bytes = message.replace(/^0x/, "");
  const start = offset * 2;
  const end = (offset + length) * 2;
  if (replacement.length !== length * 2) throw new Error("Replacement has the wrong byte length");
  return `0x${bytes.slice(0, start)}${replacement}${bytes.slice(end)}`;
}

function attestCctpMessage(
  sourceMessage: string,
  options: {
    readonly nonce?: string;
    readonly finalityThresholdExecuted?: number;
    readonly feeExecuted?: bigint;
    readonly expirationBlock?: bigint;
  } = {},
): string {
  let message = replaceBytes(sourceMessage, 12, 32, options.nonce ?? "a".repeat(64));
  message = replaceBytes(
    message,
    144,
    4,
    uint32(options.finalityThresholdExecuted ?? 2_000),
  );
  message = replaceBytes(message, 312, 32, word(options.feeExecuted ?? 100_000n));
  return replaceBytes(message, 344, 32, word(options.expirationBlock ?? 123_456n));
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

function verifySourceMessages(input: {
  readonly sourceMessage: string;
  readonly attestedMessage: string;
  readonly sourceAddress?: string;
  readonly burnAmount?: string;
  readonly maxFee?: string;
  readonly expectedRecipientAmount?: string;
}) {
  return verifyBaseCctpSource({
    rpc: sourceRpc(input.sourceMessage),
    sourceTransactionHash: SOURCE_HASH,
    sourceAddress: input.sourceAddress ?? SOURCE_WALLET,
    burnAmount: input.burnAmount ?? "5.1",
    maxFee: input.maxFee ?? "0.1",
    expectedRecipientAmount: input.expectedRecipientAmount ?? "5",
    expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
    expectedMintRecipient: STELLAR_FORWARDER,
    expectedDestinationTokenMessenger: STELLAR_TOKEN_MESSENGER,
    fetchCircle: vi.fn().mockResolvedValue({
      status: "complete",
      sourceTransactionHash: SOURCE_HASH,
      message: input.attestedMessage,
      attestation: `0x${"c".repeat(130)}`,
      messageHash: "1".repeat(64),
      attestationHash: "2".repeat(64),
    }),
  });
}

describe("Base-to-Stellar CCTP source verification", () => {
  it("accepts an exact six-decimal amount read back from numeric(38,18)", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage),
      expectedRecipientAmount: "5.000000000000000000",
    });
    expect(result.status).toBe("verified");
  });

  it.each([
    { name: "zero destination caller", options: { destinationCaller: "0".repeat(64) } },
    { name: "empty hook", options: { hookData: "0x" } },
    { name: "wrong final recipient", options: { hookData: encodeCctpForwarderHookData(STELLAR_FORWARDER) } },
  ])("rejects attested $name before Stellar mint", async ({ options }) => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n, options);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage),
    });
    expect(result.status).toBe("mismatch");
  });

  it("accepts only the finalized Base message Circle attested for the reserved intent", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const message = attestCctpMessage(sourceMessage);
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedRecipientAmount: "5",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
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

  it.each([
    { name: "nonce", options: { nonce: "1".repeat(64) } },
    { name: "executed finality", options: { finalityThresholdExecuted: 1 } },
    { name: "executed fee", options: { feeExecuted: 1n } },
    { name: "expiration block", options: { expirationBlock: 1n } },
  ])("rejects a source message whose $name placeholder is nonzero", async ({ options }) => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n, options);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage),
    });
    expect(result.status).toBe("mismatch");
  });

  it.each([
    { name: "before nonce", offset: 11 },
    { name: "after nonce", offset: 44 },
    { name: "before executed finality", offset: 143 },
    { name: "after executed finality", offset: 148 },
    { name: "before executed fee", offset: 311 },
    // feeExecuted ends where expirationBlock starts, so their shared boundary
    // is mutable; the next immutable byte is immediately after expirationBlock.
    { name: "after expiration block", offset: 376 },
  ])("rejects attested-message tampering $name", async ({ offset }) => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const attestedMessage = replaceBytes(attestCctpMessage(sourceMessage), offset, 1, "ff");
    const result = await verifySourceMessages({ sourceMessage, attestedMessage });
    expect(result.status).toBe("mismatch");
  });

  it("rejects an executed fee above the reserved maximum fee", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage, { feeExecuted: 100_001n }),
    });
    expect(result.status).toBe("mismatch");
  });

  it("rejects an executed fee that would change the exact recipient amount", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage, { feeExecuted: 99_999n }),
    });
    expect(result.status).toBe("mismatch");
  });

  it.each([
    { name: "different lengths", message: (source: string) => `${source}00` },
    { name: "malformed hexadecimal", message: () => "0xzz" },
    { name: "too-short attested messages", message: () => `0x${"0".repeat(750)}` },
  ])("rejects $name", async ({ message }) => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: message(sourceMessage),
    });
    expect(result.status).toBe("mismatch");
  });

  it("rejects equal-length source and attested messages below the CCTP V2 minimum", async () => {
    const sourceMessage = `0x${"0".repeat(750)}`;
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: sourceMessage,
    });
    expect(result.status).toBe("mismatch");
  });

  it("rejects the wrong source wallet", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage),
      sourceAddress: `0x${"c".repeat(40)}`,
    });
    expect(result.status).toBe("mismatch");
  });

  it("rejects the wrong burn amount", async () => {
    const sourceMessage = buildCctpMessage(5_100_000n, 100_000n);
    const result = await verifySourceMessages({
      sourceMessage,
      attestedMessage: attestCctpMessage(sourceMessage),
      burnAmount: "5.2",
    });
    expect(result.status).toBe("mismatch");
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
      expectedRecipientAmount: "5",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
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
      expectedRecipientAmount: "5",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
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
      expectedRecipientAmount: "5",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
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
      expectedRecipientAmount: "5",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
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
    const message = attestCctpMessage(sourceMessage, { finalityThresholdExecuted });
    const result = await verifyBaseCctpSource({
      rpc: sourceRpc(sourceMessage),
      sourceTransactionHash: SOURCE_HASH,
      sourceAddress: SOURCE_WALLET,
      burnAmount: "5.1",
      maxFee: "0.1",
      expectedRecipientAmount: "5",
      expectedMintRecipient: STELLAR_FORWARDER,
      expectedRecipientAddress: STELLAR_FINAL_RECIPIENT,
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
