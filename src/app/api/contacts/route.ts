import "server-only";

import { createContactsHandler } from "../../../../server/api/contacts";

export const dynamic = "force-dynamic";

const handle = createContactsHandler();
export { handle as GET, handle as POST, handle as DELETE };
