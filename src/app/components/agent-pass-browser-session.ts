import type { ActiveAgentPass } from "../../stellar/agent-pass";

/** Identify one in-memory signer/pass session without exposing private key data. */
export function agentPassBrowserSessionKey(pass: ActiveAgentPass | null): string | null {
  return pass
    ? `${pass.smartAccount}:${pass.ruleId}:${pass.agentAddress}`
    : null;
}
