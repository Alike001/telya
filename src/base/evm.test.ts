import { describe, expect, it, vi } from "vitest";

import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  encodeCctpDepositForBurn,
  encodeCctpReceiveMessage,
  encodeErc20Transfer,
  findBaseCctpMessage,
  normalizeBaseUsdcAmount,
  readBaseUsdcBalance,
  parseCctpMessage,
  verifyBaseCctpMint,
  verifyBaseUsdcTransfer,
  type BaseTransactionReceipt,
  type BaseRpc,
} from "./evm";

const TX_HASH = `0x${"a".repeat(64)}`;
const RECIPIENT = `0x${"b".repeat(40)}`;
const SENDER = `0x${"1".repeat(40)}`;
const TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MESSAGE_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function finalizedRpc(receipt: BaseTransactionReceipt): BaseRpc {
  const request = vi.fn(async (method: string) => {
    if (method === "eth_getTransactionReceipt") return receipt;
    if (method === "eth_getTransactionByHash") {
      return { hash: TX_HASH, from: SENDER, to: BASE_SEPOLIA_USDC, input: "0xa9059cbb" };
    }
    if (method === "eth_getBlockByNumber") return { number: "0x200" };
    throw new Error(`Unexpected RPC method: ${method}`);
  });
  return { request: request as unknown as BaseRpc["request"] };
}

describe("Base Sepolia transaction encoding and verification", () => {
  it("reads an exact on-chain Base Sepolia USDC balance and rejects wrong-chain or malformed RPC data", async () => {
    const rpc = {
      request: vi.fn(async (method: string) => method === "eth_chainId" ? `0x0${BASE_SEPOLIA_CHAIN_ID.toString(16)}` : `0x${word(12_345_678n)}`),
    } as unknown as BaseRpc;
    await expect(readBaseUsdcBalance({ rpc, owner: SENDER })).resolves.toBe("12.345678");
    expect(rpc.request).toHaveBeenCalledWith("eth_call", [{
      to: BASE_SEPOLIA_USDC.toLowerCase(),
      data: `0x70a08231${SENDER.slice(2).padStart(64, "0")}`,
    }, "latest"]);

    const zeroRpc = {
      request: vi.fn(async (method: string) => method === "eth_chainId" ? `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` : `0x${word(0n)}`),
    } as unknown as BaseRpc;
    await expect(readBaseUsdcBalance({ rpc: zeroRpc, owner: SENDER })).resolves.toBe("0");
    const wrongChain = {
      request: vi.fn(async () => "0x1"),
    } as unknown as BaseRpc;
    await expect(readBaseUsdcBalance({ rpc: wrongChain, owner: SENDER })).rejects.toMatchObject({ code: "WRONG_NETWORK" });
    expect(wrongChain.request).toHaveBeenCalledTimes(1);
    const malformed = {
      request: vi.fn(async (method: string) => method === "eth_chainId" ? `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` : "0x1"),
    } as unknown as BaseRpc;
    await expect(readBaseUsdcBalance({ rpc: malformed, owner: SENDER })).rejects.toMatchObject({ code: "RPC_FAILED" });
  });

  it("converts decimal USDC to six decimal places without floating point", () => {
    expect(normalizeBaseUsdcAmount("2.000001")).toBe(2_000_001n);
    expect(normalizeBaseUsdcAmount("0.000001")).toBe(1n);
    expect(() => normalizeBaseUsdcAmount("0.0000001")).toThrow();
    expect(() => normalizeBaseUsdcAmount("1e3")).toThrow();
  });

  it("encodes ERC-20 and Circle V2 calls with exact integer amounts", () => {
    expect(encodeErc20Transfer(RECIPIENT, "1.25")).toBe(
      `0xa9059cbb${RECIPIENT.slice(2).padStart(64, "0")}${word(1_250_000n)}`,
    );
    expect(encodeCctpDepositForBurn({
      amount: "1",
      destinationDomain: 27,
      mintRecipient: `0x${"c".repeat(64)}`,
    })).toMatch(/^0x8e0250ee/);
    expect(encodeCctpReceiveMessage("0x0102", "0xaabb")).toBe(
      `0x57ecfd28${word(64n)}${word(128n)}${word(2n)}0102${"0".repeat(60)}${word(2n)}aabb${"0".repeat(60)}`,
    );
  });

  it("only verifies one finalized USDC transfer to the expected recipient and amount", async () => {
    const receipt: BaseTransactionReceipt = {
      transactionHash: TX_HASH,
      status: "0x1",
      blockNumber: "0x100",
      logs: [{
        address: BASE_SEPOLIA_USDC,
        topics: [TOPIC, `0x${SENDER.slice(2).padStart(64, "0")}`, `0x${RECIPIENT.slice(2).padStart(64, "0")}`],
        data: `0x${word(5_000_000n)}`,
      }],
    };
    await expect(verifyBaseUsdcTransfer({
      rpc: finalizedRpc(receipt),
      txHash: TX_HASH,
      expectedRecipient: RECIPIENT,
      expectedSender: SENDER,
      expectedAmount: "5",
    })).resolves.toMatchObject({ status: "verified", recipient: RECIPIENT, amount: "5" });
    await expect(verifyBaseUsdcTransfer({
      rpc: finalizedRpc(receipt),
      txHash: TX_HASH,
      expectedRecipient: RECIPIENT,
      expectedSender: SENDER,
      expectedAmount: "4.999999",
    })).resolves.toMatchObject({ status: "mismatch" });
  });

  it("verifies a Circle mint from the zero address with a real nonzero transaction submitter", async () => {
    const message = "0x01020304";
    const attestation = `0x${"c".repeat(130)}`;
    const input = encodeCctpReceiveMessage(message, attestation);
    const receipt: BaseTransactionReceipt = {
      transactionHash: TX_HASH,
      status: "0x1",
      blockNumber: "0x100",
      logs: [{
        address: BASE_SEPOLIA_USDC,
        topics: [TOPIC, `0x${"0".repeat(64)}`, `0x${RECIPIENT.slice(2).padStart(64, "0")}`],
        data: `0x${word(5_000_000n)}`,
      }],
    };
    const rpc: BaseRpc = {
      request: vi.fn(async (method: string) => {
        if (method === "eth_getTransactionReceipt") return receipt;
        if (method === "eth_getBlockByNumber") return { number: "0x200" };
        if (method === "eth_getTransactionByHash") {
          return {
            hash: TX_HASH,
            from: SENDER,
            to: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
            input,
          };
        }
        throw new Error(`Unexpected RPC method: ${method}`);
      }) as unknown as BaseRpc["request"],
    };

    await expect(verifyBaseCctpMint({
      rpc,
      txHash: TX_HASH,
      message,
      attestation,
      expectedRecipient: RECIPIENT,
      expectedAmount: "5",
    })).resolves.toMatchObject({ status: "verified", recipient: RECIPIENT, amount: "5" });
  });

  it("decodes the MessageSent bytes and CCTP V2 message domains", () => {
    const u32 = (value: number) => value.toString(16).padStart(8, "0");
    const header = [
      u32(1),
      u32(6),
      u32(27),
      `0x${"4".repeat(64)}`.slice(2),
      `0x${"1".repeat(64)}`.slice(2),
      `0x${"2".repeat(64)}`.slice(2),
      `0x${"0".repeat(64)}`.slice(2),
      u32(2_000),
      u32(2_000),
    ].join("");
    const body = [
      u32(1),
      BASE_SEPOLIA_USDC.slice(2).toLowerCase().padStart(64, "0"),
      RECIPIENT.slice(2).padStart(64, "0"),
      word(7_000_000n),
      `0x${"0".repeat(24)}${"3".repeat(40)}`.slice(2),
      word(100_000n),
      word(50_000n),
      word(123_456n),
      word(0n),
    ].join("");
    const message = `${header}${body}`;
    const messageData = `${word(32n)}${word(BigInt(message.length / 2))}${message}`;
    const extracted = findBaseCctpMessage({
      messageTransmitterAddress: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
      receipt: {
        transactionHash: TX_HASH,
        status: "0x1",
        blockNumber: "0x10",
        logs: [{
          address: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
          topics: [MESSAGE_TOPIC],
          data: `0x${messageData}`,
        }],
      },
    });
    expect(extracted).toBe(`0x${message}`);
    expect(parseCctpMessage(extracted!)).toMatchObject({
      sourceDomain: 6,
      destinationDomain: 27,
      nonce: `0x${"4".repeat(64)}`,
      amount: 7_000_000n,
      maxFee: 100_000n,
      feeExecuted: 50_000n,
      expirationBlock: 123_456n,
    });
  });
});
