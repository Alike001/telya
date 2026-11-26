import { describe, expect, it } from "vitest";

import { resolvePaymentRoute } from "./routing.ts";

const sourceWallet = { id: "wallet-1", network: "stellar" as const, address: "source-address" };
const recipient = {
  reference: { kind: "username" as const, username: "alice" },
  resolvedUserId: "recipient-user",
  username: "alice",
  displayName: "Alice",
  destinations: [{ network: "stellar" as const, address: "destination-address", isVerified: true }],
  preferredReceiveNetwork: "stellar" as const,
};

describe("routing from a verified balance", () => {
  it("treats an actual zero balance as insufficient funds, not an RPC outage", () => {
    const result = resolvePaymentRoute({
      recipient,
      amount: "1",
      sourceWallets: [sourceWallet],
      balances: { [sourceWallet.id]: "0" },
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "insufficient_balance" });
  });

  it("keeps missing balance distinct from insufficient funds", () => {
    const result = resolvePaymentRoute({
      recipient,
      amount: "1",
      sourceWallets: [sourceWallet],
      balances: { [sourceWallet.id]: null },
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "balance_unavailable" });
  });

  it("does not accept zero as a payment amount", () => {
    const result = resolvePaymentRoute({
      recipient,
      amount: "0",
      sourceWallets: [sourceWallet],
      balances: { [sourceWallet.id]: "5" },
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "invalid_amount" });
  });
});
