import "server-only";

import { createStellarPaymentAuthorizationHandler } from "../../../../../../../server/api/stellar-payments";

export const dynamic = "force-dynamic";
export const POST = createStellarPaymentAuthorizationHandler();
