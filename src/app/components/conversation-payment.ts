import { Networks, StrKey } from "@stellar/stellar-sdk";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
  CCTP_STELLAR_DOMAIN,
} from "../../base/evm";
import type { StellarCctpConfig } from "../../stellar/cctp";

export type VerifiedBalance = {
  readonly walletId: string;
  readonly network: "stellar" | "base";
  readonly address: string;
  readonly amount: string | null;
  readonly status: "verified" | "unavailable";
};

export type PaymentReview = {
  readonly id: string;
  readonly status: "awaiting_confirmation";
  readonly routeId: string;
  readonly sourceNetwork: "stellar" | "base";
  readonly destinationNetwork: "stellar" | "base";
  readonly rail: string;
  readonly recipientAddress: string;
  readonly expectedRecipientAmount: string;
  readonly fees: readonly {
    readonly kind: "network" | "provider" | "sponsor";
    readonly amount: string;
    readonly asset: string;
    readonly payer: "sender" | "recipient" | "sponsor";
    readonly label: string;
  }[];
  readonly reasons: readonly unknown[];
  readonly explanation: string;
};

export type PaymentExecutionResult =
  | {
      readonly status: "status_unknown";
      readonly transactionHash: null;
      readonly message: string;
    }
  | {
      readonly status: "unverified";
      readonly transactionHash: string;
      readonly message: string;
    }
  | {
      readonly status: "pending";
      readonly transactionHash: string;
      readonly message: string;
    }
  | {
      readonly status: "completed";
      readonly transactionHash: string;
      readonly verifiedRecipient: string;
      readonly verifiedAmount: string;
    }
  | {
      readonly status: "failed";
      readonly transactionHash: string | null;
      readonly message: string;
    };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function network(value: unknown): value is "stellar" | "base" {
  return value === "stellar" || value === "base";
}

function decimal(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(value);
}

function transactionHash(value: unknown): value is string {
  return typeof value === "string" && /^(?:0x)?[0-9a-f]{64}$/i.test(value);
}

function evmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value);
}

function equalDecimal(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

export function parseVerifiedBalances(value: unknown): readonly VerifiedBalance[] {
  const payload = record(value);
  if (!Array.isArray(payload?.balances)) return [];
  const parsed: VerifiedBalance[] = [];
  for (const item of payload.balances) {
    const balance = record(item);
    if (
      !balance ||
      typeof balance.walletId !== "string" ||
      typeof balance.address !== "string" ||
      !network(balance.network) ||
      (balance.status !== "verified" && balance.status !== "unavailable") ||
      !(balance.amount === null || decimal(balance.amount)) ||
      (balance.status === "verified" && balance.amount === null) ||
      (balance.status === "unavailable" && balance.amount !== null)
    ) return [];
    parsed.push({
      walletId: balance.walletId,
      network: balance.network,
      address: balance.address,
      amount: balance.amount,
      status: balance.status,
    });
  }
  return parsed;
}

/** Merge independently verified network snapshots without inventing a missing balance. */
export function mergeVerifiedBalanceSnapshots(
  ...snapshots: readonly (readonly VerifiedBalance[])[]
): readonly VerifiedBalance[] {
  const merged = new Map<string, VerifiedBalance>();
  for (const snapshot of snapshots) {
    for (const balance of snapshot) {
      merged.set(`${balance.network}:${balance.walletId}`, balance);
    }
  }
  return [...merged.values()];
}

/** Accept only the authenticated, owner-scoped identity lookup response. */
export function parseOwnedStellarIdentity(value: unknown): boolean {
  const payload = record(value);
  return payload?.found === true &&
    typeof payload.username === "string" &&
    payload.username.trim().length > 0;
}

export function parsePaymentReview(value: unknown): PaymentReview | null {
  const payload = record(value);
  const payment = record(payload?.payment);
  if (
    payload?.status !== "awaiting_confirmation" ||
    !payment ||
    payment.status !== "awaiting_confirmation" ||
    typeof payment.id !== "string" ||
    typeof payment.routeId !== "string" ||
    !network(payment.sourceNetwork) ||
    !network(payment.destinationNetwork) ||
    typeof payment.rail !== "string" ||
    typeof payment.recipientAddress !== "string" ||
    !decimal(payment.expectedRecipientAmount) ||
    typeof payload.explanation !== "string" ||
    !Array.isArray(payment.fees) ||
    !Array.isArray(payment.reasons)
  ) return null;
  const fees: Array<PaymentReview["fees"][number]> = [];
  for (const item of payment.fees) {
    const fee = record(item);
    if (
      !fee ||
      (fee.kind !== "network" && fee.kind !== "provider" && fee.kind !== "sponsor") ||
      !decimal(fee.amount) ||
      typeof fee.asset !== "string" ||
      (fee.payer !== "sender" && fee.payer !== "recipient" && fee.payer !== "sponsor") ||
      typeof fee.label !== "string"
    ) return null;
    fees.push({
      kind: fee.kind,
      amount: fee.amount,
      asset: fee.asset,
      payer: fee.payer,
      label: fee.label,
    });
  }
  return {
    id: payment.id,
    status: "awaiting_confirmation",
    routeId: payment.routeId,
    sourceNetwork: payment.sourceNetwork,
    destinationNetwork: payment.destinationNetwork,
    rail: payment.rail,
    recipientAddress: payment.recipientAddress,
    expectedRecipientAmount: payment.expectedRecipientAmount,
    fees,
    reasons: payment.reasons,
    explanation: payload.explanation,
  };
}

export function parseAuthorizationReady(value: unknown): {
  readonly relayerUrl: "/api/stellar/relayer/payment";
  readonly expiresAt: string;
} | null {
  const payload = record(value);
  if (
    payload?.status !== "authorization_ready" ||
    payload.relayerUrl !== "/api/stellar/relayer/payment" ||
    typeof payload.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(payload.expiresAt)) ||
    Date.parse(payload.expiresAt) <= Date.now()
  ) return null;
  return { relayerUrl: payload.relayerUrl, expiresAt: payload.expiresAt };
}

export function parseCctpAuthorizationReady(value: unknown): {
  readonly relayerUrl: "/api/stellar/relayer/payment";
  readonly expiresAt: string;
  readonly burnAmount: string;
  readonly maxFee: string;
} | null {
  const payload = record(value);
  const burn = record(payload?.burn);
  const base = parseAuthorizationReady(value);
  if (!base || !burn || !decimal(burn.burnAmount) || !decimal(burn.maxFee)) {
    return null;
  }
  return { ...base, burnAmount: burn.burnAmount, maxFee: burn.maxFee };
}

export function parseBaseDirectAuthorization(value: unknown): {
  readonly sender: string;
  readonly recipient: string;
  readonly amount: string;
} | null {
  const payload = record(value);
  const transaction = record(payload?.transaction);
  if (payload?.status !== "authorization_ready" || !transaction ||
      transaction.chainId !== BASE_SEPOLIA_CHAIN_ID ||
      typeof transaction.token !== "string" || transaction.token.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase() ||
      !evmAddress(transaction.sender) || !evmAddress(transaction.recipient) || !decimal(transaction.amount)) return null;
  return {
    sender: transaction.sender.toLowerCase(),
    recipient: transaction.recipient.toLowerCase(),
    amount: transaction.amount,
  };
}

export function parseBaseCctpAuthorization(value: unknown): {
  readonly sender: string;
  readonly burnAmount: string;
  readonly maxFee: string;
  readonly destinationDomain: 27;
  readonly mintRecipient: string;
} | null {
  const payload = record(value);
  const transaction = record(payload?.transaction);
  if (payload?.status !== "authorization_ready" || !transaction ||
      transaction.chainId !== BASE_SEPOLIA_CHAIN_ID ||
      typeof transaction.token !== "string" || transaction.token.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase() ||
      typeof transaction.tokenMessenger !== "string" || transaction.tokenMessenger.toLowerCase() !== BASE_SEPOLIA_TOKEN_MESSENGER.toLowerCase() ||
      !evmAddress(transaction.sender) || !decimal(transaction.burnAmount) || !decimal(transaction.maxFee) ||
      transaction.destinationDomain !== CCTP_STELLAR_DOMAIN ||
      typeof transaction.mintRecipient !== "string" || !/^0x[0-9a-f]{64}$/i.test(transaction.mintRecipient)) return null;
  return {
    sender: transaction.sender.toLowerCase(),
    burnAmount: transaction.burnAmount,
    maxFee: transaction.maxFee,
    destinationDomain: 27,
    mintRecipient: transaction.mintRecipient.toLowerCase(),
  };
}

export function parseStellarCctpConfig(value: unknown): StellarCctpConfig | null {
  const payload = record(value);
  const config = record(payload?.config);
  if (!config ||
      typeof config.rpcUrl !== "string" ||
      config.networkPassphrase !== Networks.TESTNET ||
      typeof config.usdcContract !== "string" || !StrKey.isValidContract(config.usdcContract) ||
      typeof config.tokenMessenger !== "string" || !StrKey.isValidContract(config.tokenMessenger) ||
      typeof config.messageTransmitter !== "string" || !StrKey.isValidContract(config.messageTransmitter) ||
      typeof config.forwarder !== "string" || !StrKey.isValidContract(config.forwarder) ||
      config.baseDomain !== 6 || config.stellarDomain !== 27) return null;
  let rpcUrl: URL;
  try {
    rpcUrl = new URL(config.rpcUrl);
  } catch {
    return null;
  }
  if (rpcUrl.protocol !== "https:" || rpcUrl.username || rpcUrl.password) return null;
  return {
    rpcUrl: rpcUrl.toString(),
    networkPassphrase: Networks.TESTNET,
    usdcContract: config.usdcContract,
    tokenMessenger: config.tokenMessenger,
    messageTransmitter: config.messageTransmitter,
    forwarder: config.forwarder,
    baseDomain: 6,
    stellarDomain: 27,
  };
}

export function parseReconciliation(value: unknown):
  | { readonly status: "pending" | "completed"; readonly transactionHash: string }
  | { readonly status: "failed"; readonly transactionHash: string; readonly reason: string }
  | null {
  const payload = record(value);
  if (!transactionHash(payload?.transactionHash)) return null;
  if (payload.status === "pending" || payload.status === "completed") {
    return { status: payload.status, transactionHash: payload.transactionHash };
  }
  if (payload.status === "failed" && typeof payload.reason === "string") {
    return { status: "failed", transactionHash: payload.transactionHash, reason: payload.reason };
  }
  return null;
}

export function parseCctpReconciliation(value: unknown):
  | { readonly status: "pending" | "in_progress"; readonly sourceTransactionHash: string }
  | { readonly status: "completed"; readonly destinationTransactionHash: string }
  | null {
  const payload = record(value);
  if ((payload?.status === "pending" || payload?.status === "in_progress") &&
      transactionHash(payload.sourceTransactionHash)) {
    return {
      status: payload.status,
      sourceTransactionHash: payload.sourceTransactionHash.replace(/^0x/i, "").toLowerCase(),
    };
  }
  if (payload?.status === "completed" &&
      typeof payload.destinationTransactionHash === "string" &&
      /^0x[0-9a-f]{64}$/i.test(payload.destinationTransactionHash)) {
    return {
      status: "completed",
      destinationTransactionHash: payload.destinationTransactionHash.toLowerCase(),
    };
  }
  return null;
}

export function parseBaseToStellarReconciliation(value: unknown):
  | { readonly status: "pending" | "in_progress"; readonly sourceTransactionHash: string }
  | { readonly status: "completed"; readonly destinationTransactionHash: string }
  | null {
  const payload = record(value);
  if ((payload?.status === "pending" || payload?.status === "in_progress") &&
      typeof payload.sourceTransactionHash === "string" && /^0x[0-9a-f]{64}$/i.test(payload.sourceTransactionHash)) {
    return { status: payload.status, sourceTransactionHash: payload.sourceTransactionHash.toLowerCase() };
  }
  if (payload?.status === "completed" &&
      typeof payload.destinationTransactionHash === "string" && /^[0-9a-f]{64}$/i.test(payload.destinationTransactionHash)) {
    return { status: "completed", destinationTransactionHash: payload.destinationTransactionHash.toLowerCase() };
  }
  return null;
}

export function parsePersistedPaymentHashes(value: unknown, paymentId: string): {
  readonly sourceTransactionHash?: string;
  readonly destinationTransactionHash?: string;
} | null {
  const payload = record(value);
  const payment = record(payload?.payment);
  if (!payment || payment.id !== paymentId) return null;
  const source = transactionHash(payment.sourceTransactionHash)
    ? payment.sourceTransactionHash.toLowerCase()
    : undefined;
  const destination = transactionHash(payment.destinationTransactionHash)
    ? payment.destinationTransactionHash.toLowerCase()
    : undefined;
  return {
    ...(source ? { sourceTransactionHash: source } : {}),
    ...(destination ? { destinationTransactionHash: destination } : {}),
  };
}

/** A completed UI state requires canonical persisted recipient, amount, and hash evidence. */
export function parseCompletedPaymentReceipt(
  value: unknown,
  review: PaymentReview,
  expectedTransactionHash: string,
): PaymentExecutionResult | null {
  const payload = record(value);
  const payment = record(payload?.payment);
  const events = Array.isArray(payment?.events) ? payment.events : [];
  const hasEvent = (stage: string, status: string) => events.some((value) => {
    const event = record(value);
    return event?.stage === stage && event.status === status &&
      event.txHash === expectedTransactionHash;
  });
  if (
    !payment ||
    payment.id !== review.id ||
    payment.status !== "completed" ||
    typeof payment.recipientAddress !== "string" ||
    typeof payment.verifiedRecipientAddress !== "string" ||
    (review.destinationNetwork === "base"
      ? payment.recipientAddress.toLowerCase() !== review.recipientAddress.toLowerCase() ||
        payment.verifiedRecipientAddress.toLowerCase() !== review.recipientAddress.toLowerCase()
      : payment.recipientAddress !== review.recipientAddress ||
        payment.verifiedRecipientAddress !== review.recipientAddress) ||
    !decimal(payment.expectedRecipientAmount) ||
    !decimal(payment.verifiedRecipientAmount) ||
    !equalDecimal(payment.expectedRecipientAmount, review.expectedRecipientAmount) ||
    !equalDecimal(payment.verifiedRecipientAmount, review.expectedRecipientAmount) ||
    payment.destinationTransactionHash !== expectedTransactionHash ||
    !transactionHash(payment.destinationTransactionHash) ||
    !hasEvent("recipient_verification", "recipient_verified") ||
    !hasEvent("completion", "completed")
  ) return null;
  return {
    status: "completed",
    transactionHash: payment.destinationTransactionHash,
    verifiedRecipient: payment.verifiedRecipientAddress,
    verifiedAmount: payment.verifiedRecipientAmount,
  };
}

export function apiMessage(value: unknown, fallback: string): string {
  const payload = record(value);
  if (typeof payload?.question === "string" && payload.question.trim()) return payload.question;
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  const message = record(payload?.message);
  if (typeof message?.content === "string" && message.content.trim()) return message.content;
  return fallback;
}
