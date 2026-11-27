import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getSqlClient: vi.fn() }));

import { createBaseBalancesHandler } from "./base-balances.js";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  privyUserId: "did:privy:test",
  sessionId: "session-test",
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
};
const BASE_ADDRESS = `0x${"a".repeat(40)}`;

function request(method = "GET") {
  return new Request("https://telya.test/api/base/balances", { method });
}

describe("authenticated Base balance API", () => {
  it("reads only owner-scoped verified Base wallets and preserves genuine zero", async () => {
    const getWallets = vi.fn().mockResolvedValue([
      { id: "base-wallet", network: "base", address: BASE_ADDRESS },
      { id: "stellar-wallet", network: "stellar", address: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM" },
    ]);
    const readBalance = vi.fn().mockResolvedValue("0");
    const response = await createBaseBalancesHandler({
      authenticate: vi.fn().mockResolvedValue(USER),
      getWallets,
      readBalance,
    })(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ balances: [{
      walletId: "base-wallet",
      network: "base",
      address: BASE_ADDRESS,
      asset: "USDC",
      amount: "0",
      status: "verified",
    }] });
    expect(getWallets).toHaveBeenCalledWith(USER);
    expect(readBalance).toHaveBeenCalledOnce();
    expect(readBalance).toHaveBeenCalledWith(BASE_ADDRESS);
  });

  it("fails the whole snapshot when the verified chain read is unavailable", async () => {
    const readBalance = vi.fn()
      .mockResolvedValueOnce("5")
      .mockRejectedValueOnce(new Error("RPC unavailable"));
    const response = await createBaseBalancesHandler({
      authenticate: vi.fn().mockResolvedValue(USER),
      getWallets: vi.fn().mockResolvedValue([
        { id: "base-one", network: "base", address: BASE_ADDRESS },
        { id: "base-two", network: "base", address: `0x${"b".repeat(40)}` },
      ]),
      readBalance,
    })(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "base_balance_unavailable" });
  });

  it("does not initialize a provider when the owner has no verified Base wallet", async () => {
    const readBalance = vi.fn();
    const response = await createBaseBalancesHandler({
      authenticate: vi.fn().mockResolvedValue(USER),
      getWallets: vi.fn().mockResolvedValue([]),
      readBalance,
    })(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ balances: [] });
    expect(readBalance).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods before reading wallets", async () => {
    const getWallets = vi.fn();
    const response = await createBaseBalancesHandler({
      authenticate: vi.fn().mockResolvedValue(USER),
      getWallets,
      readBalance: vi.fn(),
    })(request("POST"));

    expect(response.status).toBe(405);
    expect(getWallets).not.toHaveBeenCalled();
  });
});
