import "server-only";

import { handleStellarRelayerRequest } from "./handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleStellarRelayerRequest(request);
}
