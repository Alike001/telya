import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticateRequest } from "./privy.ts";
import { createAuthenticatedHandler } from "../api/http.ts";

afterEach(() => vi.unstubAllEnvs());

describe("authenticated API availability", () => {
  const handle = createAuthenticatedHandler(authenticateRequest, async () => Response.json({ ok: true }));

  it("returns 401 when a bearer token is absent", async () => {
    const response = await handle(new Request("https://telya.test/api/contacts"));
    expect(response.status).toBe(401);
  });

  it("returns 503 when a token is supplied but Privy is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    vi.stubEnv("PRIVY_APP_SECRET", "");
    const response = await handle(new Request("https://telya.test/api/contacts", {
      headers: { authorization: "Bearer example-token" },
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "authentication_unavailable" });
  });
});
