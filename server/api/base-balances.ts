import {
  baseEvmConfigFromEnvironment,
  createBaseRpc,
  readBaseUsdcBalance,
} from "../../src/base/evm.ts";
import { authenticateRequest } from "../auth/privy.ts";
import { getVerifiedSourceWallets } from "../payments/service.ts";
import { createAuthenticatedHandler, jsonResponse } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

type VerifiedWalletLoader = typeof getVerifiedSourceWallets;
type BaseBalanceReader = (address: string) => Promise<string>;

export interface BaseBalancesApiOptions {
  readonly authenticate?: AuthenticateRequest;
  readonly getWallets?: VerifiedWalletLoader;
  readonly readBalance?: BaseBalanceReader;
}

/** Return real Base Sepolia USDC balances for this authenticated user's verified wallets only. */
export function createBaseBalancesHandler(options: BaseBalancesApiOptions = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);
      const wallets = (await (options.getWallets ?? getVerifiedSourceWallets)(user))
        .filter((wallet) => wallet.network === "base");
      if (wallets.length === 0) return jsonResponse({ balances: [] });

      let readBalance = options.readBalance;
      if (!readBalance) {
        const rpc = createBaseRpc(baseEvmConfigFromEnvironment());
        readBalance = (address) => readBaseUsdcBalance({ rpc, owner: address });
      }

      try {
        const amounts = await Promise.all(wallets.map((wallet) => readBalance!(wallet.address)));
        return jsonResponse({
          balances: wallets.map((wallet, index) => ({
            walletId: wallet.id,
            network: "base",
            address: wallet.address,
            asset: "USDC",
            amount: amounts[index],
            status: "verified",
          })),
        });
      } catch {
        return jsonResponse({ error: "base_balance_unavailable" }, 503);
      }
    },
  );
}
