import "server-only";

import { createStellarCctpPaymentAuthorizationHandler } from "../../../../../../../server/api/stellar-payments";

export const dynamic = "force-dynamic";
export const POST = createStellarCctpPaymentAuthorizationHandler();
