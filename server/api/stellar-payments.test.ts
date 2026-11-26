import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PaymentNotFoundError } from "../payments/service.ts";
import { createStellarPaymentReconciliationHandler } from "./stellar-payments.ts";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  privyUserId: "did:privy:test",
  sessionId: "session",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

describe("Stellar payment reconciliation API", () => {
  it("authenticates and reports an unresolved submitted transaction as pending", async () => {
    const authenticate = vi.fn().mockResolvedValue(user);
    const reconcile = vi.fn().mockResolvedValue({
      status: "pending" as const,
      transactionHash: "a".repeat(64),
    });
    const handler = createStellarPaymentReconciliationHandler({ authenticate, reconcile });

    const response = await handler(new Request(
      "https://telya.test/api/payments/stellar/direct/reconcile?id=22222222-2222-4222-8222-222222222222",
      { method: "POST", headers: { authorization: "Bearer verified" } },
    ));

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "pending",
      transactionHash: "a".repeat(64),
    });
    expect(reconcile).toHaveBeenCalledWith(user.id, "22222222-2222-4222-8222-222222222222");
  });

  it("does not reveal another user's absent payment", async () => {
    const handler = createStellarPaymentReconciliationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      reconcile: vi.fn().mockRejectedValue(new PaymentNotFoundError()),
    });

    const response = await handler(new Request(
      "https://telya.test/api/payments/stellar/direct/reconcile?id=33333333-3333-4333-8333-333333333333",
      { method: "POST" },
    ));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "payment_not_found" });
  });
});
