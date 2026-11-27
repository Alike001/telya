import { describe, expect, it } from "vitest";

import { createSessionRequestGuard } from "./session-request-guard.ts";

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
});
