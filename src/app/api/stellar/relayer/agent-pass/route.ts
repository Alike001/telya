import "server-only";

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
    { success: false, error: "Agent Pass authorization expired", errorCode: "AUTHENTICATION_REQUIRED" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const token = readAgentPassSessionCookie(request);
  if (!token) return unauthorized();
  let context;
  try {
    context = await consumeAgentPassExecutionSession(token);
  } catch {
    return Response.json(
      { success: false, error: "Agent Pass authorization is temporarily unavailable", errorCode: "AUTHENTICATION_UNAVAILABLE" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!context) {
    const response = unauthorized();
    response.headers.set("set-cookie", clearAgentPassSessionCookie());
    return response;
  }
  const response = await handleStellarRelayerRequest(request, { agentPass: context });
  response.headers.set("set-cookie", clearAgentPassSessionCookie());
  return response;
}
