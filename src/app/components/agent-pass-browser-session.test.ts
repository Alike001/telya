import { describe, expect, it } from "vitest";
import type { ActiveAgentPass } from "../../stellar/agent-pass.ts";

import { agentPassBrowserSessionKey } from "./agent-pass-browser-session.ts";

describe("Agent Pass browser session identity", () => {
  it("uses only the account, rule and public agent address", () => {
    const pass = {
      smartAccount: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      ruleId: 7,
      agentAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      agentPublicKey: "public-key",
      spendingLimit: "25.00",
      spendingLimitAtomic: 250_000_000n,
      validUntilLedger: 123,
      createTransactionHash: "a".repeat(64),
      signer: {},
    } as unknown as ActiveAgentPass;
    expect(agentPassBrowserSessionKey(pass)).toBe(
      `${pass.smartAccount}:7:${pass.agentAddress}`,
    );
    expect(agentPassBrowserSessionKey(null)).toBeNull();
  });
});
