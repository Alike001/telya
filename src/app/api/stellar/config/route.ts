import { smartAccountPublicConfigFromEnvironment } from "../../../../stellar/public-config";

export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return Response.json(smartAccountPublicConfigFromEnvironment(), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "stellar_wallet_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
