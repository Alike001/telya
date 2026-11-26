import "server-only";

import { authenticateRequest } from "../../../../../../server/auth/privy";
import { createWalletBindingChallenge, WalletBindingError } from "../../../../../../server/wallets/binding";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let user;
  try { user = await authenticateRequest(request); }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode === 503 ? 503 : 401;
    return Response.json({ error: status === 503 ? "authentication_unavailable" : "unauthorized" }, { status });
  }
  try {
    const raw = await request.text();
    if (raw.length > 4096) return Response.json({ error: "invalid_request" }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (typeof body?.contractId !== "string" || typeof body.credentialId !== "string") {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    return Response.json(createWalletBindingChallenge(user, body.contractId, body.credentialId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof WalletBindingError ? error.status : 400;
    return Response.json({ error: error instanceof WalletBindingError ? error.code : "invalid_request" }, { status });
  }
}
