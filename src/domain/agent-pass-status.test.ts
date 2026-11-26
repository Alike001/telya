import { describe, expect, it } from "vitest";

import { formatStellarAtomicAmount, parsePersistedAgentPass } from "./agent-pass-status";

const active = {
  smartAccount: `C${"A".repeat(55)}`,
  ruleId: 3,
  agentAddress: `C${"B".repeat(55)}`,
  agentPublicKey: "c".repeat(64),
  spendingLimit: "25.0000000",
  spendingLimitAtomic: "250000000",
  spentAmount: "1.5000000",
  spentAmountAtomic: "15000000",
  validUntilLedger: 123456,
  status: "active",
  createTransactionHash: "d".repeat(64),
  revokeTransactionHash: null,
  createdAt: "2026-11-26T12:00:00.000Z",
  revokedAt: null,
};

describe("persisted Agent Pass parsing", () => {
  it("accepts internally consistent persisted on-chain evidence", () => {
    expect(parsePersistedAgentPass(active)).toMatchObject({
      ruleId: 3,
      spendingLimitAtomic: 250000000n,
      spentAmountAtomic: 15000000n,
      status: "active",
    });
    expect(formatStellarAtomicAmount(235000000n)).toBe("23.5");
  });

  it("rejects impossible spend and inconsistent revocation state", () => {
    expect(parsePersistedAgentPass({ ...active, spentAmountAtomic: "260000000" })).toBeNull();
    expect(parsePersistedAgentPass({ ...active, status: "revoked" })).toBeNull();
    expect(parsePersistedAgentPass({ ...active, smartAccount: "not-a-contract" })).toBeNull();
  });
});
