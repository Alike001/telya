import { describe, expect, it, vi } from "vitest";
import { Networks, StrKey } from "@stellar/stellar-sdk";

import type { BaseRpc } from "../../src/base/evm.ts";
import { readStellarUsdcBalance, readVerifiedWalletBalances, type TokenBalanceReader } from "./balances.ts";

const tokenContract = StrKey.encodeContract(Buffer.alloc(32, 1));
const address = StrKey.encodeContract(Buffer.alloc(32, 2));

describe("Stellar USDC balance reader", () => {
  it("returns exact 7-decimal on-chain values, including a genuine zero", async () => {
    const queryContract = vi.fn()
      .mockResolvedValueOnce({ result: 12_345_678n, isReadCall: true })
      .mockResolvedValueOnce({ result: 0n, isReadCall: true });
    const reader = { queryContract } as TokenBalanceReader;

    expect(await readStellarUsdcBalance({ reader, tokenContract, address })).toBe("1.2345678");
    expect(await readStellarUsdcBalance({ reader, tokenContract, address })).toBe("0");
    expect(queryContract).toHaveBeenCalledWith(tokenContract, "balance", { id: address }, Networks.TESTNET);
  });

  it("rejects a simulation that is not a verified read or returns invalid data", async () => {
    for (const response of [
      { result: 1n, isReadCall: false },
      { result: -1n, isReadCall: true },
      { result: "1", isReadCall: true },
    ]) {
      const reader = { queryContract: vi.fn().mockResolvedValue(response) } as TokenBalanceReader;
      await expect(readStellarUsdcBalance({ reader, tokenContract, address })).rejects.toThrow();
    }
  });

  it("rejects an invalid address before calling RPC", async () => {
    const reader = { queryContract: vi.fn() } as TokenBalanceReader;
    await expect(readStellarUsdcBalance({ reader, tokenContract, address: "not-a-wallet" })).rejects.toThrow();
    expect(reader.queryContract).not.toHaveBeenCalled();
  });

  it("uses exact live reads for verified Stellar and Base wallets", async () => {
    const queryContract = vi.fn().mockResolvedValue({ result: 45_000_000n, isReadCall: true });
    const baseRpc = { request: vi.fn()
      .mockResolvedValueOnce("0x14a34")
      .mockResolvedValueOnce(`0x${5_000_000n.toString(16).padStart(64, "0")}`) } as BaseRpc;
    const wallets = [
      { id: "stellar-wallet", network: "stellar" as const, address },
      { id: "base-wallet", network: "base" as const, address: `0x${"1".repeat(40)}` },
    ];
    const loadReader = vi.fn(() => ({ reader: { queryContract }, tokenContract }));
    await expect(readVerifiedWalletBalances(
      { id: "user" },
      wallets,
      loadReader,
      () => baseRpc,
    )).resolves.toEqual({
      "stellar-wallet": "4.5",
      "base-wallet": "5",
    });
    expect(queryContract).toHaveBeenCalledOnce();
    expect(baseRpc.request).toHaveBeenCalledTimes(2);
  });

  it("keeps Base unknown without erasing a verified Stellar balance when Base RPC fails", async () => {
    const queryContract = vi.fn().mockResolvedValue({ result: 45_000_000n, isReadCall: true });
    const wallets = [
      { id: "stellar-wallet", network: "stellar" as const, address },
      { id: "base-wallet", network: "base" as const, address: `0x${"1".repeat(40)}` },
    ];
    await expect(readVerifiedWalletBalances(
      { id: "user" },
      wallets,
      () => ({ reader: { queryContract }, tokenContract }),
      () => { throw new Error("Base RPC unavailable"); },
    )).resolves.toEqual({
      "stellar-wallet": "4.5",
      "base-wallet": null,
    });
  });

  it("fails the whole balance snapshot if a Stellar read is unavailable", async () => {
    const reader = { queryContract: vi.fn().mockRejectedValue(new Error("RPC unavailable")) };
    await expect(readVerifiedWalletBalances(
      { id: "user" },
      [{ id: "stellar-wallet", network: "stellar", address }],
      () => ({ reader, tokenContract }),
    )).rejects.toThrow("RPC unavailable");
  });
});
