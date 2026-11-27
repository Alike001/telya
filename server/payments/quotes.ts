import type { FeeQuoteProvider } from "./service.ts";
import {
  BASE_SEPOLIA_USDC,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  CCTP_STELLAR_DOMAIN,
  baseEvmConfigFromEnvironment,
  createBaseRpc,
  encodeCctpDepositForBurn,
  encodeErc20Approve,
  encodeErc20Transfer,
  estimateBaseTransactionFee,
  formatBaseWeiAsEth,
  normalizeBaseUsdcAmount,
  readBaseUsdcAllowance,
} from "../../src/base/evm.ts";
import { getCircleCctpStandardFeeQuote } from "../../src/base/circle.ts";
import {
  stellarCctpConfigFromEnvironment,
  stellarContractToBytes32,
} from "../../src/stellar/cctp.ts";

function atomicUsdcToDecimal(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error("Atomic USDC amount is invalid");
  const padded = value.padStart(7, "0");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-6).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

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
  if (input.route.id === "base_to_stellar_cctp") {
    if (!process.env.STELLAR_FEE_SPONSOR_SECRET?.trim()) return null;
    const circle = await getCircleCctpStandardFeeQuote({
      sourceDomain: input.route.sourceNetwork === "base" ? 6 : 27,
      destinationDomain: input.route.destinationNetwork === "stellar" ? 27 : 6,
    });
    // A nonzero rate needs gross/net fee arithmetic tied to Circle's on-chain
    // rounding. Keep the route unavailable until that exact behavior is proven.
    if (circle.minimumFeeBps !== "0") return null;
    const stellar = stellarCctpConfigFromEnvironment();
    const rpc = createBaseRpc(baseEvmConfigFromEnvironment());
    const burnAmount = normalizeBaseUsdcAmount(input.amount);
    const allowance = await readBaseUsdcAllowance({ rpc, owner: input.sourceWallet.address });
    let feeWei = 0n;
    let approvalRequired = false;
    if (allowance < burnAmount) {
      approvalRequired = true;
      const approval = await estimateBaseTransactionFee({
        rpc,
        from: input.sourceWallet.address,
        to: BASE_SEPOLIA_USDC,
        data: encodeErc20Approve(BASE_SEPOLIA_TOKEN_MESSENGER, input.amount),
      });
      feeWei += approval.feeWei;
    }
    const burn = await estimateBaseTransactionFee({
      rpc,
      from: input.sourceWallet.address,
      to: BASE_SEPOLIA_TOKEN_MESSENGER,
      data: encodeCctpDepositForBurn({
        amount: input.amount,
        maxFee: "0",
        destinationDomain: CCTP_STELLAR_DOMAIN,
        mintRecipient: stellarContractToBytes32(stellar.forwarder),
      }),
    });
    feeWei += burn.feeWei;
    return [
      {
        kind: "provider",
        payer: "sender",
        asset: "USDC",
        amount: "0",
        label: "Circle CCTP Standard fee",
      },
      {
        kind: "network",
        payer: "sender",
        asset: "ETH",
        amount: formatBaseWeiAsEth(feeWei),
        label: approvalRequired
          ? "Estimated Base approval and CCTP burn gas"
          : "Estimated Base CCTP burn gas",
      },
    ];
  }
  if (input.route.id === "stellar_to_base_cctp") {
    if (!process.env.STELLAR_FEE_SPONSOR_SECRET?.trim()) return null;
    const circle = await getCircleCctpStandardFeeQuote({
      sourceDomain: 27,
      destinationDomain: 6,
      forward: true,
    });
    // Standard must remain fee-free; the separate forwarding quote covers
    // destination Base gas and Circle's forwarding service charge.
    if (circle.minimumFeeBps !== "0" || circle.forwardFeeAtomic === undefined) {
      return null;
    }
    return [{
      kind: "provider",
      payer: "sender",
      asset: "USDC",
      amount: atomicUsdcToDecimal(circle.forwardFeeAtomic),
      label: "Circle destination forwarding fee",
    }];
  }
  return null;
};
