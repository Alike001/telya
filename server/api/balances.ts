import { authenticateRequest } from "../auth/privy.ts";
import { getVerifiedSourceWallets } from "../payments/service.ts";
import {
  readStellarUsdcBalance,
  stellarBalanceReaderFromEnvironment,
} from "../payments/balances.ts";
import { createAuthenticatedHandler, jsonResponse } from "./http.ts";

/** Real Stellar balances only; Base remains explicitly unavailable until its wallet provider is integrated. */
export const createBalancesHandler = () => createAuthenticatedHandler(
  authenticateRequest,
  async (request, user) => {
    if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);
    const wallets = await getVerifiedSourceWallets(user);
    const stellarWallets = wallets.filter((wallet) => wallet.network === "stellar");
    let stellarBalances: string[] = [];
    if (stellarWallets.length) {
      try {
        const { reader, tokenContract } = stellarBalanceReaderFromEnvironment();
        stellarBalances = await Promise.all(stellarWallets.map((wallet) =>
          readStellarUsdcBalance({ reader, tokenContract, address: wallet.address })));
      } catch {
        return jsonResponse({ error: "stellar_balance_unavailable" }, 503);
      }
    }
    let stellarIndex = 0;
    const balances = [];
    for (const wallet of wallets) {
      const amount = wallet.network === "stellar" ? stellarBalances[stellarIndex++] : null;
      if (wallet.network === "stellar" && amount === undefined) {
        return jsonResponse({ error: "stellar_balance_unavailable" }, 503);
      }
      balances.push({
        walletId: wallet.id,
        network: wallet.network,
        address: wallet.address,
        asset: "USDC",
        amount,
        status: wallet.network === "stellar" ? "verified" : "unavailable",
      });
    }
    return jsonResponse({ balances });
  },
);
