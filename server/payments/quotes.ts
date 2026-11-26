import type { FeeQuoteProvider } from "./service.ts";

/** Direct Stellar USDC is fully transferred; the configured sponsor pays XLM network costs. */
export const quoteSupportedPaymentFees: FeeQuoteProvider = async ({ route }) => {
  if (route.id !== "stellar_to_stellar") return null;
  if (!process.env.STELLAR_FEE_SPONSOR_SECRET?.trim()) return null;
  // No USDC fee is charged to the sender or deducted from the recipient amount.
  // The sponsor's actual XLM cost is determined by the signed transaction simulation.
  return [];
};
