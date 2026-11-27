import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
} from "../payments/service.ts";
import {
  createStellarPaymentAuthorizationHandler,
  createStellarCctpPaymentAuthorizationHandler,
  createStellarPaymentReconciliationHandler,
} from "./stellar-payments.ts";

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

  it("returns retryable reconciliation unavailability instead of a generic 500", async () => {
    const handler = createStellarPaymentReconciliationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      reconcile: vi.fn().mockRejectedValue(new PaymentProviderUnavailableError()),
    });

    const response = await handler(new Request(
      "https://telya.test/api/payments/stellar/direct/reconcile?id=33333333-3333-4333-8333-333333333333",
      { method: "POST" },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "stellar_reconciliation_unavailable",
    });
  });
});

describe("Stellar payment authorization handoff API", () => {
  it("sets a protected one-time cookie without returning its token to JavaScript", async () => {
    const createSession = vi.fn().mockResolvedValue({
      token: "A".repeat(43),
      expiresAt: "2030-01-01T00:05:00.000Z",
    });
    const handler = createStellarPaymentAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      createSession,
    });

    const response = await handler(new Request(
      "https://telya.test/api/payments/stellar/direct/authorize",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: "22222222-2222-4222-8222-222222222222" }),
      },
    ));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      status: "authorization_ready",
      relayerUrl: "/api/stellar/relayer/payment",
      expiresAt: "2030-01-01T00:05:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("A".repeat(43));
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Secure-telya_stellar_payment=");
    expect(cookie).toContain("__Secure-telya_agent_pass=; ");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/stellar/relayer/payment");
    expect(createSession).toHaveBeenCalledWith(user, "22222222-2222-4222-8222-222222222222");
  });

  it("reserves the reviewed CCTP burn before issuing the one-use handoff", async () => {
    const reserveCctp = vi.fn().mockResolvedValue({
      burnAmountAtomic: "50526830",
      maxFeeAtomic: "526830",
    });
    const createSession = vi.fn().mockResolvedValue({
      token: "B".repeat(43),
      expiresAt: "2030-01-01T00:05:00.000Z",
    });
    const paymentId = "22222222-2222-4222-8222-222222222222";
    const handler = createStellarCctpPaymentAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      getPayment: vi.fn().mockResolvedValue({
        route_id: "stellar_to_base",
        source_network: "stellar",
        expected_recipient_amount: "5.000000000000000000",
        fees: [{
          kind: "provider",
          payer: "sender",
          asset: "USDC",
          amount: "0.052683",
        }],
      }),
      reserveCctp,
      createSession,
    });

    const response = await handler(new Request(
      "https://telya.test/api/payments/stellar/cctp/authorize",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId }),
      },
    ));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      status: "authorization_ready",
      relayerUrl: "/api/stellar/relayer/payment",
      expiresAt: "2030-01-01T00:05:00.000Z",
      burn: { burnAmount: "5.052683", maxFee: "0.052683" },
    });
    expect(reserveCctp).toHaveBeenCalledWith({
      paymentId,
      burnAmount: "5.052683",
      maxFee: "0.052683",
    });
    expect(reserveCctp.mock.invocationCallOrder[0]).toBeLessThan(
      createSession.mock.invocationCallOrder[0]!,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});
