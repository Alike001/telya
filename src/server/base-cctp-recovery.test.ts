import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  settleBaseToStellarCctp: vi.fn(),
  queries: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));
vi.mock("./stellar-cctp", () => ({
  settleBaseToStellarCctp: mocks.settleBaseToStellarCctp,
  reconcileStellarCctpSource: vi.fn(),
}));
vi.mock("../stellar/cctp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../stellar/cctp")>()),
  stellarCctpConfigFromEnvironment: () => ({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    usdcContract: StrKey.encodeContract(Buffer.alloc(32, 1)),
    tokenMessenger: StrKey.encodeContract(Buffer.alloc(32, 2)),
    messageTransmitter: StrKey.encodeContract(Buffer.alloc(32, 3)),
    forwarder: StrKey.encodeContract(Buffer.alloc(32, 4)),
    baseDomain: 6,
    stellarDomain: 27,
  }),
}));

import { reconcileBaseToStellarCctp } from "./base-cctp";

const paymentId = "11111111-1111-4111-8111-111111111111";
const sourceHash = `0x${"a".repeat(64)}`;
const destinationHash = "b".repeat(64);
const recipient = StrKey.encodeContract(Buffer.alloc(32, 5));
const message = `0x${"c".repeat(752)}`;
const attestation = `0x${"d".repeat(130)}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.getSqlClient.mockReturnValue(async (parts: TemplateStringsArray) => {
    const query = parts.join(" ").replace(/\s+/g, " ");
    mocks.queries.push(query);
    if (query.includes("SELECT p.id, p.route_id")) return [{
      id: paymentId, route_id: "base_to_stellar", status: "destination_submitted",
      recipient_address: recipient, expected_amount: "0.100000000000000000",
      source_address: `0x${"1".repeat(40)}`, source_transaction_hash: sourceHash,
      destination_transaction_hash: destinationHash,
      verified_recipient_address: null, verified_recipient_amount: null,
    }];
    if (query.includes("SELECT burn_amount_atomic")) return [{
      burn_amount: "100000", max_fee: "0", status: "awaiting_attestation", source_transaction_hash: sourceHash,
      circle_message: message, circle_attestation: attestation,
      expected_recipient_address: recipient, expected_amount_atomic: "1000000",
    }];
    if (query.includes("UPDATE base_cctp_operations SET status = 'completed'")) return [{ payment_id: paymentId }];
    throw new Error(`Unexpected recovery query: ${query.slice(0, 90)}`);
  });
});

describe("Base-to-Stellar destination recovery", () => {
  it("reuses saved Circle proof and destination envelope after a pending mint", async () => {
    mocks.settleBaseToStellarCctp.mockResolvedValue({ status: "completed", destinationTransactionHash: destinationHash });
    const rpc = { request: vi.fn() };
    const result = await reconcileBaseToStellarCctp({ paymentId, sourceTransactionHash: sourceHash, rpc });
    expect(result).toMatchObject({ status: "completed", destinationTransactionHash: destinationHash });
    expect(mocks.settleBaseToStellarCctp).toHaveBeenCalledWith(expect.objectContaining({
      paymentId, sourceTransactionHash: sourceHash.slice(2), message, attestation,
    }));
    expect(rpc.request).not.toHaveBeenCalled();
    expect(mocks.queries.some((query) => query.includes("UPDATE base_cctp_operations SET status = 'completed'"))).toBe(true);
  });

  it("refuses a different source hash before touching the saved destination", async () => {
    await expect(reconcileBaseToStellarCctp({
      paymentId, sourceTransactionHash: `0x${"e".repeat(64)}`, rpc: { request: vi.fn() },
    })).rejects.toThrow(/different Base source burn/i);
    expect(mocks.settleBaseToStellarCctp).not.toHaveBeenCalled();
  });

  it("preserves pending destination state without completing it or rebroadcasting a burn", async () => {
    mocks.settleBaseToStellarCctp.mockResolvedValue({ status: "in_progress" });
    const result = await reconcileBaseToStellarCctp({
      paymentId, sourceTransactionHash: sourceHash, rpc: { request: vi.fn() },
    });
    expect(result).toEqual({ status: "in_progress", sourceTransactionHash: sourceHash });
    expect(mocks.queries.some((query) => query.includes("UPDATE base_cctp_operations SET status = 'completed'"))).toBe(false);
  });
});
