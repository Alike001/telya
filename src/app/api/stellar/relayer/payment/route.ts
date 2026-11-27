import "server-only";

import {
  clearStellarPaymentSessionCookie,
  consumeStellarPaymentExecutionSession,
  readStellarPaymentSessionCookie,
} from "../../../../../../server/payments/stellar-execution-session";
import {
  clearAgentPassSessionCookie,
  consumeAgentPassExecutionSession,
  readAgentPassSessionCookie,
} from "../../../../../../server/agent-pass/execution-session";
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
  const paymentToken = readStellarPaymentSessionCookie(request);
  const agentPassToken = readAgentPassSessionCookie(request);
  if ((!paymentToken && !agentPassToken) || (paymentToken && agentPassToken)) {
    const response = unauthorized();
    if (paymentToken || agentPassToken) {
      response.headers.append("set-cookie", clearStellarPaymentSessionCookie());
      response.headers.append("set-cookie", clearAgentPassSessionCookie());
    }
    return response;
  }
  try {
    if (paymentToken) {
      const context = await consumeStellarPaymentExecutionSession(paymentToken);
      if (!context) {
        const response = unauthorized();
        response.headers.append("set-cookie", clearStellarPaymentSessionCookie());
        response.headers.append("set-cookie", clearAgentPassSessionCookie());
        return response;
      }
      const response = await handleStellarRelayerRequest(request, context);
      response.headers.append("set-cookie", clearStellarPaymentSessionCookie());
      response.headers.append("set-cookie", clearAgentPassSessionCookie());
      return response;
    }
    const context = await consumeAgentPassExecutionSession(agentPassToken!);
    if (!context) {
      const response = unauthorized();
      response.headers.append("set-cookie", clearStellarPaymentSessionCookie());
      response.headers.append("set-cookie", clearAgentPassSessionCookie());
      return response;
    }
    const response = await handleStellarRelayerRequest(request, { agentPass: context });
    response.headers.append("set-cookie", clearStellarPaymentSessionCookie());
    response.headers.append("set-cookie", clearAgentPassSessionCookie());
    return response;
  } catch {
    return Response.json(
      { success: false, error: "Financial authorization is temporarily unavailable", errorCode: "AUTHENTICATION_UNAVAILABLE" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
