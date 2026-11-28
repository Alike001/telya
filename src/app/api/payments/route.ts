import "server-only";

import { createPaymentHandler } from "../../../../server/api/payments";
import { readVerifiedWalletBalances } from "../../../../server/payments/balances";
import { quoteSupportedPaymentFees } from "../../../../server/payments/quotes";

export const dynamic = "force-dynamic";

// Both supported networks use owner-scoped live USDC reads. Fee policy still
// keeps Base/CCTP reviews unavailable until every sender-paid cost is quoted.
const handle = createPaymentHandler({
  getBalances: readVerifiedWalletBalances,
  quoteFees: quoteSupportedPaymentFees,
});
export { handle as GET, handle as POST };
