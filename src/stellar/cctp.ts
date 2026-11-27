import { Buffer } from "node:buffer";

import {
  Address,
  Contract,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  type rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { TransactionResult } from "smart-account-kit";

import type { DecimalAmount } from "../domain/index.ts";
import {
  normalizeStellarUsdcAmount,
  type StellarTransactionRpc,
  type StellarUsdcVerification,
  verifyStellarUsdcTransfer,
} from "./usdc.ts";

export const CCTP_STANDARD_FINALITY_THRESHOLD = 2_000;
export const CCTP_BASE_DOMAIN = 6;
export const CCTP_STELLAR_DOMAIN = 27;

export interface StellarCctpConfig {
  readonly rpcUrl: string;
  readonly networkPassphrase: string;
  readonly usdcContract: string;
  readonly tokenMessenger: string;
  readonly messageTransmitter: string;
  readonly forwarder: string;
  readonly baseDomain: number;
  readonly stellarDomain: number;
}

export interface StellarCctpSourceKit {
  readonly contractId: string | undefined;
  executeAndSubmit(
    target: string,
    targetFn: string,
    targetArgs: Array<unknown>,
    options: { forceMethod: "relayer"; resolveContextRuleIds: () => number[] },
  ): Promise<TransactionResult>;
}

export class StellarCctpError extends Error {
  constructor(
    readonly code:
      | "INVALID_CONFIG"
      | "INVALID_ADDRESS"
      | "INVALID_ATTESTATION"
      | "INVALID_TRANSACTION"
      | "SOURCE_BURN_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StellarCctpError";
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new StellarCctpError("INVALID_CONFIG", `${label} is required`);
  }
  return normalized;
}

function requireContract(value: string, label: string): string {
  const normalized = required(value, label);
  if (!StrKey.isValidContract(normalized)) {
    throw new StellarCctpError(
      "INVALID_CONFIG",
      `${label} must be a Stellar contract address`,
    );
  }
  return normalized;
}

function requireDomain(value: number, expected: number, label: string): number {
  if (!Number.isSafeInteger(value) || value !== expected) {
    throw new StellarCctpError(
      "INVALID_CONFIG",
      `${label} must be the Circle CCTP domain ${expected}`,
    );
  }
  return value;
}

export function validateStellarCctpConfig(
  config: StellarCctpConfig,
): StellarCctpConfig {
  if (config.networkPassphrase !== Networks.TESTNET) {
    throw new StellarCctpError(
      "INVALID_CONFIG",
      "Telya CCTP execution is restricted to Stellar Testnet",
    );
  }
  let rpcUrl: URL;
  try {
    rpcUrl = new URL(required(config.rpcUrl, "rpcUrl"));
  } catch {
    throw new StellarCctpError("INVALID_CONFIG", "rpcUrl must be a valid URL");
  }
  if (rpcUrl.protocol !== "https:" || rpcUrl.username || rpcUrl.password) {
    throw new StellarCctpError(
      "INVALID_CONFIG",
      "rpcUrl must be a credential-free HTTPS URL",
    );
  }
  return {
    rpcUrl: rpcUrl.toString(),
    networkPassphrase: Networks.TESTNET,
    usdcContract: requireContract(config.usdcContract, "usdcContract"),
    tokenMessenger: requireContract(config.tokenMessenger, "tokenMessenger"),
    messageTransmitter: requireContract(
      config.messageTransmitter,
      "messageTransmitter",
    ),
    forwarder: requireContract(config.forwarder, "forwarder"),
    baseDomain: requireDomain(config.baseDomain, CCTP_BASE_DOMAIN, "baseDomain"),
    stellarDomain: requireDomain(
      config.stellarDomain,
      CCTP_STELLAR_DOMAIN,
      "stellarDomain",
    ),
  };
}

export function stellarCctpConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): StellarCctpConfig {
  return validateStellarCctpConfig({
    rpcUrl: environment.STELLAR_RPC_URL ?? "",
    networkPassphrase: environment.STELLAR_NETWORK_PASSPHRASE ?? "",
    usdcContract: environment.STELLAR_USDC_SAC ?? "",
    tokenMessenger: environment.CCTP_STELLAR_TOKEN_MESSENGER ?? "",
    messageTransmitter: environment.CCTP_STELLAR_MESSAGE_TRANSMITTER ?? "",
    forwarder: environment.CCTP_STELLAR_FORWARDER ?? "",
    baseDomain: Number(environment.CCTP_BASE_DOMAIN),
    stellarDomain: Number(environment.CCTP_STELLAR_DOMAIN),
  });
}

export function evmAddressToBytes32(address: string): Buffer {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new StellarCctpError(
      "INVALID_ADDRESS",
      "Base recipient must be a 20-byte 0x address",
    );
  }
  return Buffer.from(normalized.slice(2).padStart(64, "0"), "hex");
}

export function bytes32ToEvmAddress(value: Uint8Array): string {
  const bytes = Buffer.from(value);
  if (bytes.length !== 32 || bytes.subarray(0, 12).some((byte) => byte !== 0)) {
    throw new StellarCctpError(
      "INVALID_ADDRESS",
      "CCTP recipient is not a zero-padded EVM address",
    );
  }
  return `0x${bytes.subarray(12).toString("hex")}`;
}

function zeroBytes32(): Buffer {
  return Buffer.alloc(32);
}

function normalizeCctpFee(amount: DecimalAmount): {
  readonly decimal: DecimalAmount;
  readonly raw: bigint;
} {
  if (/^0+(?:\.0+)?$/.test(amount.trim())) return { decimal: "0", raw: 0n };
  return normalizeStellarUsdcAmount(amount);
}

export interface StellarCctpBurnIntent {
  readonly smartAccount: string;
  readonly recipient: string;
  /** Source amount including Circle's separately quoted fee. */
  readonly burnAmount: DecimalAmount;
  readonly maxFee: DecimalAmount;
}

export interface PreparedStellarCctpBurn {
  readonly smartAccount: string;
  readonly recipient: string;
  readonly amountRaw: bigint;
  readonly maxFeeRaw: bigint;
  readonly targetArgs: readonly xdr.ScVal[];
}

export function prepareStellarCctpBurn(
  config: StellarCctpConfig,
  intent: StellarCctpBurnIntent,
): PreparedStellarCctpBurn {
  const checked = validateStellarCctpConfig(config);
  const smartAccount = requireContract(intent.smartAccount, "smartAccount");
  const recipient = intent.recipient.trim().toLowerCase();
  const mintRecipient = evmAddressToBytes32(recipient);
  const amount = normalizeStellarUsdcAmount(intent.burnAmount);
  const maxFee = normalizeCctpFee(intent.maxFee);
  if (maxFee.raw >= amount.raw) {
    throw new StellarCctpError(
      "INVALID_TRANSACTION",
      "CCTP max fee must be less than the burn amount",
    );
  }

  return {
    smartAccount,
    recipient,
    amountRaw: amount.raw,
    maxFeeRaw: maxFee.raw,
    targetArgs: [
      new Address(smartAccount).toScVal(),
      nativeToScVal(amount.raw, { type: "i128" }),
      xdr.ScVal.scvU32(checked.baseDomain),
      xdr.ScVal.scvBytes(mintRecipient),
      new Address(checked.usdcContract).toScVal(),
      xdr.ScVal.scvBytes(zeroBytes32()),
      nativeToScVal(maxFee.raw, { type: "i128" }),
      xdr.ScVal.scvU32(CCTP_STANDARD_FINALITY_THRESHOLD),
    ],
  };
}

export async function submitStellarCctpBurn(input: {
  readonly kit: StellarCctpSourceKit;
  readonly config: StellarCctpConfig;
  readonly recipient: string;
  readonly burnAmount: DecimalAmount;
  readonly maxFee: DecimalAmount;
}): Promise<{ readonly txHash: string; readonly recipient: string; readonly amountRaw: bigint }> {
  const smartAccount = input.kit.contractId;
  if (!smartAccount) {
    throw new StellarCctpError(
      "INVALID_TRANSACTION",
      "Connect the passkey-owned Stellar account before starting CCTP",
    );
  }
  const checked = validateStellarCctpConfig(input.config);
  const burn = prepareStellarCctpBurn(checked, {
    smartAccount,
    recipient: input.recipient,
    burnAmount: input.burnAmount,
    maxFee: input.maxFee,
  });
  const result = await input.kit.executeAndSubmit(
    checked.tokenMessenger,
    "deposit_for_burn",
    [...burn.targetArgs],
    { forceMethod: "relayer", resolveContextRuleIds: () => [0] },
  );
  if (!result.success) {
    throw new StellarCctpError(
      "SOURCE_BURN_FAILED",
      result.error.message || "Stellar did not finalize the CCTP source burn",
      { cause: result.error },
    );
  }
  return {
    txHash: result.hash,
    recipient: burn.recipient,
    amountRaw: burn.amountRaw,
  };
}

function requireHexBytes(value: string, label: string): Buffer {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new StellarCctpError(
      "INVALID_ATTESTATION",
      `${label} must be non-empty hexadecimal bytes`,
    );
  }
  return Buffer.from(normalized, "hex");
}

export function buildMintAndForwardOperation(input: {
  readonly config: StellarCctpConfig;
  readonly message: string;
  readonly attestation: string;
}): xdr.Operation {
  const checked = validateStellarCctpConfig(input.config);
  const contract = new Contract(checked.forwarder);
  return contract.call(
    "mint_and_forward",
      xdr.ScVal.scvBytes(requireHexBytes(input.message, "message")),
      xdr.ScVal.scvBytes(requireHexBytes(input.attestation, "attestation")),
  );
}

export function buildMintAndForwardTransaction(input: {
  readonly config: StellarCctpConfig;
  readonly source: ConstructorParameters<typeof TransactionBuilder>[0];
  readonly message: string;
  readonly attestation: string;
  readonly fee: string;
}): ReturnType<TransactionBuilder["build"]> {
  const checked = validateStellarCctpConfig(input.config);
  return new TransactionBuilder(input.source, {
    fee: input.fee,
    networkPassphrase: checked.networkPassphrase,
  })
    .addOperation(buildMintAndForwardOperation(input))
    .setTimeout(60)
    .build();
}

type CctpFinalizedTransaction = Awaited<ReturnType<rpc.Server["getTransaction"]>>;

function invokeFromEnvelope(envelope: xdr.TransactionEnvelope): xdr.InvokeContractArgs | null {
  if (envelope.switch().name !== "envelopeTypeTx") return null;
  const operations = envelope.v1().tx().operations();
  if (operations.length !== 1) return null;
  const operation = operations[0]?.body();
  if (operation?.switch().name !== "invokeHostFunction") return null;
  const func = operation.invokeHostFunctionOp().hostFunction();
  return func.switch().name === "hostFunctionTypeInvokeContract"
    ? func.invokeContract()
    : null;
}

function scAddress(value: xdr.ScVal): string | null {
  return value.switch().name === "scvAddress"
    ? Address.fromScAddress(value.address()).toString()
    : null;
}

function nativeBigint(value: xdr.ScVal): bigint | null {
  const native = scValToNative(value) as unknown;
  return typeof native === "bigint" ? native : null;
}

/**
 * Confirms that a finalized Stellar transaction executed the exact owner-signed
 * Smart Account call that burns the intended amount for the intended Base
 * recipient. This is source evidence only and can never complete a payment.
 */
export async function verifyStellarCctpBurn(input: {
  readonly rpc: Pick<rpc.Server, "getTransaction">;
  readonly txHash: string;
  readonly config: StellarCctpConfig;
  readonly intent: StellarCctpBurnIntent;
}): Promise<
  | { readonly status: "pending"; readonly txHash: string }
  | { readonly status: "failed" | "mismatch"; readonly txHash: string; readonly ledger: number | null }
  | { readonly status: "verified"; readonly txHash: string; readonly ledger: number; readonly amountRaw: bigint; readonly recipient: string }
> {
  const checked = validateStellarCctpConfig(input.config);
  const expected = prepareStellarCctpBurn(checked, input.intent);
  const txHash = input.txHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txHash)) {
    throw new StellarCctpError(
      "INVALID_TRANSACTION",
      "transaction hash must be 32-byte hexadecimal",
    );
  }
  const transaction: CctpFinalizedTransaction = await input.rpc.getTransaction(txHash);
  if (transaction.status === "NOT_FOUND") return { status: "pending", txHash };
  if (transaction.status !== "SUCCESS") {
    return { status: "failed", txHash, ledger: transaction.ledger ?? null };
  }
  const invoke = invokeFromEnvelope(transaction.envelopeXdr);
  const args = invoke?.args() ?? [];
  const targetArgs = args[2]?.switch().name === "scvVec" ? args[2].vec() ?? [] : [];
  const matches =
    invoke !== null &&
    Address.fromScAddress(invoke.contractAddress()).toString() === expected.smartAccount &&
    invoke.functionName().toString() === "execute" &&
    args.length === 3 &&
    scAddress(args[0]!) === checked.tokenMessenger &&
    scValToNative(args[1]!) === "deposit_for_burn" &&
    targetArgs.length === expected.targetArgs.length &&
    targetArgs.every((value, index) =>
      Buffer.from(value.toXDR()).equals(Buffer.from(expected.targetArgs[index]!.toXDR())),
    ) &&
    nativeBigint(targetArgs[1]!) === expected.amountRaw;
  if (!matches) {
    return { status: "mismatch", txHash, ledger: transaction.ledger };
  }
  return {
    status: "verified",
    txHash,
    ledger: transaction.ledger,
    amountRaw: expected.amountRaw,
    recipient: expected.recipient,
  };
}

/** Destination completion still requires exact finalized USDC transfer proof. */
export function verifyBaseToStellarDestination(input: {
  readonly rpc: StellarTransactionRpc;
  readonly txHash: string;
  readonly config: StellarCctpConfig;
  readonly expectedRecipient: string;
  readonly expectedAmount: DecimalAmount;
}): Promise<StellarUsdcVerification> {
  const checked = validateStellarCctpConfig(input.config);
  return verifyStellarUsdcTransfer({
    rpc: input.rpc,
    txHash: input.txHash,
    tokenContract: checked.usdcContract,
    expectedSender: checked.forwarder,
    expectedRecipient: input.expectedRecipient,
    expectedAmount: input.expectedAmount,
  });
}
