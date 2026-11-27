import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  completionRows: true,
  completionQuery: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));

import {
  BASE_SEPOLIA_USDC,
  type BaseRpc,
  type BaseTransactionReceipt,
} from "../base/evm";
import { reconcileBaseDirectPayment } from "./base-cctp";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const TX_HASH = `0x${"d".repeat(64)}`;
const SOURCE = `0x${"1".repeat(40)}`;
const RECIPIENT = `0x${"b".repeat(40)}`;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function word(value: bigint): string { return value.toString(16).padStart(64, "0"); }

function finalizedRpc(): BaseRpc {
  const receipt: BaseTransactionReceipt = {
    transactionHash: TX_HASH,
    status: "0x1",
    blockNumber: "0x100",
    logs: [{
      address: BASE_SEPOLIA_USDC,
      topics: [
        TRANSFER_TOPIC,
        `0x${SOURCE.slice(2).padStart(64, "0")}`,
        `0x${RECIPIENT.slice(2).padStart(64, "0")}`,
      ],
      data: `0x${word(5_000_000n)}`,
    }],
  };
  return {
    request: vi.fn(async (method: string) => {
      if (method === "eth_getTransactionReceipt") return receipt;
      if (method === "eth_getBlockByNumber") return { number: "0x200" };
      if (method === "eth_getTransactionByHash") {
        return { hash: TX_HASH, from: SOURCE, to: BASE_SEPOLIA_USDC, input: "0xa9059cbb" };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    }) as unknown as BaseRpc["request"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completionRows = true;
  mocks.completionQuery = "";
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join(" ").replace(/\s+/g, " ").trim();
    if (query.startsWith("SELECT p.id, p.route_id")) {
      return [{
        id: PAYMENT_ID,
        route_id: "base_to_base",
        status: "authorized",
        recipient_address: RECIPIENT.toUpperCase().replace("0X", "0x"),
        expected_amount: "5",
        source_transaction_hash: null,
        destination_transaction_hash: null,
        verified_recipient_address: null,
        verified_recipient_amount: null,
        source_address: SOURCE,
      }];
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

describe("Base direct payment completion persistence", () => {
  it("accepts recipient casing differences and records events from the guarded transition", async () => {
    await expect(reconcileBaseDirectPayment({
      paymentId: PAYMENT_ID,
      transactionHash: TX_HASH,
      rpc: finalizedRpc(),
    })).resolves.toEqual({ status: "completed", transactionHash: TX_HASH });

    expect(mocks.completionQuery).toContain("lower(p.recipient_address) = lower(");
    expect(mocks.completionQuery).toContain("JOIN operation ON operation.payment_id = payment.id");
    expect(mocks.completionQuery).toContain("FROM payment CROSS JOIN (VALUES");
  });

  it("does not report completion when the guarded transition updates no payment row", async () => {
    mocks.completionRows = false;

    await expect(reconcileBaseDirectPayment({
      paymentId: PAYMENT_ID,
      transactionHash: TX_HASH,
      rpc: finalizedRpc(),
    })).rejects.toThrow("changed while destination verification was being recorded");
    expect(mocks.completionQuery).toContain("FROM payment CROSS JOIN (VALUES");
  });
});
