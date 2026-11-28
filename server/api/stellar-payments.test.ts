import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
} from "../payments/service.ts";
import {
  createStellarPaymentAuthorizationHandler,
  createStellarCctpPaymentAuthorizationHandler,
  createStellarCctpApprovalAuthorizationHandler,
  createStellarCctpApprovalStatusHandler,
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
        source_address: "CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R",
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
      readAllowance: vi.fn().mockResolvedValue({ allowanceRaw: 50_526_830n, latestLedger: 5_964_700 }),
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

  it("blocks burn authorization on insufficient TokenMessenger allowance", async () => {
    const createSession = vi.fn();
    const handler = createStellarCctpPaymentAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      getPayment: vi.fn().mockResolvedValue({
        route_id: "stellar_to_base", source_network: "stellar",
        source_address: "CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R",
        expected_recipient_amount: "0.1", fees: [{
          kind: "provider", payer: "sender", asset: "USDC", amount: "0.0531450",
        }],
      }),
      reserveCctp: vi.fn(), createSession,
      readAllowance: vi.fn().mockResolvedValue({ allowanceRaw: 0n, latestLedger: 5_964_700 }),
    });
    const response = await handler(new Request("https://telya.test/api/payments/stellar/cctp/authorize", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "22222222-2222-4222-8222-222222222222" }),
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "stellar_cctp_approval_required" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("issues a separate exact, expiring approval handoff and recovers by live allowance", async () => {
    const paymentId = "22222222-2222-4222-8222-222222222222";
    const sourceAddress = "CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R";
    const payment = {
      id: paymentId, route_id: "stellar_to_base", status: "awaiting_confirmation",
      source_network: "stellar", source_address: sourceAddress,
      expected_recipient_amount: "0.1", fees: [{
        kind: "provider", payer: "sender", asset: "USDC", amount: "0.0531450",
      }],
    };
    const createSession = vi.fn().mockResolvedValue({ token: "C".repeat(43), expiresAt: "2030-01-01T00:05:00.000Z" });
    const readAllowance = vi.fn().mockResolvedValueOnce({ allowanceRaw: 0n, latestLedger: 5_964_700 })
      .mockResolvedValueOnce({ allowanceRaw: 1_531_450n, latestLedger: 5_964_705 });
    const handler = createStellarCctpApprovalAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user), getPayment: vi.fn().mockResolvedValue(payment),
      reserveCctp: vi.fn(), createSession, readAllowance,
      existingApproval: vi.fn().mockResolvedValue(null),
      getConfig: vi.fn().mockReturnValue({ tokenMessenger: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM" }),
    });
    const response = await handler(new Request("https://telya.test/api/payments/stellar/cctp/approval/authorize", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId }),
    }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      status: "approval_authorization_ready",
      approval: { paymentId, owner: sourceAddress, amount: "0.153145", expirationLedger: 5_965_420 },
    });
    expect(createSession).toHaveBeenCalledWith(user, paymentId, "cctp_approval");
    const status = createStellarCctpApprovalStatusHandler({
      authenticate: vi.fn().mockResolvedValue(user), getPayment: vi.fn().mockResolvedValue(payment), readAllowance,
    });
    const recovered = await status(new Request(`https://telya.test/api/payments/stellar/cctp/approval/authorize?id=${paymentId}`));
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ status: "ready", amount: "0.153145" });
  });

  it("refuses a second approval while an earlier attempt is unresolved", async () => {
    const createSession = vi.fn();
    const handler = createStellarCctpApprovalAuthorizationHandler({
      authenticate: vi.fn().mockResolvedValue(user),
      getPayment: vi.fn().mockResolvedValue({
        route_id: "stellar_to_base", status: "awaiting_confirmation",
        source_network: "stellar",
        source_address: "CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R",
        expected_recipient_amount: "0.1", fees: [],
      }),
      reserveCctp: vi.fn(), readAllowance: vi.fn().mockResolvedValue({ allowanceRaw: 0n, latestLedger: 5_964_700 }),
      existingApproval: vi.fn().mockResolvedValue("pending"), createSession,
    });
    const response = await handler(new Request("https://telya.test/api/payments/stellar/cctp/approval/authorize", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "22222222-2222-4222-8222-222222222222" }),
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "stellar_cctp_approval_pending" });
    expect(createSession).not.toHaveBeenCalled();
  });
});
