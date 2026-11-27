import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  query: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: mocks.getSqlClient }));

import {
  recordBaseCctpSourceVerificationFailure,
  recordBaseDirectVerificationFailure,
  recordStellarToBaseDestinationVerificationFailure,
} from "./base-cctp";

const paymentId = "11111111-1111-4111-8111-111111111111";
const baseHash = `0x${"a".repeat(64)}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [{ id: paymentId }];
  mocks.query = "";
  mocks.getSqlClient.mockReturnValue(async (strings: TemplateStringsArray) => {
    mocks.query = strings.join(" ").replace(/\s+/g, " ");
    return mocks.rows;
  });
});

describe("Base payment verification failure persistence", () => {
  it("fails Base direct only from its exact persisted destination hash", async () => {
    await recordBaseDirectVerificationFailure({
      paymentId,
      transactionHash: baseHash,
      reason: "recipient mismatch",
    });

    expect(mocks.query).toContain("route_id = 'base_to_base'");
    expect(mocks.query).toContain("status = 'destination_submitted'");
    expect(mocks.query).toContain("destination_transaction_hash =");
    expect(mocks.query).toContain("'recipient_verification'");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
  });

  it("fails Base-to-Stellar only from its exact persisted source burn", async () => {
    await recordBaseCctpSourceVerificationFailure({
      paymentId,
      transactionHash: baseHash,
      reason: "burn mismatch",
    });

    expect(mocks.query).toContain("route_id = 'base_to_stellar'");
    expect(mocks.query).toContain("status = 'submitted'");
    expect(mocks.query).toContain("source_transaction_hash =");
    expect(mocks.query).toContain("'source_verification'");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
  });

  it("fails Stellar-to-Base only from its exact persisted destination hash", async () => {
    await recordStellarToBaseDestinationVerificationFailure({
      paymentId,
      transactionHash: baseHash,
      reason: "mint mismatch",
    });

    expect(mocks.query).toContain("route_id = 'stellar_to_base'");
    expect(mocks.query).toContain("status = 'destination_submitted'");
    expect(mocks.query).toContain("destination_transaction_hash =");
    expect(mocks.query).toContain("'recipient_verification'");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
  });

  it("does not claim a failure event when the guarded state changed", async () => {
    mocks.rows = [];

    await expect(recordBaseCctpSourceVerificationFailure({
      paymentId,
      transactionHash: baseHash,
      reason: "burn mismatch",
    })).rejects.toThrow("changed while source failure was being recorded");
    expect(mocks.query).toContain("FROM payment p JOIN operation o ON o.payment_id = p.id");
  });
});
