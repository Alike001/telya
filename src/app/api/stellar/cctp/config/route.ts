import "server-only";

import { stellarCctpConfigFromEnvironment } from "../../../../../stellar/cctp";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const config = stellarCctpConfigFromEnvironment();
    return Response.json(
      { config },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "stellar_cctp_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
