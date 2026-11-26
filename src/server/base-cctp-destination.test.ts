import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  reconcileStellarCctpSource: vi.fn(),
  getCircleCctpStatus: vi.fn(),
  status: "authorized",
  leaseExpiresAt: 0,
  paymentStatus: "source_confirmed",
  destinationHash: null as string | null,
  completionRows: true,
  completionQuery: "",
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

import {
  prepareStellarToBaseCctpDestination,
  reconcileStellarToBaseDestination,
} from "./base-cctp";
import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_USDC,
  encodeCctpReceiveMessage,
  type BaseRpc,
  type BaseTransactionReceipt,
} from "../base/evm";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const STELLAR_SOURCE_HASH = "a".repeat(64);
const BASE_RECIPIENT = `0x${"b".repeat(40)}`;
const DESTINATION_HASH = `0x${"d".repeat(64)}`;
const BASE_SUBMITTER = `0x${"9".repeat(40)}`;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
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

function mintRpc(): BaseRpc {
  const attestation = `0x${"c".repeat(130)}`;
  const receipt: BaseTransactionReceipt = {
    transactionHash: DESTINATION_HASH,
    status: "0x1",
    blockNumber: "0x100",
    logs: [{
      address: BASE_SEPOLIA_USDC,
      topics: [TRANSFER_TOPIC, `0x${"0".repeat(64)}`, `0x${BASE_RECIPIENT.slice(2).padStart(64, "0")}`],
      data: `0x${word(5_000_000n)}`,
    }],
  };
  return {
    request: vi.fn(async (method: string) => {
      if (method === "eth_getTransactionReceipt") return receipt;
      if (method === "eth_getBlockByNumber") return { number: "0x200" };
      if (method === "eth_getTransactionByHash") return {
        hash: DESTINATION_HASH,
        from: BASE_SUBMITTER,
        to: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
        input: encodeCctpReceiveMessage(cctpMessage(), attestation),
      };
      throw new Error(`Unexpected RPC method: ${method}`);
    }) as unknown as BaseRpc["request"],
  };
}

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
  mocks.paymentStatus = "source_confirmed";
  mocks.destinationHash = null;
  mocks.completionRows = true;
  mocks.completionQuery = "";
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
        status: mocks.paymentStatus,
        recipient_address: BASE_RECIPIENT.toUpperCase().replace("0X", "0x"),
        expected_amount: "5",
        destination_transaction_hash: mocks.destinationHash,
        source_address: StrKey.encodeContract(Buffer.alloc(32, 5)),
      }];
    }
    if (query.startsWith("SELECT status, source_transaction_hash")) {
      return [{
        status: "destination_submitted",
        source_transaction_hash: STELLAR_SOURCE_HASH,
        circle_message: cctpMessage(),
        circle_attestation: `0x${"c".repeat(130)}`,
        destination_transaction_hash: DESTINATION_HASH,
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
    if (query.startsWith("WITH eligible AS MATERIALIZED")) {
      mocks.completionQuery = query;
      return mocks.completionRows ? [{ id: PAYMENT_ID }] : [];
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

  it("writes completion events only in the guarded state transition and tolerates recipient casing", async () => {
    mocks.paymentStatus = "destination_submitted";
    mocks.destinationHash = DESTINATION_HASH;
    const result = await reconcileStellarToBaseDestination({
      paymentId: PAYMENT_ID,
      destinationTransactionHash: DESTINATION_HASH,
      rpc: mintRpc(),
    });

    expect(result).toEqual({ status: "completed", destinationTransactionHash: DESTINATION_HASH });
    expect(mocks.completionQuery).toContain("lower(p.recipient_address) = lower(");
    expect(mocks.completionQuery).toContain("JOIN operation ON operation.payment_id = payment.id");
    expect(mocks.completionQuery).toContain("FROM payment CROSS JOIN (VALUES");
  });

  it("does not report completion when the guarded database state transition returns no row", async () => {
    mocks.paymentStatus = "destination_submitted";
    mocks.destinationHash = DESTINATION_HASH;
    mocks.completionRows = false;

    await expect(reconcileStellarToBaseDestination({
      paymentId: PAYMENT_ID,
      destinationTransactionHash: DESTINATION_HASH,
      rpc: mintRpc(),
    })).rejects.toThrow("changed while destination verification was being recorded");
    expect(mocks.completionQuery).toContain("FROM payment CROSS JOIN (VALUES");
  });
});
