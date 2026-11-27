export interface BaseWalletSessionState {
  readonly selectedAddress: string;
  readonly verifiedAddress: string | null;
}

/**
 * Keep browser-only Base wallet display state bound to the current Privy
 * session and its currently exposed wallets. Server authorization remains
 * authoritative; this helper only prevents stale client verification claims.
 */
export function reconcileBaseWalletSession(input: {
  readonly authenticated: boolean;
  readonly walletAddresses: readonly string[];
  readonly state: BaseWalletSessionState;
}): BaseWalletSessionState {
  if (!input.authenticated) return { selectedAddress: "", verifiedAddress: null };

  const wallets = input.walletAddresses.map((address) => address.toLowerCase());
  let selectedAddress = input.state.selectedAddress;
  if (selectedAddress && !wallets.includes(selectedAddress.toLowerCase())) {
    return { selectedAddress: "", verifiedAddress: null };
  }
  if (!selectedAddress && input.walletAddresses.length === 1) {
    selectedAddress = input.walletAddresses[0]!;
  }

  const verifiedAddress = input.state.verifiedAddress &&
    selectedAddress &&
    input.state.verifiedAddress.toLowerCase() === selectedAddress.toLowerCase()
    ? input.state.verifiedAddress
    : null;
  return { selectedAddress, verifiedAddress };
}
