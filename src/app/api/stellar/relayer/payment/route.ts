import "server-only";

import {
  clearStellarPaymentSessionCookie,
  consumeStellarPaymentExecutionSession,
  readStellarPaymentSessionCookie,
} from "../../../../../../server/payments/stellar-execution-session";
import { handleStellarRelayerRequest } from "../handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(): Response {
  return Response.json(
    { success: false, error: "Payment authorization expired", errorCode: "AUTHENTICATION_REQUIRED" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const token = readStellarPaymentSessionCookie(request);
  if (!token) return unauthorized();
  let context: Awaited<ReturnType<typeof consumeStellarPaymentExecutionSession>>;
  try {
    context = await consumeStellarPaymentExecutionSession(token);
  } catch {
    return Response.json(
      { success: false, error: "Payment authorization is temporarily unavailable", errorCode: "AUTHENTICATION_UNAVAILABLE" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!context) {
    const response = unauthorized();
    response.headers.set("set-cookie", clearStellarPaymentSessionCookie());
    return response;
  }
  const response = await handleStellarRelayerRequest(request, context);
  response.headers.set("set-cookie", clearStellarPaymentSessionCookie());
  return response;
}
