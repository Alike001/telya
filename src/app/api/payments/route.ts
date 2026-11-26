import "server-only";

import { createPaymentHandler } from "../../../../server/api/payments";

export const dynamic = "force-dynamic";

// Status reads use durable Payment + PaymentEvent records. Preview creation
// remains unavailable until trusted live balance and fee providers are wired.
const handle = createPaymentHandler();
export { handle as GET, handle as POST };
