import { rpc } from "@stellar/stellar-sdk";

export type StoredAgentPassStatus = "active" | "revoked";
export type ObservedAgentPassStatus = StoredAgentPassStatus | "expired";

export interface AgentPassExpiryEvidence {
  readonly status: ObservedAgentPassStatus;
  readonly observedLedger: number;
}

export interface StellarLedgerReader {
  getLatestLedger(): Promise<{ readonly sequence: number }>;
}

type StellarRpcEnvironment = Readonly<Record<string, string | undefined>>;

function stellarRpcUrl(environment: StellarRpcEnvironment): string {
  const value = environment.STELLAR_RPC_URL?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("STELLAR_RPC_URL must be a valid URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("STELLAR_RPC_URL must be a credential-free HTTPS URL");
  }
  return parsed.toString();
}

export async function observeAgentPassExpiry(input: {
  readonly storedStatus: unknown;
  readonly validUntilLedger: number;
  readonly ledgerReader: StellarLedgerReader;
}): Promise<AgentPassExpiryEvidence> {
  if (input.storedStatus !== "active" && input.storedStatus !== "revoked") {
    throw new Error("Agent Pass stored status is invalid");
  }
  if (!Number.isSafeInteger(input.validUntilLedger) || input.validUntilLedger < 1) {
    throw new Error("Agent Pass expiry evidence is invalid");
  }
  const { sequence } = await input.ledgerReader.getLatestLedger();
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Stellar RPC returned an invalid ledger sequence");
  }
  return {
    status: input.storedStatus === "revoked"
      ? "revoked"
      : sequence > input.validUntilLedger ? "expired" : "active",
    observedLedger: sequence,
  };
}

export function stellarLedgerReaderFromEnvironment(
  environment: StellarRpcEnvironment = process.env,
): StellarLedgerReader {
  return new rpc.Server(stellarRpcUrl(environment));
}
