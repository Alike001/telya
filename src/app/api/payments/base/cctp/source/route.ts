import "server-only";

import { createBaseCctpSourceHandler } from "../../../../../../../server/api/base-payments.js";

export const dynamic = "force-dynamic";
export const POST = createBaseCctpSourceHandler();
