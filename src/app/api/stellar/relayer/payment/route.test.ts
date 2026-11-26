import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  consume: vi.fn(),
  relay: vi.fn(),
}));

vi.mock("../../../../../../server/payments/stellar-execution-session", () => ({
  readStellarPaymentSessionCookie: mocks.read,
  consumeStellarPaymentExecutionSession: mocks.consume,
  clearStellarPaymentSessionCookie: () => "cleared=1; Max-Age=0",
}));

vi.mock("../handler", () => ({
  handleStellarRelayerRequest: mocks.relay,
}));

import { POST } from "./route.ts";

describe("payment-scoped Stellar relayer route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request without the protected handoff cookie", async () => {
    mocks.read.mockReturnValue(null);
    const response = await POST(new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
    }));
    expect(response.status).toBe(401);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("consumes the handoff before relaying with its canonical owner and payment", async () => {
    const context = { userId: "user-id", paymentId: "payment-id" };
    mocks.read.mockReturnValue("A".repeat(43));
    mocks.consume.mockResolvedValue(context);
    mocks.relay.mockResolvedValue(Response.json({ success: true, hash: "a".repeat(64) }));
    const request = new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
      body: JSON.stringify({ func: "signed", auth: ["passkey"] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith("A".repeat(43));
    expect(mocks.relay).toHaveBeenCalledWith(request, context);
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.relay.mock.invocationCallOrder[0]!,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("fails closed without consuming the browser cookie when persistence is unavailable", async () => {
    mocks.read.mockReturnValue("A".repeat(43));
    mocks.consume.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});
