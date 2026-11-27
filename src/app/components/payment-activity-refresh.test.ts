import { describe, expect, it, vi } from "vitest";

import type { PersistedPayment } from "../../domain/payment-activity";
import { reconcileSubmittedActivityPayment } from "./payment-activity-refresh";

const payment = {
  id: "506ddb14-f5c9-4302-ac42-62a5fdd63abf",
  route: { id: "stellar_to_stellar" },
  status: "submitted",
} as Pick<PersistedPayment, "id" | "route" | "status">;

describe("activity refresh reconciliation", () => {
  it("reports a provider outage instead of silently displaying the stale submitted state", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(
      { error: "stellar_reconciliation_unavailable" },
      { status: 503 },
    ));
    await expect(reconcileSubmittedActivityPayment(payment, request)).rejects.toThrow(
      /temporarily unavailable.*not resubmitted/i,
    );
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      `/api/payments/stellar/direct/reconcile?id=${payment.id}`,
      { method: "POST", credentials: "same-origin" },
    );
  });

  it("accepts a pending reconciliation response without another submission", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ status: "pending" }, { status: 202 }));
    await expect(reconcileSubmittedActivityPayment(payment, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not reconcile a completed payment", async () => {
    const request = vi.fn();
    await reconcileSubmittedActivityPayment({ ...payment, status: "completed" }, request);
    expect(request).not.toHaveBeenCalled();
  });
});
