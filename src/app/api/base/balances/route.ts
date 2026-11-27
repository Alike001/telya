import "server-only";

import { createBaseBalancesHandler } from "../../../../../server/api/base-balances";

export const dynamic = "force-dynamic";
export const GET = createBaseBalancesHandler();
