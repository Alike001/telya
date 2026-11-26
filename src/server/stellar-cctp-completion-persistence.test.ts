import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  query: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));

import { recordStellarCctpCompletion } from "./stellar-cctp";

const paymentId = "11111111-1111-4111-8111-111111111111";
const input = {
  paymentId,
  sourceTransactionHash: "a".repeat(64),
  messageHash: "b".repeat(64),
  attestationHash: "c".repeat(64),
  destinationTransactionHash: "d".repeat(64),
  destinationLedger: 12345,
  recipientAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  recipientAmount: "5",
  recipientAmountAtomic: "50000000",
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

describe("Base-to-Stellar destination completion persistence", () => {
  it("does not complete a stale Payment or emit completion events", async () => {
    await expect(recordStellarCctpCompletion(input))
      .rejects.toThrow("changed while destination completion was being recorded");
    expect(mocks.query).toContain("FOR UPDATE OF p, o");
    expect(mocks.query).toContain("o.circle_message_hash = ");
    expect(mocks.query).toContain("o.circle_attestation_hash = ");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id CROSS JOIN");
    expect(mocks.query).toContain("SELECT p.id FROM payment p JOIN operation o ON o.payment_id = p.id");
  });

  it("reports completion only after both guarded rows were returned", async () => {
    mocks.rows = [{ id: paymentId }];
    await expect(recordStellarCctpCompletion(input)).resolves.toBeUndefined();
  });
});
