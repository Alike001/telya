import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../server/db/client", () => ({ getSqlClient: vi.fn() }));

import { PaymentInputError } from "../payments/service.js";
import { parseTransactionHash, trustedCctpBurnIntent } from "./base-payments.js";

describe("submitted transaction hash parsing", () => {
  const hash = "A".repeat(64);

  it("keeps the required Base prefix and normalizes case", () => {
    expect(parseTransactionHash(`0x${hash}`, true)).toBe(`0x${hash.toLowerCase()}`);
    expect(parseTransactionHash(hash, true)).toBeNull();
  });

  it("accepts either Stellar representation and returns the canonical unprefixed hash", () => {
    expect(parseTransactionHash(hash, false)).toBe(hash.toLowerCase());
    expect(parseTransactionHash(`0x${hash}`, false)).toBe(hash.toLowerCase());
  });

  it("rejects malformed hashes", () => {
    expect(parseTransactionHash(`0x${"g".repeat(64)}`, false)).toBeNull();
    expect(parseTransactionHash(null, false)).toBeNull();
  });
});

describe("trusted Circle CCTP burn intent", () => {
  it("keeps the Base-to-Stellar gross burn and max fee separate from the recipient amount", () => {
    expect(trustedCctpBurnIntent({
      route_id: "base_to_stellar",
      source_network: "base",
      expected_recipient_amount: "5",
      fees: [{ kind: "provider", asset: "USDC", payer: "sender", amount: "0.1" }],
    })).toEqual({ burnAmount: "5.1", maxFee: "0.1" });
  });

  it("uses Stellar source precision for Stellar-to-Base and ignores non-USDC fees", () => {
    expect(trustedCctpBurnIntent({
      route_id: "stellar_to_base",
      source_network: "stellar",
      expected_recipient_amount: "5.0000001",
      fees: [
        { kind: "provider", asset: "USDC", payer: "sender", amount: "0.1000001" },
        { kind: "network", asset: "XLM", payer: "sender", amount: "0.01" },
      ],
    })).toEqual({ burnAmount: "5.1000002", maxFee: "0.1000001" });
  });

  it("rejects amounts that cannot be represented on the source network", () => {
    expect(() => trustedCctpBurnIntent({
      route_id: "base_to_stellar",
      source_network: "base",
      expected_recipient_amount: "5.0000001",
      fees: [],
    })).toThrow(PaymentInputError);
  });
});
