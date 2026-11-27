import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ read: vi.fn(), consume: vi.fn(), relay: vi.fn() }));

vi.mock("../../../../../../server/agent-pass/execution-session", () => ({
  readAgentPassSessionCookie: mocks.read,
  consumeAgentPassExecutionSession: mocks.consume,
  clearAgentPassSessionCookie: () => "cleared=1; Max-Age=0",
}));
vi.mock("../handler", () => ({ handleStellarRelayerRequest: mocks.relay }));

import { POST } from "./route.ts";

describe("Agent Pass-scoped Stellar relayer route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects requests without the protected handoff cookie", async () => {
    mocks.read.mockReturnValue(null);
    const response = await POST(new Request("https://telya.test/api/stellar/relayer/agent-pass", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("consumes the handoff before relaying its exact operation context", async () => {
    const context = { userId: "user", kind: "create", smartAccount: `C${"A".repeat(55)}` };
    mocks.read.mockReturnValue("A".repeat(43));
    mocks.consume.mockResolvedValue(context);
    mocks.relay.mockResolvedValue(Response.json({ success: true }));
    const request = new Request("https://telya.test/api/stellar/relayer/agent-pass", {
      method: "POST",
      body: JSON.stringify({ func: "signed", auth: ["passkey"] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.relay).toHaveBeenCalledWith(request, { agentPass: context });
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(mocks.relay.mock.invocationCallOrder[0]!);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
