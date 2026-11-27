import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAgentPassAuthorizationHandler } from "./agent-pass.ts";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  privyUserId: "did:privy:test",
  sessionId: "session",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

describe("Agent Pass authorization handoff API", () => {
  it("sets a protected cookie without returning the one-use token", async () => {
    const createSession = vi.fn().mockResolvedValue({
      token: "A".repeat(43),
      expiresAt: "2030-01-01T00:05:00.000Z",
    });
    const handler = createAgentPassAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      createSession,
    });
    const response = await handler(new Request("https://telya.test/api/stellar/agent-passes/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "revoke",
        smartAccount: `C${"A".repeat(55)}`,
        contextRuleId: 3,
      }),
    }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      status: "authorization_ready",
      relayerUrl: "/api/stellar/relayer/agent-pass",
      expiresAt: "2030-01-01T00:05:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("A".repeat(43));
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(createSession).toHaveBeenCalledWith(user, {
      kind: "revoke",
      smartAccount: `C${"A".repeat(55)}`,
      contextRuleId: 3,
    });
  });

  it("rejects an incomplete revoke request before creating a session", async () => {
    const createSession = vi.fn();
    const handler = createAgentPassAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      createSession,
    });
    const response = await handler(new Request("https://telya.test/api/stellar/agent-passes/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "revoke", smartAccount: `C${"A".repeat(55)}` }),
    }));
    expect(response.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });
});
