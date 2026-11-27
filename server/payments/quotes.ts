import type { FeeQuoteProvider } from "./service.ts";
import {
  BASE_SEPOLIA_USDC,
  baseEvmConfigFromEnvironment,
  createBaseRpc,
  encodeErc20Transfer,
  estimateBaseTransactionFee,
} from "../../src/base/evm.ts";

/** Direct Stellar USDC is fully transferred; the configured sponsor pays XLM network costs. */
export const quoteSupportedPaymentFees: FeeQuoteProvider = async (input) => {
  if (input.route.id === "stellar_to_stellar") {
    if (!process.env.STELLAR_FEE_SPONSOR_SECRET?.trim()) return null;
    // No USDC fee is charged to the sender or deducted from the recipient amount.
    // The sponsor's actual XLM cost is determined by the signed transaction simulation.
    return [];
  }
  if (input.route.id === "base_to_base") {
    const rpc = createBaseRpc(baseEvmConfigFromEnvironment());
    const quote = await estimateBaseTransactionFee({
      rpc,
      from: input.sourceWallet.address,
      to: BASE_SEPOLIA_USDC,
      data: encodeErc20Transfer(input.destinationAddress, input.amount),
    });
    return [{
      kind: "network",
      payer: "sender",
      asset: "ETH",
      amount: quote.feeEth,
      label: "Estimated Base Sepolia gas",
    }];
  }
  return null;
};
