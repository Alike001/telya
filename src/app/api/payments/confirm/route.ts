import "server-only";

import { createPaymentConfirmationHandler } from "../../../../../server/api/payments";

export const dynamic = "force-dynamic";

// This records confirmation only. Wallet authorization and execution are
// separate steps; the response never claims a transaction was submitted.
export const POST = createPaymentConfirmationHandler();
