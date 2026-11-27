import "server-only";

import { authenticateRequest } from "../../../../../../server/auth/privy";
import { bindVerifiedBaseWallet, WalletBindingError } from "../../../../../../server/wallets/binding";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let user;
  try { user = await authenticateRequest(request); }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode === 503 ? 503 : 401;
    return Response.json({ error: status === 503 ? "authentication_unavailable" : "unauthorized" }, { status });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2_048) return Response.json({ error: "invalid_request" }, { status: 400 });
    body = JSON.parse(raw) as unknown;
  } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  const address = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).address
    : null;
  if (typeof address !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const result = await bindVerifiedBaseWallet(user, address);
    return Response.json({ verified: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof WalletBindingError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "wallet_verification_unavailable" }, { status: 503 });
  }
}
