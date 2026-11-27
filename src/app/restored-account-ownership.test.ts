import { describe, expect, it, vi } from "vitest";

import {
  parseOwnedStellarIdentity,
  verifyRestoredAccountOwnership,
} from "./restored-account-ownership.ts";

const account = {
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  credentialId: "credential",
};

describe("restored account ownership", () => {
  it("accepts only a complete owner-scoped identity response", () => {
    expect(parseOwnedStellarIdentity({ found: true, username: "alice" })).toBe(true);
    expect(parseOwnedStellarIdentity({ found: true })).toBe(false);
    expect(parseOwnedStellarIdentity({ found: false, username: "alice" })).toBe(false);
    expect(parseOwnedStellarIdentity({ found: true, username: "   " })).toBe(false);
  });

  it("requests the exact restored C-address without caching", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ found: true, username: "alice" }));
    await expect(verifyRestoredAccountOwnership(account, request)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      `/api/usernames/lookup?account=${encodeURIComponent(account.contractId)}`,
      { cache: "no-store" },
    );
  });

  it("fails closed on rejection, non-OK status, or malformed evidence", async () => {
    await expect(verifyRestoredAccountOwnership(
      account,
      vi.fn().mockRejectedValue(new Error("offline")),
    )).resolves.toBe(false);
    await expect(verifyRestoredAccountOwnership(
      account,
      vi.fn().mockResolvedValue(Response.json({ found: true, username: "alice" }, { status: 503 })),
    )).resolves.toBe(false);
    await expect(verifyRestoredAccountOwnership(
      account,
      vi.fn().mockResolvedValue(Response.json({ found: true })),
    )).resolves.toBe(false);
  });
});
