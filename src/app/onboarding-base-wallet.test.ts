import { describe, expect, it } from "vitest";

import { reconcileBaseWalletSession } from "./onboarding-base-wallet.ts";

describe("onboarding Base wallet session state", () => {
  const verified = {
    selectedAddress: "0x1111111111111111111111111111111111111111",
    verifiedAddress: "0x1111111111111111111111111111111111111111",
  } as const;

  it("clears a verified display claim as soon as the Privy session signs out", () => {
    expect(reconcileBaseWalletSession({
      authenticated: false,
      walletAddresses: [verified.selectedAddress],
      state: verified,
    })).toEqual({ selectedAddress: "", verifiedAddress: null });
  });

  it("clears verification when the selected wallet is no longer exposed", () => {
    expect(reconcileBaseWalletSession({
      authenticated: true,
      walletAddresses: ["0x2222222222222222222222222222222222222222"],
      state: verified,
    })).toEqual({ selectedAddress: "", verifiedAddress: null });
  });

  it("retains exact same-session verification and selects a sole new wallet without verifying it", () => {
    expect(reconcileBaseWalletSession({
      authenticated: true,
      walletAddresses: [verified.selectedAddress.toUpperCase()],
      state: verified,
    })).toEqual(verified);
    expect(reconcileBaseWalletSession({
      authenticated: true,
      walletAddresses: ["0x2222222222222222222222222222222222222222"],
      state: { selectedAddress: "", verifiedAddress: null },
    })).toEqual({
      selectedAddress: "0x2222222222222222222222222222222222222222",
      verifiedAddress: null,
    });
  });
});
