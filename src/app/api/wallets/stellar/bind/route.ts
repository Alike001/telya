import "server-only";

import { authenticateRequest } from "../../../../../../server/auth/privy";
import { bindVerifiedStellarWallet, WalletBindingError } from "../../../../../../server/wallets/binding";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let user;
  try { user = await authenticateRequest(request); }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode === 503 ? 503 : 401;
    return Response.json({ error: status === 503 ? "authentication_unavailable" : "unauthorized" }, { status });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return Response.json({ error: "invalid_request" }, { status: 400 });
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  if (typeof body?.proofToken !== "string" || !body.assertion || typeof body.assertion !== "object") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const result = await bindVerifiedStellarWallet(user, body.proofToken, body.assertion as Parameters<typeof bindVerifiedStellarWallet>[2]);
    return Response.json({ verified: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof WalletBindingError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "wallet_verification_unavailable" }, { status: 503 });
  }
}
