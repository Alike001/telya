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
  failureRows: true,
  failureQuery: "",
  transitionRows: true,
  transitionQuery: "",
  pendingQuery: "",
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
  recordStellarToBaseDestinationSubmitted,
  reconcileStellarToBaseDestination,
} from "./base-cctp";
import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_TOKEN_MESSENGER,
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
function contractWord(address: string): string { return Buffer.from(StrKey.decodeContract(address)).toString("hex"); }

function mintRpc(recipient = BASE_RECIPIENT, amount = 5_000_000n): BaseRpc {
  const attestation = `0x${"c".repeat(130)}`;
  const receipt: BaseTransactionReceipt = {
    transactionHash: DESTINATION_HASH,
    status: "0x1",
    blockNumber: "0x100",
    logs: [{
      address: BASE_SEPOLIA_USDC,
      topics: [TRANSFER_TOPIC, `0x${"0".repeat(64)}`, `0x${recipient.slice(2).padStart(64, "0")}`],
      data: `0x${word(amount)}`,
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

function cctpMessage(options: {
  readonly minFinalityThreshold?: number;
  readonly finalityThresholdExecuted?: number;
  readonly nonce?: string;
  readonly sender?: string;
  readonly recipient?: string;
  readonly burnToken?: string;
  readonly messageSender?: string;
  readonly feeExecuted?: bigint;
} = {}): string {
  const header = [
    u32(1), u32(27), u32(6), options.nonce ?? "f".repeat(64),
    options.sender ?? contractWord(config.tokenMessenger),
    options.recipient ?? BASE_SEPOLIA_TOKEN_MESSENGER.slice(2).padStart(64, "0").toLowerCase(),
    "0".repeat(64), u32(options.minFinalityThreshold ?? 2_000),
    u32(options.finalityThresholdExecuted ?? 2_000),
  ].join("");
  const body = [
    u32(1), options.burnToken ?? contractWord(config.usdcContract), BASE_RECIPIENT.slice(2).padStart(64, "0"),
    word(51_000_000n), options.messageSender ?? contractWord(StrKey.encodeContract(Buffer.alloc(32, 5))),
    word(1_000_000n), word(options.feeExecuted ?? 1_000_000n), word(0n),
    "636374702d666f72776172640000000000000000000000000000000000000000",
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
  mocks.failureRows = true;
  mocks.failureQuery = "";
  mocks.transitionRows = true;
  mocks.transitionQuery = "";
  mocks.pendingQuery = "";
  mocks.reconcileStellarCctpSource.mockResolvedValue({ status: "source_confirmed" });
  mocks.getCircleCctpStatus.mockResolvedValue({
    status: "complete",
    sourceTransactionHash: STELLAR_SOURCE_HASH,
    message: cctpMessage(),
    attestation: `0x${"c".repeat(130)}`,
    messageHash: "1".repeat(64),
    attestationHash: "2".repeat(64),
    forwardTransactionHash: DESTINATION_HASH,
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
    if (query.startsWith("SELECT circle_message, circle_attestation")) {
      return [{ circle_message: cctpMessage(), circle_attestation: `0x${"c".repeat(130)}` }];
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
        destination_transaction_hash: mocks.destinationHash,
      }];
    }
    if (query.startsWith("WITH operation AS") && query.includes("SET status = 'failed'")) {
      mocks.failureQuery = query;
      return mocks.failureRows ? [{ id: PAYMENT_ID }] : [];
    }
    if (query.includes("UPDATE base_cctp_operations SET status = 'awaiting_attestation'")) {
      mocks.pendingQuery = query;
      if (["authorized", "source_confirmed", "awaiting_attestation"].includes(mocks.status)) {
        mocks.status = "awaiting_attestation";
        return [{ payment_id: PAYMENT_ID }];
      }
      return [];
    }
    if (query.includes("UPDATE base_cctp_operations SET status = 'destination_prepared'")) {
      mocks.transitionQuery = query;
      if (!mocks.transitionRows) return [];
      if (mocks.status === "destination_prepared" && mocks.leaseExpiresAt > Date.now()) return [];
      mocks.status = "destination_prepared";
      mocks.leaseExpiresAt = Date.now() + 60_000;
      return [{ payment_id: PAYMENT_ID }];
    }
    if (query.includes("UPDATE base_cctp_operations SET status = 'destination_submitted'")) {
      mocks.transitionQuery = query;
      return mocks.transitionRows ? [{ id: PAYMENT_ID }] : [];
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
  it("verifies Circle's forwarded mint and does not reserve a second destination transaction", async () => {
    const input = {
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
      baseRpc: mintRpc(),
    };
    const first = await prepareStellarToBaseCctpDestination(input);
    const duplicate = await prepareStellarToBaseCctpDestination(input);

    expect(first.status).toBe("completed");
    expect(duplicate).toEqual({
      status: "in_progress",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
      destinationTransactionHash: DESTINATION_HASH,
    });
    expect(first.destinationTransactionHash).toBe(DESTINATION_HASH);
    expect(mocks.transitionQuery).toContain("FROM payment ON CONFLICT");
  });

  it("does not return a mint request when the guarded payment update loses a race", async () => {
    mocks.transitionRows = false;
    await expect(prepareStellarToBaseCctpDestination({
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
      baseRpc: mintRpc(),
    })).resolves.toEqual({
      status: "in_progress",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
      destinationTransactionHash: DESTINATION_HASH,
    });
    expect(mocks.transitionQuery).toContain("FOR UPDATE OF p, o");
    expect(mocks.transitionQuery).toContain("FROM payment ON CONFLICT");
  });

  it("keeps the same Stellar burn pending when Circle attested but has not forwarded", async () => {
    mocks.getCircleCctpStatus.mockResolvedValue({
      status: "complete",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
      message: cctpMessage(),
      attestation: `0x${"c".repeat(130)}`,
      messageHash: "1".repeat(64),
      attestationHash: "2".repeat(64),
    });
    const baseRpc = mintRpc();
    await expect(prepareStellarToBaseCctpDestination({
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
      baseRpc,
    })).resolves.toEqual({ status: "pending", sourceTransactionHash: STELLAR_SOURCE_HASH });
    expect(mocks.transitionQuery).toBe("");
    expect(baseRpc.request).not.toHaveBeenCalled();
  });

  it("keeps a reserved forwarded hash pending until it is visible, then verifies it", async () => {
    mocks.status = "destination_prepared";
    mocks.destinationHash = DESTINATION_HASH;
    const baseInput = {
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
    };
    await expect(prepareStellarToBaseCctpDestination({
      ...baseInput,
      baseRpc: { request: vi.fn().mockResolvedValue(null) } as unknown as BaseRpc,
    })).resolves.toEqual({
      status: "pending",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
      destinationTransactionHash: DESTINATION_HASH,
    });
    await expect(prepareStellarToBaseCctpDestination({
      ...baseInput,
      baseRpc: mintRpc(),
    })).resolves.toEqual({
      status: "completed",
      destinationTransactionHash: DESTINATION_HASH,
    });
  });

  it("does not regress an active mint reservation when a late Circle poll says pending", async () => {
    const input = {
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
      baseRpc: mintRpc(),
    };
    expect((await prepareStellarToBaseCctpDestination(input)).status).toBe("completed");
    mocks.getCircleCctpStatus.mockResolvedValue({ status: "pending", sourceTransactionHash: STELLAR_SOURCE_HASH });
    expect(await prepareStellarToBaseCctpDestination(input)).toEqual({
      status: "pending",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
    });
    expect(mocks.status).toBe("destination_prepared");
    expect(mocks.pendingQuery).toContain("status IN ('authorized', 'source_confirmed', 'awaiting_attestation')");
  });

  it("does not record a destination submission event when the guarded payment update loses a race", async () => {
    mocks.transitionRows = false;
    await expect(recordStellarToBaseDestinationSubmitted({
      paymentId: PAYMENT_ID,
      destinationTransactionHash: DESTINATION_HASH,
      rpc: mintRpc(),
    })).rejects.toThrow("Base destination has no matching attestation reservation");
    expect(mocks.transitionQuery).toContain("FOR UPDATE OF p, o");
    expect(mocks.transitionQuery).toContain("FROM payment ON CONFLICT");
  });

  it("does not record destination submission from a hash absent on Base", async () => {
    const rpc = { request: vi.fn().mockResolvedValue(null) } as unknown as BaseRpc;
    await expect(recordStellarToBaseDestinationSubmitted({
      paymentId: PAYMENT_ID,
      destinationTransactionHash: DESTINATION_HASH,
      rpc,
    })).rejects.toThrow("not yet visible on the network");
    expect(mocks.transitionQuery).toBe("");
  });

  it("does not record destination submission for another Circle mint calldata", async () => {
    const rpc = { request: vi.fn().mockResolvedValue({
      hash: DESTINATION_HASH,
      from: BASE_SUBMITTER,
      to: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
      input: "0x1234",
    }) } as unknown as BaseRpc;
    await expect(recordStellarToBaseDestinationSubmitted({
      paymentId: PAYMENT_ID,
      destinationTransactionHash: DESTINATION_HASH,
      rpc,
    })).rejects.toThrow("does not submit the reserved Circle mint");
    expect(mocks.transitionQuery).toBe("");
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

  it("persists a guarded recipient-verification failure for the exact finalized mint hash", async () => {
    mocks.paymentStatus = "destination_submitted";
    mocks.destinationHash = DESTINATION_HASH;

    await expect(reconcileStellarToBaseDestination({
      paymentId: PAYMENT_ID,
      destinationTransactionHash: DESTINATION_HASH,
      rpc: mintRpc(`0x${"c".repeat(40)}`),
    })).rejects.toThrow("expected recipient");

    expect(mocks.failureQuery).toContain("route_id = 'stellar_to_base'");
    expect(mocks.failureQuery).toContain("destination_transaction_hash =");
    expect(mocks.failureQuery).toContain("'recipient_verification'");
    expect(mocks.failureQuery).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
  });

  it.each([
    { name: "Fast Transfer", minFinalityThreshold: 1_000, finalityThresholdExecuted: 1_000 },
    { name: "non-Standard", minFinalityThreshold: 3_000, finalityThresholdExecuted: 3_000 },
    { name: "below Standard execution", minFinalityThreshold: 2_000, finalityThresholdExecuted: 1_000 },
  ])("rejects Stellar source attestations with $name finality", async ({
    minFinalityThreshold,
    finalityThresholdExecuted,
  }) => {
    mocks.getCircleCctpStatus.mockResolvedValue({
      status: "complete",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
      message: cctpMessage({ minFinalityThreshold, finalityThresholdExecuted }),
      attestation: `0x${"c".repeat(130)}`,
      messageHash: "1".repeat(64),
      attestationHash: "2".repeat(64),
      forwardTransactionHash: DESTINATION_HASH,
    });

    await expect(prepareStellarToBaseCctpDestination({
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
      baseRpc: mintRpc(),
    })).rejects.toThrow("Circle attestation does not match the persisted Stellar burn intent");
  });

  it.each([
    { name: "zero nonce", change: { nonce: "0".repeat(64) } },
    { name: "wrong source messenger", change: { sender: "1".repeat(64) } },
    { name: "wrong Base messenger", change: { recipient: "2".repeat(64) } },
    { name: "wrong burn token", change: { burnToken: "3".repeat(64) } },
    { name: "wrong source smart account", change: { messageSender: "4".repeat(64) } },
    { name: "excess executed fee", change: { feeExecuted: 1_000_001n } },
    { name: "recipient shortfall", change: { feeExecuted: 500_000n } },
    { name: "unrepresentable Base precision", change: { feeExecuted: 999_999n } },
  ])("rejects $name in the Stellar burn attestation", async ({ change }) => {
    mocks.getCircleCctpStatus.mockResolvedValue({
      status: "complete",
      sourceTransactionHash: STELLAR_SOURCE_HASH,
      message: cctpMessage(change),
      attestation: `0x${"c".repeat(130)}`,
      messageHash: "1".repeat(64),
      attestationHash: "2".repeat(64),
      forwardTransactionHash: DESTINATION_HASH,
    });
    await expect(prepareStellarToBaseCctpDestination({
      paymentId: PAYMENT_ID,
      stellarSourceTransactionHash: STELLAR_SOURCE_HASH,
      stellarRpc: { getTransaction: vi.fn() } as never,
      config,
      baseRpc: mintRpc(),
    })).rejects.toThrow("Circle attestation does not match the persisted Stellar burn intent");
  });
});
