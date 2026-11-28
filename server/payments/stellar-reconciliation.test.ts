import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  complete: vi.fn(),
  fail: vi.fn(),
}));

vi.mock("../db/client.ts", () => ({
  getSqlClient: () => () => Promise.resolve(mocks.rows),
}));

vi.mock("../../src/server/stellar-relayer-requests.ts", () => ({
  completeStellarUsdcTransferRequest: mocks.complete,
  failLinkedStellarPayment: mocks.fail,
}));

import { reconcileStellarDirectPayment } from "./stellar-reconciliation.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const transactionHash = "a".repeat(64);
const requestHash = "b".repeat(64);
const row = {
  status: "submitted",
  destination_transaction_hash: null,
  failure_code: null,
  request_hash: requestHash,
  submitted_transaction_hash: transactionHash,
  token_contract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  sender_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  recipient_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  amount_atomic: "12500000",
};
const unusedRpc = {} as never;

describe("Stellar direct payment reconciliation", () => {
  it("keeps a not-yet-final transaction pending without mutating payment state", async () => {
    mocks.rows = [row];
    const verifyTransfer = vi.fn().mockResolvedValue({ status: "pending" });

    await expect(reconcileStellarDirectPayment(userId, paymentId, {
      rpc: unusedRpc,
      verifyTransfer,
    })).resolves.toEqual({ status: "pending", transactionHash });
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("completes only after exact recipient and amount verification", async () => {
    mocks.rows = [row];
    const verifyTransfer = vi.fn().mockResolvedValue({
      status: "verified",
      ledger: 123,
      recipient: row.recipient_address,
      amountRaw: 12_500_000n,
    });

    await expect(reconcileStellarDirectPayment(userId, paymentId, {
      rpc: unusedRpc,
      verifyTransfer,
    })).resolves.toEqual({ status: "completed", transactionHash });
    expect(mocks.complete).toHaveBeenCalledWith(requestHash, {
      transactionHash,
      ledger: 123,
      recipient: row.recipient_address,
      amountRaw: 12_500_000n,
    });
  });

  it("persists a finalized recipient mismatch as failure", async () => {
    mocks.rows = [row];
    const verifyTransfer = vi.fn().mockResolvedValue({
      status: "mismatch",
      reason: "recipient_mismatch",
    });

    await expect(reconcileStellarDirectPayment(userId, paymentId, {
      rpc: unusedRpc,
      verifyTransfer,
    })).resolves.toEqual({
      status: "failed",
      transactionHash,
      reason: "STELLAR_RECIPIENT_MISMATCH",
    });
    expect(mocks.fail).toHaveBeenCalledWith(
      requestHash,
      transactionHash,
      "STELLAR_RECIPIENT_MISMATCH",
    );
  });

  it("returns an already completed payment without consulting the chain again", async () => {
    mocks.rows = [{
      ...row,
      status: "completed",
      destination_transaction_hash: transactionHash,
    }];
    const verifyTransfer = vi.fn();

    await expect(reconcileStellarDirectPayment(userId, paymentId, {
      rpc: unusedRpc,
      verifyTransfer,
    })).resolves.toEqual({ status: "completed", transactionHash });
    expect(verifyTransfer).not.toHaveBeenCalled();
  });
});
