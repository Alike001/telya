import { describe, expect, it, vi } from "vitest";

import type { PersistedPayment } from "../../domain/payment-activity";
import { reconcileSubmittedActivityPayment } from "./payment-activity-refresh";

const payment = {
  id: "506ddb14-f5c9-4302-ac42-62a5fdd63abf",
  route: { id: "stellar_to_stellar" },
  status: "submitted",
  sourceTransaction: null,
} as Pick<PersistedPayment, "id" | "route" | "status" | "sourceTransaction">;

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

  it("advances only the recorded Base CCTP burn when Activity is refreshed", async () => {
    const sourceHash = `0x${"a".repeat(64)}`;
    const request = vi.fn().mockResolvedValue(Response.json({ status: "pending" }, { status: 202 }));
    await reconcileSubmittedActivityPayment({
      ...payment,
      route: { id: "base_to_stellar_cctp", sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard" },
      sourceTransaction: { network: "base", txHash: sourceHash, explorerUrl: `https://sepolia.basescan.org/tx/${sourceHash}` },
    }, request);
    expect(request).toHaveBeenCalledWith(
      `/api/payments/base/cctp/source?id=${payment.id}`,
      { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceTransactionHash: sourceHash }) },
    );
  });

  it("refuses CCTP recovery without a persisted source hash", async () => {
    const request = vi.fn();
    await expect(reconcileSubmittedActivityPayment({
      ...payment,
      route: { id: "base_to_stellar_cctp", sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard" },
    }, request)).rejects.toThrow(/recorded source transaction is unavailable/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("reports a CCTP provider outage without resubmitting the burn", async () => {
    const sourceHash = `0x${"a".repeat(64)}`;
    const request = vi.fn().mockResolvedValue(Response.json({ error: "temporarily_unavailable" }, { status: 503 }));
    await expect(reconcileSubmittedActivityPayment({
      ...payment,
      route: { id: "base_to_stellar_cctp", sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard" },
      sourceTransaction: { network: "base", txHash: sourceHash, explorerUrl: `https://sepolia.basescan.org/tx/${sourceHash}` },
    }, request)).rejects.toThrow(/temporarily unavailable.*not resubmitted/i);
    expect(request).toHaveBeenCalledOnce();
  });

  it("can reconcile the recorded Stellar-to-Base source without a new passkey action", async () => {
    const sourceHash = "b".repeat(64);
    const request = vi.fn().mockResolvedValue(Response.json({ status: "pending" }, { status: 202 }));
    await reconcileSubmittedActivityPayment({
      ...payment,
      status: "awaiting_attestation",
      route: { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" },
      sourceTransaction: { network: "stellar", txHash: sourceHash, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${sourceHash}` },
    }, request);
    expect(request).toHaveBeenCalledWith(
      `/api/payments/base/cctp/source?id=${payment.id}`,
      { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceTransactionHash: sourceHash }) },
    );
  });
});
