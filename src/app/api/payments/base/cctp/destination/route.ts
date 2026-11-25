import "server-only";

import { createBaseCctpDestinationHandler } from "../../../../../../../server/api/base-payments.js";

export const dynamic = "force-dynamic";
export const POST = createBaseCctpDestinationHandler();
