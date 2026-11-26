import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "./authenticated-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated API requests", () => {
  it("fails closed before a request when the user has no Privy token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(authenticatedFetch("/api/usernames/claim", { method: "POST" }, async () => null))
      .rejects.toThrow("Sign-in token is unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches the current token without dropping request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await authenticatedFetch(
      "/api/usernames/lookup",
      { cache: "no-store", headers: { "Content-Type": "application/json" } },
      async () => "verified-access-token",
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer verified-access-token");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init.cache).toBe("no-store");
  });
});
