import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  query: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));

import { recordBaseCctpAttestation } from "./base-cctp";

const paymentId = "11111111-1111-4111-8111-111111111111";
const sourceTransactionHash = `0x${"a".repeat(64)}`;
const input = {
  paymentId,
  sourceTransactionHash,
  expectedRecipientAddress: "C".repeat(56),
  expectedRecipientAmount: "5",
  expectedAmountAtomic: "50000000",
  burnAmountAtomic: "5100000",
  maxFeeAtomic: "100000",
  circle: {
    status: "complete" as const,
    sourceTransactionHash,
    message: `0x${"b".repeat(752)}`,
    attestation: `0x${"c".repeat(130)}`,
    messageHash: "d".repeat(64),
    attestationHash: "e".repeat(64),
  },
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

describe("Base-to-Stellar source persistence", () => {
  it("rejects a stale payment or operation without writing a progress event", async () => {
    await expect(recordBaseCctpAttestation(input))
      .rejects.toThrow("changed while source evidence was being recorded");

    expect(mocks.query).toContain("FOR UPDATE OF p, o");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id CROSS JOIN");
    expect(mocks.query).toContain("o.circle_attestation_hash IS NULL");
  });

  it("accepts a jointly guarded payment and operation transition", async () => {
    mocks.rows = [{ id: paymentId }];
    await expect(recordBaseCctpAttestation(input)).resolves.toBeUndefined();
  });
});
