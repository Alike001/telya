import { describe, expect, it } from "vitest";

import {
  formatStellarAtomicAmount,
  parseAgentPassAuthorization,
  parsePersistedAgentPass,
} from "./agent-pass-status";

const active = {
  smartAccount: `C${"A".repeat(55)}`,
  ruleId: 3,
  agentAddress: "GCQZMUA62XYUWELVOEVHVXJUQGHJT2QR73FBPILYYFXMKHDNLVAILEH5",
  agentPublicKey: "c".repeat(64),
  spendingLimit: "25.0000000",
  spendingLimitAtomic: "250000000",
  spentAmount: "1.5000000",
  spentAmountAtomic: "15000000",
  validUntilLedger: 123456,
  observedLedger: 123455,
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
    expect(parsePersistedAgentPass({ ...active, agentAddress: `C${"B".repeat(55)}` })).toBeNull();
  });

  it("requires observed ledger evidence to agree with active and expired status", () => {
    expect(parsePersistedAgentPass({
      ...active,
      status: "expired",
      observedLedger: 123457,
    })).toMatchObject({ status: "expired", observedLedger: 123457 });
    expect(parsePersistedAgentPass({ ...active, observedLedger: 123457 })).toBeNull();
    expect(parsePersistedAgentPass({ ...active, status: "expired" })).toBeNull();
    expect(parsePersistedAgentPass({ ...active, observedLedger: undefined })).toBeNull();
  });
});

describe("Agent Pass authorization parsing", () => {
  it("accepts only the protected same-origin relayer handoff", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(parseAgentPassAuthorization({
      status: "authorization_ready",
      relayerUrl: "/api/stellar/relayer/payment",
      expiresAt,
    })).toEqual({ relayerUrl: "/api/stellar/relayer/payment", expiresAt });
    expect(parseAgentPassAuthorization({
      status: "authorization_ready",
      relayerUrl: "https://attacker.test/relayer",
      expiresAt,
    })).toBeNull();
  });
});
