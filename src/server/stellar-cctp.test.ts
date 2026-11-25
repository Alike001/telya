import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  verifyBaseToStellarDestination: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../../server/db/client", () => ({
  getSqlClient: mocks.getSqlClient,
}));

vi.mock("../stellar/cctp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../stellar/cctp")>()),
  verifyBaseToStellarDestination: mocks.verifyBaseToStellarDestination,
}));

import {
  settleBaseToStellarCctp,
  type PreparedStellarCctpDestination,
} from "./stellar-cctp";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_HASH = "a".repeat(64);
const DESTINATION_HASH = "b".repeat(64);
const RECIPIENT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const MESSAGE = "0102";
const ATTESTATION = "aabb";
const ENVELOPE_XDR = "recoverable-signed-envelope";

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

interface OperationState {
  status: string;
  destinationTransactionHash: string | null;
  destinationEnvelopeXdr: string | null;
  leaseExpired: boolean;
}

function fakeSql(state: OperationState) {
  const sql = (async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Array<Record<string, unknown>>> => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    if (query.startsWith("SELECT id, recipient_address")) {
      return [{
        id: PAYMENT_ID,
        recipient_address: RECIPIENT,
        expected_amount: "5",
      }];
    }
    if (query.startsWith("WITH reserved AS")) {
      return [{
        status: state.status,
        source_transaction_hash: SOURCE_HASH,
        circle_message_hash: "a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222",
        circle_attestation_hash: "d798d1fac6bd4bb1c11f50312760351013379a0ab6f0a8c0af8a506b96b2525a",
        destination_transaction_hash: state.destinationTransactionHash,
        destination_envelope_xdr: state.destinationEnvelopeXdr,
        submission_lease_id: "22222222-2222-4222-8222-222222222222",
        submission_lease_expires_at: state.leaseExpired
          ? new Date(0)
          : new Date(Date.now() + 30_000),
        reserved: false,
      }];
    }
    if (
      query.includes("status = 'destination_submitting'") &&
      query.includes("RETURNING payment_id") &&
      query.includes("submission_lease_expires_at")
    ) {
      return state.status === "destination_submitting" && state.leaseExpired
        ? [{ payment_id: PAYMENT_ID }]
        : [];
    }
    if (query.includes("SET status = 'destination_prepared'")) {
      state.status = "destination_prepared";
      state.destinationTransactionHash = String(values[0]);
      state.destinationEnvelopeXdr = String(values[1]);
      state.leaseExpired = false;
      return [{ payment_id: PAYMENT_ID }];
    }
    if (
      query.includes("status = 'destination_prepared'") &&
      query.includes("RETURNING payment_id")
    ) {
      return state.status === "destination_prepared" && state.leaseExpired
        ? [{ payment_id: PAYMENT_ID }]
        : [];
    }
    if (query.includes("SET status = 'destination_submitted'")) {
      state.status = "destination_submitted";
      state.leaseExpired = false;
      return [];
    }
    if (query.includes("SET status = 'completed'")) {
      state.status = "completed";
      return [];
    }
    return [];
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<Record<string, unknown>>>;
    transaction(queries: Array<Promise<unknown>>): Promise<unknown[]>;
  };
  sql.transaction = (queries) => Promise.all(queries);
  return sql;
}

function settlementInput(overrides: {
  prepare?: () => Promise<PreparedStellarCctpDestination>;
  submit: (prepared: PreparedStellarCctpDestination) => Promise<{
    transactionHash: string;
    ledger: number;
  }>;
}) {
  return {
    paymentId: PAYMENT_ID,
    sourceTransactionHash: SOURCE_HASH,
    message: MESSAGE,
    attestation: ATTESTATION,
    rpc: { getTransaction: vi.fn() } as never,
    config,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyBaseToStellarDestination.mockResolvedValue({
    status: "verified",
    txHash: DESTINATION_HASH,
    ledger: 456,
    recipient: RECIPIENT,
    amount: "5",
  });
});

describe("Base-to-Stellar destination recovery", () => {
  it("reclaims a stale pre-prepare lease and persists the signed envelope before submission", async () => {
    const state: OperationState = {
      status: "destination_submitting",
      destinationTransactionHash: null,
      destinationEnvelopeXdr: null,
      leaseExpired: true,
    };
    mocks.getSqlClient.mockReturnValue(fakeSql(state));
    const prepare = vi.fn().mockResolvedValue({
      transactionHash: DESTINATION_HASH,
      envelopeXdr: ENVELOPE_XDR,
    });
    const submit = vi.fn().mockImplementation(async () => {
      expect(state.status).toBe("destination_prepared");
      expect(state.destinationTransactionHash).toBe(DESTINATION_HASH);
      expect(state.destinationEnvelopeXdr).toBe(ENVELOPE_XDR);
      return { transactionHash: DESTINATION_HASH, ledger: 456 };
    });

    await expect(
      settleBaseToStellarCctp(settlementInput({ prepare, submit })),
    ).resolves.toEqual({
      status: "completed",
      destinationTransactionHash: DESTINATION_HASH,
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith({
      transactionHash: DESTINATION_HASH,
      envelopeXdr: ENVELOPE_XDR,
    });
  });

  it("replays only the persisted transaction after a crash and ignores repeated callbacks", async () => {
    const state: OperationState = {
      status: "destination_prepared",
      destinationTransactionHash: DESTINATION_HASH,
      destinationEnvelopeXdr: ENVELOPE_XDR,
      leaseExpired: true,
    };
    mocks.getSqlClient.mockReturnValue(fakeSql(state));
    const prepare = vi.fn();
    const submit = vi.fn().mockResolvedValue({
      transactionHash: DESTINATION_HASH,
      ledger: 456,
    });
    const input = settlementInput({ prepare, submit });

    await expect(settleBaseToStellarCctp(input)).resolves.toMatchObject({
      status: "completed",
    });
    await expect(settleBaseToStellarCctp(input)).resolves.toMatchObject({
      status: "completed",
    });

    expect(prepare).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith({
      transactionHash: DESTINATION_HASH,
      envelopeXdr: ENVELOPE_XDR,
    });
  });
});
