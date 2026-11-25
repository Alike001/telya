import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  reconcileStellarCctpSource: vi.fn(),
  getCircleCctpStatus: vi.fn(),
  status: "authorized",
  leaseExpiresAt: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));
vi.mock("./stellar-cctp", () => ({
  reconcileStellarCctpSource: mocks.reconcileStellarCctpSource,
  settleBaseToStellarCctp: vi.fn(),
}));
vi.mock("../base/circle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base/circle")>()),
  getCircleCctpStatus: mocks.getCircleCctpStatus,
}));

import { prepareStellarToBaseCctpDestination } from "./base-cctp";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const STELLAR_SOURCE_HASH = "a".repeat(64);
const BASE_RECIPIENT = `0x${"b".repeat(40)}`;
const config = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  usdcContract: StrKey.encodeContract(Buffer.alloc(32, 1)),
  tokenMessenger: StrKey.encodeContract(Buffer.alloc(32, 2)),
  messageTransmitter: StrKey.encodeContract(Buffer.alloc(32, 3)),
  forwarder: StrKey.encodeContract(Buffer.alloc(32, 4)),
  baseDomain: 6,
  stellarDomain: 27,
};

function u32(value: number): string { return value.toString(16).padStart(8, "0"); }
function word(value: bigint): string { return value.toString(16).padStart(64, "0"); }

function cctpMessage(): string {
  const header = [
    u32(1), u32(27), u32(6), "0".repeat(64), "1".repeat(64), "2".repeat(64),
    "0".repeat(64), u32(2_000), u32(2_000),
  ].join("");
  const body = [
    u32(1), "3".repeat(64), BASE_RECIPIENT.slice(2).padStart(64, "0"),
    word(51_000_000n), "4".repeat(64), word(1_000_000n), word(0n), word(0n), word(0n),
  ].join("");
  return `0x${header}${body}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "authorized";
  mocks.leaseExpiresAt = 0;
  mocks.reconcileStellarCctpSource.mockResolvedValue({ status: "source_confirmed" });
  mocks.getCircleCctpStatus.mockResolvedValue({
    status: "complete",
    sourceTransactionHash: STELLAR_SOURCE_HASH,
    message: cctpMessage(),
    attestation: `0x${"c".repeat(130)}`,
    messageHash: "1".repeat(64),
    attestationHash: "2".repeat(64),
  });
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join(" ").replace(/\s+/g, " ").trim();
    if (query.startsWith("SELECT p.id, p.route_id")) {
      return [{
        id: PAYMENT_ID,
        route_id: "stellar_to_base",
        status: "source_confirmed",
        recipient_address: BASE_RECIPIENT,
        expected_amount: "5",
        source_address: StrKey.encodeContract(Buffer.alloc(32, 5)),
      }];
    }
    if (query.startsWith("SELECT burn_amount_atomic")) {
      return [{
        burn_amount: "51000000",
        max_fee: "1000000",
        status: mocks.status,
        source_transaction_hash: null,
        circle_message: null,
        circle_attestation: null,
        submission_lease_expires_at: mocks.leaseExpiresAt
          ? new Date(mocks.leaseExpiresAt)
          : null,
        destination_transaction_hash: null,
      }];
    }
    if (query.includes("UPDATE base_cctp_operations SET status = 'destination_prepared'")) {
      if (mocks.status === "destination_prepared" && mocks.leaseExpiresAt > Date.now()) return [];
      mocks.status = "destination_prepared";
      mocks.leaseExpiresAt = Date.now() + 60_000;
      return [{ payment_id: PAYMENT_ID }];
    }
    return [];
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<Record<string, unknown>>>;
    transaction(queries: Array<Promise<unknown>>): Promise<unknown[]>;
  };
  sql.transaction = (queries) => Promise.all(queries);
  mocks.getSqlClient.mockReturnValue(sql);
});

describe("Stellar-to-Base CCTP destination reservation", () => {
  it("does not prepare a second mint while a repeated callback's submission lease is active", async () => {
    const input = {
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
    };
    const first = await prepareStellarToBaseCctpDestination(input);
    const duplicate = await prepareStellarToBaseCctpDestination(input);

    expect(first.status).toBe("ready");
    expect(duplicate).toEqual({ status: "in_progress" });
    expect(first.transactionTo).toBe("0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275");
    expect(first.transactionData).toMatch(/^0x57ecfd28/);
  });
});
