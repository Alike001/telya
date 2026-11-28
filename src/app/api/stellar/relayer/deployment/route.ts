import "server-only";

import {
  clearStellarDeploymentSessionCookie,
  consumeStellarDeploymentExecutionSession,
  readStellarDeploymentSessionCookie,
} from "../../../../../../server/wallets/deployment-session";
import { handleStellarRelayerRequest } from "../handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(): Response {
  return Response.json(
    { success: false, error: "Account deployment authorization expired", errorCode: "AUTHENTICATION_REQUIRED" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const token = readStellarDeploymentSessionCookie(request);
  if (!token) return unauthorized();
  let context;
  try {
    context = await consumeStellarDeploymentExecutionSession(token);
  } catch {
    return Response.json(
      { success: false, error: "Account deployment authorization is temporarily unavailable", errorCode: "AUTHENTICATION_UNAVAILABLE" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!context) {
    const response = unauthorized();
    response.headers.set("set-cookie", clearStellarDeploymentSessionCookie());
    return response;
  }
  const response = await handleStellarRelayerRequest(request, { deployment: context });
  response.headers.set("set-cookie", clearStellarDeploymentSessionCookie());
  return response;
}
