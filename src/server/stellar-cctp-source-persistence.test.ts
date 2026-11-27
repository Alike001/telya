import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  query: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));

import { recordStellarCctpSource } from "./stellar-cctp";

const paymentId = "11111111-1111-4111-8111-111111111111";
const input = {
  paymentId,
  transactionHash: "a".repeat(64),
  sourceLedger: 12345,
  recipientAddress: `0x${"b".repeat(40)}`,
  expectedRecipientAmount: "5",
  expectedAmountAtomic: "50000000",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.query = "";
  mocks.getSqlClient.mockReturnValue(async (strings: TemplateStringsArray) => {
    mocks.query = strings.join(" ").replace(/\s+/g, " ");
    return mocks.rows;
  });
});

describe("Stellar-to-Base source persistence", () => {
  it("rejects a stale payment or conflicting operation without a source-confirmed event", async () => {
    await expect(recordStellarCctpSource(input))
      .rejects.toThrow("changed while source evidence was being recorded");

    expect(mocks.query).toContain("FOR UPDATE OF p");
    expect(mocks.query).toContain("lower(p.recipient_address) = lower(");
    expect(mocks.query).toContain("stellar_cctp_operations.source_ledger = EXCLUDED.source_ledger");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
  });

  it("accepts the jointly guarded operation and Payment transition", async () => {
    mocks.rows = [{ id: paymentId }];
    await expect(recordStellarCctpSource(input)).resolves.toBeUndefined();
  });
});
