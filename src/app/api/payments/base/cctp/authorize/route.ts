import "server-only";

import { createBaseCctpAuthorizationHandler } from "../../../../../../../server/api/base-payments";

export const dynamic = "force-dynamic";
export const POST = createBaseCctpAuthorizationHandler();
