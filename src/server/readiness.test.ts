import { describe, expect, it, vi } from "vitest";

import { createReadinessReport } from "./readiness";

const checkedAt = new Date("2026-11-25T00:00:00.000Z");

describe("createReadinessReport", () => {
  it("reports ready only when the database probe succeeds", async () => {
    await expect(
      createReadinessReport(async () => true, () => checkedAt),
    ).resolves.toEqual({
      status: "ready",
      environment: "testnet",
      checkedAt: checkedAt.toISOString(),
      checks: { application: "ok", database: "ok" },
    });
  });

  it("reports degraded without exposing database errors", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("secret connection data"));

    const report = await createReadinessReport(probe, () => checkedAt);

    expect(report).toEqual({
      status: "degraded",
      environment: "testnet",
      checkedAt: checkedAt.toISOString(),
      checks: { application: "ok", database: "unavailable" },
    });
    expect(JSON.stringify(report)).not.toContain("secret connection data");
  });
});
