import { describe, expect, it } from "vitest";
import type { ActiveAgentPass } from "../../stellar/agent-pass.ts";

import {
  agentPassBrowserSessionKey,
  agentPassStatusView,
  shouldRefreshAgentPassAfterPayment,
} from "./agent-pass-browser-session.ts";

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

describe("Agent Pass payment feedback", () => {
  it("keeps an active pass and its spend result mounted during status refresh", () => {
    expect(agentPassStatusView({ status: "active" }, true)).toBe("active");
    expect(agentPassStatusView(null, true)).toBe("loading");
  });

  it("does not discard rejection feedback for a needless status refresh", () => {
    expect(shouldRefreshAgentPassAfterPayment({
      status: "failed",
      transactionHash: null,
      message: "Allowance exceeded",
    })).toBe(false);
    expect(shouldRefreshAgentPassAfterPayment({
      status: "status_unknown",
      transactionHash: null,
      message: "Verification unavailable",
    })).toBe(false);
    expect(shouldRefreshAgentPassAfterPayment({
      status: "completed",
      transactionHash: "a".repeat(64),
      verifiedRecipient: "GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW",
      verifiedAmount: "0.1",
    })).toBe(true);
  });
});
