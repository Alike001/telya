import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticatedFetch } from "./authenticated-fetch.ts";

import {
  captureSessionAccessToken,
  createSessionRequestGuard,
} from "./session-request-guard.ts";

describe("authenticated session request guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("permanently rejects late writes after cancellation", () => {
    const guard = createSessionRequestGuard();
    expect(guard.isActive()).toBe(true);
    guard.cancel();
    expect(guard.isActive()).toBe(false);
    guard.cancel();
    expect(guard.isActive()).toBe(false);
  });

  it("keeps separate browser identity guards independent", () => {
    const previous = createSessionRequestGuard();
    const current = createSessionRequestGuard();
    previous.cancel();
    expect(previous.isActive()).toBe(false);
    expect(current.isActive()).toBe(true);
  });

  it("captures one token provider and rejects a token that crosses an auth epoch", async () => {
    const guard = createSessionRequestGuard();
    const getAccessToken = async () => "identity-a-token";
    const captured = await captureSessionAccessToken(getAccessToken, guard);
    await expect(captured()).resolves.toBe("identity-a-token");

    const changed = createSessionRequestGuard();
    const pending = captureSessionAccessToken(async () => {
      changed.cancel();
      return "identity-b-token";
    }, changed);
    await expect(pending).rejects.toThrow("Authenticated session changed");
  });

  it("keeps one authorization token across every request in an operation", async () => {
    const guard = createSessionRequestGuard();
    const getAccessToken = vi.fn()
      .mockResolvedValueOnce("identity-a-token")
      .mockResolvedValueOnce("identity-b-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = await captureSessionAccessToken(getAccessToken, guard);
    await authenticatedFetch("/api/payments/reconcile", { method: "POST" }, tokenProvider);
    await authenticatedFetch("/api/payments?id=payment-1", { method: "GET" }, tokenProvider);

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toBeInstanceOf(Headers);
      expect(((init as RequestInit).headers as Headers).get("Authorization"))
        .toBe("Bearer identity-a-token");
    }
  });
});
