import { describe, expect, it, vi } from "vitest";
import { Networks, StrKey } from "@stellar/stellar-sdk";

import { readStellarUsdcBalance, type TokenBalanceReader } from "./balances.ts";

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
});
