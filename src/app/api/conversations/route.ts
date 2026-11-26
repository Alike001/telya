import "server-only";

import { createConversationsHandler } from "../../../../server/api/conversations";

export const dynamic = "force-dynamic";

const handle = createConversationsHandler();
export { handle as GET, handle as POST };
