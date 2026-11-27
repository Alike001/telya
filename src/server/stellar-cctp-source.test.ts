import { Buffer } from "node:buffer";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  verifyStellarCctpBurn: vi.fn(),
  queries: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));
vi.mock("../stellar/cctp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../stellar/cctp")>()),
  verifyStellarCctpBurn: mocks.verifyStellarCctpBurn,
}));

import { reconcileStellarCctpSource } from "./stellar-cctp";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_HASH = "a".repeat(64);
const SOURCE = StrKey.encodeContract(Buffer.alloc(32, 1));
const RECIPIENT = `0x${"b".repeat(40)}`;
const config = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  usdcContract: StrKey.encodeContract(Buffer.alloc(32, 2)),
  tokenMessenger: StrKey.encodeContract(Buffer.alloc(32, 3)),
  messageTransmitter: StrKey.encodeContract(Buffer.alloc(32, 4)),
  forwarder: StrKey.encodeContract(Buffer.alloc(32, 5)),
  baseDomain: 6,
  stellarDomain: 27,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.verifyStellarCctpBurn.mockResolvedValue({
    status: "verified",
    txHash: SOURCE_HASH,
    ledger: 456,
    amountRaw: 5_100_000n,
    recipient: RECIPIENT,
  });
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join(" ").replace(/\s+/g, " ").trim();
    mocks.queries.push(query);
    if (query.startsWith("SELECT p.id, p.route_id")) {
      return [{
        id: PAYMENT_ID,
        route_id: "stellar_to_base",
        recipient_address: RECIPIENT,
        expected_amount: "5",
        source_address: SOURCE,
      }];
    }
    if (query.startsWith("WITH eligible AS MATERIALIZED")) {
      return [{ id: PAYMENT_ID }];
    }
    return [];
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<Record<string, unknown>>>;
    transaction(queries: Array<Promise<unknown>>): Promise<unknown[]>;
  };
  sql.transaction = (queries) => Promise.all(queries);
  mocks.getSqlClient.mockReturnValue(sql);
});

describe("Stellar CCTP source reconciliation", () => {
  it("records source confirmation while leaving Circle/Base destination incomplete", async () => {
    await expect(reconcileStellarCctpSource({
      paymentId: PAYMENT_ID,
      transactionHash: SOURCE_HASH,
      burnAmount: "5.1",
      maxFee: "0.1",
      rpc: { getTransaction: vi.fn() } as never,
      config,
    })).resolves.toEqual({ status: "source_confirmed" });

    expect(mocks.queries.some((query) => /SET status = 'source_confirmed'/.test(query))).toBe(true);
    expect(mocks.queries.some((query) => /SET status = 'completed'/.test(query))).toBe(false);
    expect(mocks.queries.some((query) => /'stellar_cctp_source_confirmed'/.test(query))).toBe(true);
  });
});
