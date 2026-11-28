import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readPayment: vi.fn(),
  consumePayment: vi.fn(),
  readAgentPass: vi.fn(),
  consumeAgentPass: vi.fn(),
  relay: vi.fn(),
}));

vi.mock("../../../../../../server/payments/stellar-execution-session", () => ({
  readStellarPaymentSessionCookie: mocks.readPayment,
  consumeStellarPaymentExecutionSession: mocks.consumePayment,
  clearStellarPaymentSessionCookie: () => "payment=; Max-Age=0",
}));

vi.mock("../../../../../../server/agent-pass/execution-session", () => ({
  readAgentPassSessionCookie: mocks.readAgentPass,
  consumeAgentPassExecutionSession: mocks.consumeAgentPass,
  clearAgentPassSessionCookie: () => "agent=; Max-Age=0",
}));

vi.mock("../handler", () => ({
  handleStellarRelayerRequest: mocks.relay,
}));

import { POST } from "./route.ts";

describe("payment-scoped Stellar relayer route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request without the protected handoff cookie", async () => {
    mocks.readPayment.mockReturnValue(null);
    mocks.readAgentPass.mockReturnValue(null);
    const response = await POST(new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
    }));
    expect(response.status).toBe(401);
    expect(mocks.consumePayment).not.toHaveBeenCalled();
    expect(mocks.consumeAgentPass).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("consumes the handoff before relaying with its canonical owner and payment", async () => {
    const context = { userId: "user-id", paymentId: "payment-id" };
    mocks.readPayment.mockReturnValue("A".repeat(43));
    mocks.readAgentPass.mockReturnValue(null);
    mocks.consumePayment.mockResolvedValue(context);
    mocks.relay.mockResolvedValue(Response.json({ success: true, hash: "a".repeat(64) }));
    const request = new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
      body: JSON.stringify({ func: "signed", auth: ["passkey"] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.consumePayment).toHaveBeenCalledWith("A".repeat(43));
    expect(mocks.relay).toHaveBeenCalledWith(request, context);
    expect(mocks.consumePayment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.relay.mock.invocationCallOrder[0]!,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("fails closed without consuming the browser cookie when persistence is unavailable", async () => {
    mocks.readPayment.mockReturnValue("A".repeat(43));
    mocks.readAgentPass.mockReturnValue(null);
    mocks.consumePayment.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("uses the same protected endpoint for memory-only Agent Pass administration", async () => {
    const context = { userId: "user-id", kind: "create", smartAccount: `C${"A".repeat(55)}` };
    mocks.readPayment.mockReturnValue(null);
    mocks.readAgentPass.mockReturnValue("B".repeat(43));
    mocks.consumeAgentPass.mockResolvedValue(context);
    mocks.relay.mockResolvedValue(Response.json({ success: true }));
    const request = new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
      body: JSON.stringify({ func: "signed", auth: ["passkey"] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.consumeAgentPass).toHaveBeenCalledWith("B".repeat(43));
    expect(mocks.relay).toHaveBeenCalledWith(request, { agentPass: context });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects ambiguous simultaneous authorization cookies without consuming either", async () => {
    mocks.readPayment.mockReturnValue("A".repeat(43));
    mocks.readAgentPass.mockReturnValue("B".repeat(43));
    const response = await POST(new Request("https://telya.test/api/stellar/relayer/payment", {
      method: "POST",
    }));
    expect(response.status).toBe(401);
    expect(mocks.consumePayment).not.toHaveBeenCalled();
    expect(mocks.consumeAgentPass).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
