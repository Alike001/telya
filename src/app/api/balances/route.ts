import "server-only";

import { createBalancesHandler } from "../../../../server/api/balances";

export const dynamic = "force-dynamic";
export const GET = createBalancesHandler();
