import type { ActiveAgentPass } from "../../stellar/agent-pass";
import type { PersistedAgentPass } from "../../domain/agent-pass-status";
import type { PaymentExecutionResult } from "./conversation-payment";

/** Identify one in-memory signer/pass session without exposing private key data. */
export function agentPassBrowserSessionKey(pass: ActiveAgentPass | null): string | null {
  return pass
    ? `${pass.smartAccount}:${pass.ruleId}:${pass.agentAddress}`
    : null;
}

/** Keep an established pass mounted while refreshing its current spend. */
export function agentPassStatusView(
  pass: Pick<PersistedAgentPass, "status"> | null,
  isLoading: boolean,
  statusUnavailable = false,
): "loading" | "active" | "expired" | "none" | "unavailable" {
  if (statusUnavailable) return "unavailable";
  if (isLoading && !pass) return "loading";
  if (pass?.status === "active") return "active";
  if (pass?.status === "expired") return "expired";
  return "none";
}

export function shouldRefreshAgentPassAfterPayment(result: PaymentExecutionResult): boolean {
  return result.status === "completed";
}
