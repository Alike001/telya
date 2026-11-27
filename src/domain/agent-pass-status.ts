export type PersistedAgentPass = {
  readonly smartAccount: string;
  readonly ruleId: number;
  readonly agentAddress: string;
  readonly agentPublicKey: string;
  readonly spendingLimit: string;
  readonly spendingLimitAtomic: bigint;
  readonly spentAmount: string;
  readonly spentAmountAtomic: bigint;
  readonly validUntilLedger: number;
  readonly observedLedger: number;
  readonly status: "active" | "expired" | "revoked";
  readonly createTransactionHash: string;
  readonly revokeTransactionHash: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
};

export type AgentPassAuthorization = {
  readonly relayerUrl: "/api/stellar/relayer/payment";
  readonly expiresAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function contract(value: unknown): value is string {
  return typeof value === "string" && /^C[A-Z2-7]{55}$/.test(value);
}

function stellarAccount(value: unknown): value is string {
  return typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value);
}

function decimal(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,7})?$/.test(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parsePersistedAgentPass(value: unknown): PersistedAgentPass | null {
  const pass = record(value);
  if (
    !pass || !contract(pass.smartAccount) ||
    !Number.isSafeInteger(pass.ruleId) || Number(pass.ruleId) < 1 ||
    !stellarAccount(pass.agentAddress) ||
    typeof pass.agentPublicKey !== "string" || !/^[0-9a-f]{64}$/i.test(pass.agentPublicKey) ||
    !decimal(pass.spendingLimit) || typeof pass.spendingLimitAtomic !== "string" || !/^\d+$/.test(pass.spendingLimitAtomic) ||
    !decimal(pass.spentAmount) || typeof pass.spentAmountAtomic !== "string" || !/^\d+$/.test(pass.spentAmountAtomic) ||
    !Number.isSafeInteger(pass.validUntilLedger) || Number(pass.validUntilLedger) < 1 ||
    !Number.isSafeInteger(pass.observedLedger) || Number(pass.observedLedger) < 1 ||
    !(pass.status === "active" || pass.status === "expired" || pass.status === "revoked") ||
    !hash(pass.createTransactionHash) ||
    !(pass.revokeTransactionHash === null || hash(pass.revokeTransactionHash)) ||
    !timestamp(pass.createdAt) ||
    !(pass.revokedAt === null || timestamp(pass.revokedAt))
  ) return null;
  const spendingLimitAtomic = BigInt(pass.spendingLimitAtomic);
  const spentAmountAtomic = BigInt(pass.spentAmountAtomic);
  if (
    spendingLimitAtomic < 1n || spentAmountAtomic < 0n || spentAmountAtomic > spendingLimitAtomic ||
    (pass.status === "active" && Number(pass.observedLedger) > Number(pass.validUntilLedger)) ||
    (pass.status === "expired" && Number(pass.observedLedger) <= Number(pass.validUntilLedger)) ||
    (pass.status === "revoked") !== (pass.revokedAt !== null) ||
    (pass.status === "revoked") !== (pass.revokeTransactionHash !== null)
  ) return null;
  return {
    smartAccount: pass.smartAccount,
    ruleId: Number(pass.ruleId),
    agentAddress: pass.agentAddress,
    agentPublicKey: pass.agentPublicKey,
    spendingLimit: pass.spendingLimit,
    spendingLimitAtomic,
    spentAmount: pass.spentAmount,
    spentAmountAtomic,
    validUntilLedger: Number(pass.validUntilLedger),
    observedLedger: Number(pass.observedLedger),
    status: pass.status,
    createTransactionHash: pass.createTransactionHash,
    revokeTransactionHash: pass.revokeTransactionHash as string | null,
    createdAt: pass.createdAt,
    revokedAt: pass.revokedAt as string | null,
  };
}

export function parseAgentPassAuthorization(value: unknown): AgentPassAuthorization | null {
  const authorization = record(value);
  if (
    !authorization || authorization.status !== "authorization_ready" ||
    authorization.relayerUrl !== "/api/stellar/relayer/payment" ||
    !timestamp(authorization.expiresAt) ||
    Date.parse(authorization.expiresAt) <= Date.now()
  ) return null;
  return {
    relayerUrl: authorization.relayerUrl,
    expiresAt: authorization.expiresAt,
  };
}

export function formatStellarAtomicAmount(value: bigint): string {
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
