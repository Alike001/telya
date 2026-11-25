import { Keypair } from "@stellar/stellar-sdk";
import {
  LEDGERS_PER_HOUR,
  createCallContractContext,
  createEd25519Signer,
  createSpendingLimitParams,
  type ContractSigner,
  type SmartAccountKit,
  type SpendingLimitData,
  type TransactionResult,
} from "smart-account-kit";

import type { DecimalAmount } from "../domain";
import { normalizeStellarUsdcAmount } from "./usdc";

export const AGENT_PASS_DURATION_LEDGERS = LEDGERS_PER_HOUR;
export const OWNER_CONTEXT_RULE_ID = 0;

export interface ActiveAgentPass {
  readonly smartAccount: string;
  readonly ruleId: number;
  readonly agentAddress: string;
  readonly agentPublicKey: string;
  readonly spendingLimit: DecimalAmount;
  readonly spendingLimitAtomic: bigint;
  readonly validUntilLedger: number;
  readonly createTransactionHash: string;
  readonly signer: ContractSigner;
}

export interface AgentPassSpending {
  readonly spendingLimitAtomic: bigint;
  readonly spentAtomic: bigint;
  readonly remainingAtomic: bigint;
  readonly periodLedgers: number;
}

export class AgentPassError extends Error {
  constructor(
    readonly code:
      | "INVALID_ACCOUNT"
      | "CREATE_FAILED"
      | "SPEND_FAILED"
      | "REVOKE_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentPassError";
  }
}

function failureMessage(result: TransactionResult): string {
  return result.success ? "" : result.error.message;
}

/**
 * Creates an ephemeral Testnet agent key in browser memory, then asks the
 * passkey owner to install a USDC-only, expiring context rule with the on-chain
 * spending-limit policy. The private key is never returned or persisted.
 */
export async function createStellarAgentPass(input: {
  readonly kit: SmartAccountKit;
  readonly tokenContract: string;
  readonly ed25519VerifierAddress: string;
  readonly spendingLimitPolicyAddress: string;
  readonly spendingLimit: DecimalAmount;
  readonly durationLedgers?: number;
}): Promise<ActiveAgentPass> {
  const smartAccount = input.kit.contractId;
  if (!smartAccount) {
    throw new AgentPassError(
      "INVALID_ACCOUNT",
      "Connect the passkey-owned Stellar account before creating an Agent Pass.",
    );
  }

  const limit = normalizeStellarUsdcAmount(input.spendingLimit);
  const durationLedgers = input.durationLedgers ?? AGENT_PASS_DURATION_LEDGERS;
  if (!Number.isSafeInteger(durationLedgers) || durationLedgers < 1) {
    throw new AgentPassError(
      "CREATE_FAILED",
      "Agent Pass duration must be a positive ledger count.",
    );
  }

  const { sequence } = await input.kit.rpc.getLatestLedger();
  const validUntilLedger = sequence + durationLedgers;
  const agentKeypair = Keypair.random();
  const registered = input.kit.externalSigners.addEd25519FromSecret(
    agentKeypair.secret(),
    input.ed25519VerifierAddress,
  );
  const signer = createEd25519Signer(
    input.ed25519VerifierAddress,
    agentKeypair.rawPublicKey(),
  );
  const installParams = input.kit.convertPolicyParams(
    "spending_limit",
    createSpendingLimitParams(limit.raw, durationLedgers),
  );
  const transaction = await input.kit.rules.add(
    createCallContractContext(input.tokenContract),
    "Telya Agent Pass",
    [signer],
    new Map([[input.spendingLimitPolicyAddress, installParams]]),
    validUntilLedger,
  );
  const ruleId = transaction.result.id;
  const result = await input.kit.signAndSubmitAdmin(transaction, {
    forceMethod: "relayer",
    resolveContextRuleIds: () => [OWNER_CONTEXT_RULE_ID],
  });

  if (!result.success) {
    input.kit.externalSigners.remove(registered.address);
    throw new AgentPassError(
      "CREATE_FAILED",
      failureMessage(result) || "The Agent Pass was not created on Stellar.",
      { cause: result.error },
    );
  }

  return {
    smartAccount,
    ruleId,
    agentAddress: registered.address,
    agentPublicKey: registered.publicKey,
    spendingLimit: limit.decimal,
    spendingLimitAtomic: limit.raw,
    validUntilLedger,
    createTransactionHash: result.hash,
    signer,
  };
}

export async function getAgentPassSpending(input: {
  readonly kit: SmartAccountKit;
  readonly spendingLimitPolicyAddress: string;
  readonly ruleId: number;
}): Promise<AgentPassSpending> {
  const data: SpendingLimitData = await input.kit.policyClients
    .spendingLimit(input.spendingLimitPolicyAddress)
    .getSpendingLimitData(input.ruleId);
  return {
    spendingLimitAtomic: data.spending_limit,
    spentAtomic: data.cached_total_spent,
    remainingAtomic:
      data.cached_total_spent >= data.spending_limit
        ? 0n
        : data.spending_limit - data.cached_total_spent,
    periodLedgers: data.period_ledgers,
  };
}

export async function submitAgentPassTransfer(input: {
  readonly kit: SmartAccountKit;
  readonly pass: ActiveAgentPass;
  readonly tokenContract: string;
  readonly recipient: string;
  readonly amount: DecimalAmount;
}): Promise<TransactionResult> {
  const amount = normalizeStellarUsdcAmount(input.amount);
  const selected = input.kit.multiSigners.buildSelectedSigners([
    input.pass.signer,
  ]);
  if (selected.length !== 1 || selected[0]?.type !== "ed25519") {
    throw new AgentPassError(
      "SPEND_FAILED",
      "The ephemeral Agent Pass key is no longer available in this browser session.",
    );
  }
  return input.kit.multiSigners.transfer(
    input.tokenContract,
    input.recipient,
    amount.number,
    selected,
    {
      forceMethod: "relayer",
      resolveContextRuleIds: () => [input.pass.ruleId],
    },
  );
}

export async function revokeStellarAgentPass(input: {
  readonly kit: SmartAccountKit;
  readonly pass: Pick<ActiveAgentPass, "ruleId">;
}): Promise<{ readonly transactionHash: string }> {
  const transaction = await input.kit.rules.remove(input.pass.ruleId);
  const result = await input.kit.signAndSubmitAdmin(transaction, {
    forceMethod: "relayer",
    resolveContextRuleIds: () => [OWNER_CONTEXT_RULE_ID],
  });
  if (!result.success) {
    throw new AgentPassError(
      "REVOKE_FAILED",
      failureMessage(result) || "The Agent Pass was not revoked on Stellar.",
      { cause: result.error },
    );
  }
  return { transactionHash: result.hash };
}
