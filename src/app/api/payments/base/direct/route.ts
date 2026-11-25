import "server-only";

import { createBaseDirectPaymentHandler } from "../../../../../../server/api/base-payments.js";

export const dynamic = "force-dynamic";
export const POST = createBaseDirectPaymentHandler();
