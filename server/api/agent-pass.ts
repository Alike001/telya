import { authenticateRequest } from "../auth/privy.ts";
import {
  AgentPassAuthorizationError,
  agentPassSessionCookie,
  createAgentPassExecutionSession,
  STELLAR_AGENT_PASS_RELAYER_PATH,
} from "../agent-pass/execution-session.ts";
import { createAuthenticatedHandler, isRecord, jsonResponse, readJson } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

export function createAgentPassAuthorizationHandler(options: {
  readonly authenticate?: AuthenticateRequest;
  readonly createSession?: typeof createAgentPassExecutionSession;
} = {}) {
  return createAuthenticatedHandler(options.authenticate ?? authenticateRequest, async (request, user) => {
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.smartAccount !== "string" ||
        !(body.kind === "create" || body.kind === "revoke") ||
        (body.kind === "revoke" && typeof body.contextRuleId !== "number")) {
      return jsonResponse({ error: "invalid_agent_pass_authorization" }, 400);
    }
    const operation = body.kind === "revoke"
      ? { kind: "revoke" as const, smartAccount: body.smartAccount, contextRuleId: body.contextRuleId as number }
      : { kind: "create" as const, smartAccount: body.smartAccount };
    const session = await (options.createSession ?? createAgentPassExecutionSession)(user, operation);
    const response = jsonResponse({
      status: "authorization_ready",
      relayerUrl: STELLAR_AGENT_PASS_RELAYER_PATH,
      expiresAt: session.expiresAt,
    }, 201);
    response.headers.set("set-cookie", agentPassSessionCookie(session.token));
    return response;
  }, (error) => error instanceof AgentPassAuthorizationError
    ? jsonResponse({ error: "agent_pass_authorization_unavailable" }, 409)
    : null);
}
