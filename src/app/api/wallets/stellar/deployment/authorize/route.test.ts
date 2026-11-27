import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("../../../../../../../server/auth/privy", () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  AuthenticationUnavailableError: class AuthenticationUnavailableError extends Error {},
  authenticateRequest: mocks.authenticate,
}));

vi.mock("../../../../../../../server/wallets/deployment-session", () => ({
  STELLAR_DEPLOYMENT_RELAYER_PATH: "/api/stellar/relayer/deployment",
  StellarDeploymentAuthorizationError: class StellarDeploymentAuthorizationError extends Error {},
  createStellarDeploymentExecutionSession: mocks.createSession,
  stellarDeploymentSessionCookie: (token: string) => `deployment=${token}; HttpOnly`,
}));

import { POST } from "./route";

const TEST_TOKEN = "A".repeat(43);

describe("Stellar deployment authorization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: "user" });
    mocks.createSession.mockResolvedValue({
      token: TEST_TOKEN,
      expiresAt: "2026-11-27T04:00:00.000Z",
    });
  });

  it("returns only the protected relayer path and stores the token in an HttpOnly cookie", async () => {
    const response = await POST(new Request("https://telya.test/api/wallets/stellar/deployment/authorize", {
      method: "POST",
      headers: { authorization: "Bearer token" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      relayerUrl: "/api/stellar/relayer/deployment",
      expiresAt: "2026-11-27T04:00:00.000Z",
    });
    expect(body).not.toHaveProperty("token");
    expect(response.headers.get("set-cookie")).toBe(`deployment=${TEST_TOKEN}; HttpOnly`);
  });
});
