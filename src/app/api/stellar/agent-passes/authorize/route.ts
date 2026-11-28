import "server-only";

import { createAgentPassAuthorizationHandler } from "../../../../../../server/api/agent-pass";

export const dynamic = "force-dynamic";
export const POST = createAgentPassAuthorizationHandler();
