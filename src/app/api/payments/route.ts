import "server-only";

import { createPaymentHandler } from "../../../../server/api/payments";
import { readVerifiedWalletBalances } from "../../../../server/payments/balances";
import { quoteSupportedPaymentFees } from "../../../../server/payments/quotes";

export const dynamic = "force-dynamic";

// Only sponsored Stellar direct previews have both a live source balance and
// a known sender-paid fee policy. Other routes remain unavailable until quoted.
const handle = createPaymentHandler({
  getBalances: readVerifiedWalletBalances,
  quoteFees: quoteSupportedPaymentFees,
});
export { handle as GET, handle as POST };
