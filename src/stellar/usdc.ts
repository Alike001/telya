import { Buffer } from "node:buffer";

import {
  tokenAmountToRawUnits,
  type TransactionResult,
} from "smart-account-kit";
import {
  StrKey,
  scValToNative,
  type rpc,
  type xdr,
} from "@stellar/stellar-sdk";

import type { DecimalAmount } from "../domain/contracts.ts";

export const STELLAR_USDC_DECIMALS = 7;

export interface StellarUsdcTransferKit {
  transfer(
    tokenContract: string,
    recipient: string,
    amount: number,
    options: { forceMethod: "relayer" },
  ): Promise<TransactionResult>;
}

export type StellarUsdcSubmission =
  | {
      readonly status: "submitted";
      readonly txHash: string;
      readonly ledger: number | null;
      readonly recipient: string;
      readonly amount: DecimalAmount;
    }
  | {
      readonly status: "failed";
      readonly errorCode: string;
      readonly message: string;
      readonly txHash: string | null;
    };

export type StellarUsdcVerification =
  | {
      readonly status: "pending";
      readonly txHash: string;
    }
  | {
      readonly status: "failed";
      readonly txHash: string;
      readonly ledger: number;
      readonly reason: "transaction_failed";
    }
  | {
      readonly status: "mismatch";
      readonly txHash: string;
      readonly ledger: number;
      readonly reason:
        | "transfer_event_missing"
        | "recipient_mismatch"
        | "amount_mismatch";
      readonly actualRecipient: string | null;
      readonly actualAmount: DecimalAmount | null;
    }
  | {
      readonly status: "verified";
      readonly txHash: string;
      readonly ledger: number;
      readonly sender: string;
      readonly recipient: string;
      readonly amount: DecimalAmount;
    };

export class StellarUsdcValidationError extends Error {
  readonly code: "INVALID_AMOUNT" | "INVALID_ADDRESS" | "INVALID_TX_HASH";

  constructor(
    code: StellarUsdcValidationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StellarUsdcValidationError";
    this.code = code;
  }
}

interface NormalizedUsdcAmount {
  readonly decimal: DecimalAmount;
  readonly number: number;
  readonly raw: bigint;
}

function isStellarAccountOrContract(address: string): boolean {
  return (
    StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address)
  );
}

function requireContractAddress(address: string, label: string): string {
  const normalized = address.trim();
  if (!StrKey.isValidContract(normalized)) {
    throw new StellarUsdcValidationError(
      "INVALID_ADDRESS",
      `${label} must be a valid Stellar contract address`,
    );
  }
  return normalized;
}

function requireRecipientAddress(address: string): string {
  const normalized = address.trim();
  if (!isStellarAccountOrContract(normalized)) {
    throw new StellarUsdcValidationError(
      "INVALID_ADDRESS",
      "recipient must be a valid Stellar account or contract address",
    );
  }
  return normalized;
}

function requireTransactionHash(txHash: string): string {
  const normalized = txHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new StellarUsdcValidationError(
      "INVALID_TX_HASH",
      "transaction hash must be 32-byte hexadecimal",
    );
  }
  return normalized;
}

export function normalizeStellarUsdcAmount(
  amount: DecimalAmount,
): NormalizedUsdcAmount {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) {
    throw new StellarUsdcValidationError(
      "INVALID_AMOUNT",
      "USDC amount must be a positive base-10 decimal string",
    );
  }

  const whole = (match[1] ?? "0").replace(/^0+(?=\d)/, "");
  const suppliedFraction = match[2] ?? "";
  const meaningfulFraction = suppliedFraction.replace(/0+$/, "");

  if (meaningfulFraction.length > STELLAR_USDC_DECIMALS) {
    throw new StellarUsdcValidationError(
      "INVALID_AMOUNT",
      `Stellar USDC supports at most ${STELLAR_USDC_DECIMALS} decimal places`,
    );
  }

  const fraction = meaningfulFraction.padEnd(STELLAR_USDC_DECIMALS, "0");
  const raw =
    BigInt(whole) * 10n ** BigInt(STELLAR_USDC_DECIMALS) +
    BigInt(fraction || "0");

  if (raw <= 0n || raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StellarUsdcValidationError(
      "INVALID_AMOUNT",
      "USDC amount must be positive and within safe transaction precision",
    );
  }

  const decimal = meaningfulFraction
    ? `${whole}.${meaningfulFraction}`
    : whole;
  const numericAmount = Number(decimal);

  if (
    !Number.isFinite(numericAmount) ||
    tokenAmountToRawUnits(numericAmount, STELLAR_USDC_DECIMALS) !== raw
  ) {
    throw new StellarUsdcValidationError(
      "INVALID_AMOUNT",
      "USDC amount cannot be represented exactly by Smart Account Kit",
    );
  }

  return { decimal, number: numericAmount, raw };
}

export async function submitStellarUsdcTransfer(input: {
  readonly kit: StellarUsdcTransferKit;
  readonly tokenContract: string;
  readonly recipient: string;
  readonly amount: DecimalAmount;
}): Promise<StellarUsdcSubmission> {
  const tokenContract = requireContractAddress(
    input.tokenContract,
    "tokenContract",
  );
  const recipient = requireRecipientAddress(input.recipient);
  const amount = normalizeStellarUsdcAmount(input.amount);

  const result = await input.kit.transfer(
    tokenContract,
    recipient,
    amount.number,
    { forceMethod: "relayer" },
  );

  if (!result.success) {
    return {
      status: "failed",
      errorCode: String(result.error.code),
      message: result.error.message,
      txHash: result.hash ?? null,
    };
  }

  return {
    status: "submitted",
    txHash: result.hash,
    ledger: result.ledger ?? null,
    recipient,
    amount: amount.decimal,
  };
}

type FinalizedTransaction =
  | {
      readonly status: "NOT_FOUND";
    }
  | {
      readonly status: "FAILED";
      readonly ledger: number;
    }
  | {
      readonly status: "SUCCESS";
      readonly ledger: number;
      readonly events: {
        readonly contractEventsXdr: readonly (readonly xdr.ContractEvent[])[];
      };
    };

export interface StellarTransactionRpc {
  getTransaction(txHash: string): Promise<FinalizedTransaction>;
}

interface DecodedTransferEvent {
  readonly sender: string;
  readonly recipient: string;
  readonly amountRaw: bigint;
}

function amountFromEventData(data: xdr.ScVal): bigint | null {
  const native = scValToNative(data) as unknown;

  if (typeof native === "bigint") return native;
  if (typeof native === "number" && Number.isSafeInteger(native)) {
    return BigInt(native);
  }

  if (native instanceof Map) {
    const amount = native.get("amount") as unknown;
    if (typeof amount === "bigint") return amount;
    if (typeof amount === "number" && Number.isSafeInteger(amount)) {
      return BigInt(amount);
    }
  }

  if (typeof native === "object" && native !== null && "amount" in native) {
    const amount = (native as { amount: unknown }).amount;
    if (typeof amount === "bigint") return amount;
    if (typeof amount === "number" && Number.isSafeInteger(amount)) {
      return BigInt(amount);
    }
  }

  return null;
}

function decodeTransferEvent(
  event: xdr.ContractEvent,
  tokenContract: string,
): DecodedTransferEvent | null {
  try {
    const contractId = event.contractId();
    if (
      !contractId ||
      StrKey.encodeContract(
        Buffer.from(contractId as unknown as Uint8Array),
      ) !== tokenContract
    ) {
      return null;
    }

    const body = event.body().v0();
    const topics = body.topics();
    if (topics.length < 3 || scValToNative(topics[0]!) !== "transfer") {
      return null;
    }

    const sender = scValToNative(topics[1]!) as unknown;
    const recipient = scValToNative(topics[2]!) as unknown;
    const amountRaw = amountFromEventData(body.data());

    if (
      typeof sender !== "string" ||
      typeof recipient !== "string" ||
      amountRaw === null
    ) {
      return null;
    }

    return { sender, recipient, amountRaw };
  } catch {
    return null;
  }
}

export function stellarUsdcAmountFromRawUnits(amount: bigint): DecimalAmount {
  const scale = 10n ** BigInt(STELLAR_USDC_DECIMALS);
  const whole = amount / scale;
  const fraction = (amount % scale)
    .toString()
    .padStart(STELLAR_USDC_DECIMALS, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Verifies finality and the exact transfer event. A successful transaction is
 * not enough: token contract, sender, recipient, and raw amount must all match.
 */
export async function verifyStellarUsdcTransfer(input: {
  readonly rpc: StellarTransactionRpc;
  readonly txHash: string;
  readonly tokenContract: string;
  readonly expectedSender: string;
  readonly expectedRecipient: string;
  readonly expectedAmount: DecimalAmount;
}): Promise<StellarUsdcVerification> {
  const txHash = requireTransactionHash(input.txHash);
  const tokenContract = requireContractAddress(
    input.tokenContract,
    "tokenContract",
  );
  const expectedSender = requireContractAddress(
    input.expectedSender,
    "expectedSender",
  );
  const expectedRecipient = requireRecipientAddress(input.expectedRecipient);
  const expectedAmount = normalizeStellarUsdcAmount(input.expectedAmount);
  const transaction = await input.rpc.getTransaction(txHash);

  if (transaction.status === "NOT_FOUND") {
    return { status: "pending", txHash };
  }

  if (transaction.status === "FAILED") {
    return {
      status: "failed",
      txHash,
      ledger: transaction.ledger,
      reason: "transaction_failed",
    };
  }

  const transfers = transaction.events.contractEventsXdr
    .flat()
    .map((event) => decodeTransferEvent(event, tokenContract))
    .filter((event): event is DecodedTransferEvent => event !== null)
    .filter((event) => event.sender === expectedSender);

  const exactTransfer = transfers.find(
    (event) =>
      event.recipient === expectedRecipient &&
      event.amountRaw === expectedAmount.raw,
  );

  if (exactTransfer) {
    return {
      status: "verified",
      txHash,
      ledger: transaction.ledger,
      sender: exactTransfer.sender,
      recipient: exactTransfer.recipient,
      amount: stellarUsdcAmountFromRawUnits(exactTransfer.amountRaw),
    };
  }

  const recipientTransfer = transfers.find(
    (event) => event.recipient === expectedRecipient,
  );

  if (!recipientTransfer) {
    const actual = transfers[0] ?? null;
    return {
      status: "mismatch",
      txHash,
      ledger: transaction.ledger,
      reason: actual ? "recipient_mismatch" : "transfer_event_missing",
      actualRecipient: actual?.recipient ?? null,
      actualAmount: actual ? stellarUsdcAmountFromRawUnits(actual.amountRaw) : null,
    };
  }

  return {
    status: "mismatch",
    txHash,
    ledger: transaction.ledger,
    reason: "amount_mismatch",
    actualRecipient: recipientTransfer.recipient,
    actualAmount: stellarUsdcAmountFromRawUnits(recipientTransfer.amountRaw),
  };
}

/** Compile-time guard that the real Stellar RPC server satisfies our adapter. */
export type StellarRpcServer = Pick<rpc.Server, "getTransaction">;

