import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("../../../../../../server/wallets/deployment-session", () => ({
  clearStellarDeploymentSessionCookie: () => "deployment=; Max-Age=0",
  consumeStellarDeploymentExecutionSession: mocks.consume,
  readStellarDeploymentSessionCookie: (request: Request) =>
    request.headers.get("cookie")?.match(/deployment=([^;]+)/)?.[1] ?? null,
}));

vi.mock("../handler", () => ({ handleStellarRelayerRequest: mocks.handle }));

import { POST } from "./route";

describe("protected Stellar deployment relayer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ userId: "user" });
    mocks.handle.mockResolvedValue(Response.json({ success: true }));
  });

  it("rejects a request without the one-use cookie before the relayer", async () => {
    const response = await POST(new Request("https://telya.test/api/stellar/relayer/deployment", {
      method: "POST",
    }));
    expect(response.status).toBe(401);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("consumes the handoff before invoking the relayer and clears the cookie", async () => {
    const request = new Request("https://telya.test/api/stellar/relayer/deployment", {
      method: "POST",
      headers: { cookie: "deployment=token" },
    });
    const response = await POST(request);
    expect(mocks.consume).toHaveBeenCalledWith("token");
    expect(mocks.handle).toHaveBeenCalledWith(request, { deployment: { userId: "user" } });
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(mocks.handle.mock.invocationCallOrder[0]!);
    expect(response.headers.get("set-cookie")).toBe("deployment=; Max-Age=0");
  });
});
