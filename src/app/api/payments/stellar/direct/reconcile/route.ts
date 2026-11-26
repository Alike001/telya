import "server-only";

import { createStellarPaymentReconciliationHandler } from "../../../../../../../server/api/stellar-payments";

export const dynamic = "force-dynamic";
export const POST = createStellarPaymentReconciliationHandler();
