import "server-only";

import { createTranscriptionHandler } from "../../../../../server/ai/voice";

export const dynamic = "force-dynamic";
export const POST = createTranscriptionHandler();
