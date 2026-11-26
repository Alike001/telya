import "server-only";

import { createBaseDirectPaymentHandler } from "../../../../../../server/api/base-payments";

export const dynamic = "force-dynamic";
export const POST = createBaseDirectPaymentHandler();
