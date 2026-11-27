import { describe, expect, it } from "vitest";

import {
  captureSessionAccessToken,
  createSessionRequestGuard,
} from "./session-request-guard.ts";

describe("authenticated session request guard", () => {
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
});
