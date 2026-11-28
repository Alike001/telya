import { describe, expect, it, vi } from "vitest";

import {
  observeAgentPassExpiry,
  stellarLedgerReaderFromEnvironment,
} from "./stellar-agent-pass-status";

describe("Agent Pass expiry observation", () => {
  it("keeps a pass active through its valid-until ledger", async () => {
    await expect(observeAgentPassExpiry({
      storedStatus: "active",
      validUntilLedger: 123,
      ledgerReader: { getLatestLedger: vi.fn().mockResolvedValue({ sequence: 123 }) },
    })).resolves.toEqual({ status: "active", observedLedger: 123 });
  });

  it("marks an active database row expired only from a newer Stellar ledger", async () => {
    await expect(observeAgentPassExpiry({
      storedStatus: "active",
      validUntilLedger: 123,
      ledgerReader: { getLatestLedger: vi.fn().mockResolvedValue({ sequence: 124 }) },
    })).resolves.toEqual({ status: "expired", observedLedger: 124 });
  });

  it("preserves revocation while recording the observed ledger", async () => {
    await expect(observeAgentPassExpiry({
      storedStatus: "revoked",
      validUntilLedger: 123,
      ledgerReader: { getLatestLedger: vi.fn().mockResolvedValue({ sequence: 124 }) },
    })).resolves.toEqual({ status: "revoked", observedLedger: 124 });
  });

  it("fails closed for invalid or unavailable ledger evidence", async () => {
    await expect(observeAgentPassExpiry({
      storedStatus: "invented",
      validUntilLedger: 123,
      ledgerReader: { getLatestLedger: vi.fn().mockResolvedValue({ sequence: 123 }) },
    })).rejects.toThrow("stored status is invalid");
    await expect(observeAgentPassExpiry({
      storedStatus: "active",
      validUntilLedger: 123,
      ledgerReader: { getLatestLedger: vi.fn().mockResolvedValue({ sequence: 0 }) },
    })).rejects.toThrow("invalid ledger sequence");
    await expect(observeAgentPassExpiry({
      storedStatus: "active",
      validUntilLedger: 123,
      ledgerReader: { getLatestLedger: vi.fn().mockRejectedValue(new Error("offline")) },
    })).rejects.toThrow("offline");
  });

  it("rejects missing, insecure, or credential-bearing RPC configuration", () => {
    expect(() => stellarLedgerReaderFromEnvironment({})).toThrow("valid URL");
    expect(() => stellarLedgerReaderFromEnvironment({ STELLAR_RPC_URL: "http://rpc.test" })).toThrow("credential-free HTTPS");
    expect(() => stellarLedgerReaderFromEnvironment({ STELLAR_RPC_URL: "https://user:secret@rpc.test" })).toThrow("credential-free HTTPS");
  });
});
