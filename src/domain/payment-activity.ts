import type { Fee, Network, PaymentRoute, PaymentStatus, TransactionReference } from "./contracts";

export type PersistedPaymentEvent = {
  readonly id: string;
  readonly paymentId: string;
  readonly recordStage: string;
  readonly stage: PaymentStatus;
  readonly network: Network | null;
  readonly txHash: string | null;
  readonly explorerUrl: string | null;
  readonly publicMessage: string;
  readonly errorCode: string | null;
  readonly occurredAt: string;
  readonly completedAt: string | null;
};

export type PersistedPayment = {
  readonly id: string;
  readonly status: PaymentStatus;
  readonly route: PaymentRoute;
  readonly recipientAddress: string;
  readonly expectedAmount: string;
  readonly verifiedRecipient: string | null;
  readonly verifiedAmount: string | null;
  readonly asset: "USDC";
  readonly fees: readonly Fee[];
  readonly sourceTransaction: TransactionReference | null;
  readonly destinationTransaction: TransactionReference | null;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly events: readonly PersistedPaymentEvent[];
};

export type PaymentActivityPage = {
  readonly payments: readonly PersistedPayment[];
  readonly nextCursor: string | null;
};

const paymentStatuses = new Set<PaymentStatus>([
  "created", "route_resolved", "awaiting_confirmation", "authorized", "submitted",
  "source_confirmed", "awaiting_attestation", "destination_submitted",
  "destination_confirmed", "recipient_verified", "completed", "failed",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function decimal(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,37})(?:\.\d{1,18})?$/.test(value);
}

function equalDecimal(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

function equalAddress(network: Network, left: string, right: string): boolean {
  return network === "base" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function transactionHash(value: unknown, network: Network): value is string {
  if (typeof value !== "string") return false;
  return network === "stellar"
    ? /^[0-9a-f]{64}$/i.test(value)
    : /^0x[0-9a-f]{64}$/i.test(value);
}

function explorerUrl(network: Network, hash: string): string {
  return network === "stellar"
    ? `https://stellar.expert/explorer/testnet/tx/${hash}`
    : `https://sepolia.basescan.org/tx/${hash}`;
}

function parseRoute(value: Record<string, unknown>): PaymentRoute | null {
  const source = value.sourceNetwork;
  const destination = value.destinationNetwork;
  const rail = value.rail;
  const routeId = value.routeId;
  if (source === "stellar" && destination === "stellar" && rail === "stellar_direct" && routeId === "stellar_to_stellar") {
    return { id: "stellar_to_stellar", sourceNetwork: "stellar", destinationNetwork: "stellar", rail: "stellar_usdc" };
  }
  if (source === "base" && destination === "base" && rail === "base_direct" && routeId === "base_to_base") {
    return { id: "base_to_base", sourceNetwork: "base", destinationNetwork: "base", rail: "base_usdc" };
  }
  if (source === "base" && destination === "stellar" && rail === "circle_cctp_standard" && (routeId === "base_to_stellar" || routeId === "base_to_stellar_cctp")) {
    return { id: "base_to_stellar_cctp", sourceNetwork: "base", destinationNetwork: "stellar", rail: "circle_cctp_standard" };
  }
  if (source === "stellar" && destination === "base" && rail === "circle_cctp_standard" && (routeId === "stellar_to_base" || routeId === "stellar_to_base_cctp")) {
    return { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" };
  }
  return null;
}

function parseFees(value: unknown): readonly Fee[] | null {
  if (!Array.isArray(value)) return null;
  const fees: Fee[] = [];
  for (const item of value) {
    const fee = record(item);
    if (
      !fee ||
      (fee.kind !== "network" && fee.kind !== "provider" && fee.kind !== "sponsor") ||
      !decimal(fee.amount) ||
      typeof fee.asset !== "string" ||
      (fee.payer !== "sender" && fee.payer !== "recipient" && fee.payer !== "sponsor") ||
      typeof fee.label !== "string"
    ) return null;
    fees.push({ kind: fee.kind, amount: fee.amount, asset: fee.asset, payer: fee.payer, label: fee.label });
  }
  return fees;
}

function parseEvents(value: unknown, paymentId: string): readonly PersistedPaymentEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events: PersistedPaymentEvent[] = [];
  for (const item of value) {
    const event = record(item);
    if (
      !event || !uuid(event.id) ||
      typeof event.stage !== "string" ||
      typeof event.status !== "string" || !paymentStatuses.has(event.status as PaymentStatus) ||
      !(event.network === null || event.network === "stellar" || event.network === "base") ||
      typeof event.publicMessage !== "string" ||
      !(event.errorCode === null || typeof event.errorCode === "string") ||
      !timestamp(event.occurredAt) ||
      !(event.completedAt === null || timestamp(event.completedAt))
    ) return null;
    if (event.txHash !== null && (event.network === null || !transactionHash(event.txHash, event.network))) return null;
    events.push({
      id: event.id,
      paymentId,
      recordStage: event.stage,
      stage: event.status as PaymentStatus,
      network: event.network,
      txHash: event.txHash as string | null,
      explorerUrl: event.txHash && event.network ? explorerUrl(event.network, event.txHash as string) : null,
      publicMessage: event.publicMessage,
      errorCode: event.errorCode as string | null,
      occurredAt: event.occurredAt,
      completedAt: event.completedAt as string | null,
    });
  }
  return events;
}

function lastMatching(
  events: readonly PersistedPaymentEvent[],
  predicate: (event: PersistedPaymentEvent) => boolean,
): PersistedPaymentEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && predicate(event)) return event;
  }
  return undefined;
}

export function parsePersistedPayment(value: unknown, requireEvents = false): PersistedPayment | null {
  const payment = record(value);
  if (!payment || !uuid(payment.id) || typeof payment.status !== "string" || !paymentStatuses.has(payment.status as PaymentStatus)) return null;
  const route = parseRoute(payment);
  const fees = parseFees(payment.fees);
  if (
    !route || !fees || typeof payment.recipientAddress !== "string" || !payment.recipientAddress ||
    !decimal(payment.expectedRecipientAmount) ||
    !(payment.verifiedRecipientAddress === null || typeof payment.verifiedRecipientAddress === "string") ||
    !(payment.verifiedRecipientAmount === null || decimal(payment.verifiedRecipientAmount)) ||
    !(payment.failureCode === null || typeof payment.failureCode === "string") ||
    !timestamp(payment.createdAt) || !timestamp(payment.updatedAt)
  ) return null;

  const events = parseEvents(payment.events ?? [], payment.id);
  if (!events || (requireEvents && !Array.isArray(payment.events))) return null;
  // Earlier Base→Stellar settlement persisted the correct 32-byte source hash
  // without the Base 0x prefix. Normalize only that exact legacy shape for
  // receipt recovery; malformed or cross-network hashes still fail closed.
  const sourceHash = route.sourceNetwork === "base" &&
    typeof payment.sourceTransactionHash === "string" &&
    /^[0-9a-f]{64}$/i.test(payment.sourceTransactionHash)
      ? `0x${payment.sourceTransactionHash}`
      : payment.sourceTransactionHash;
  const destinationHash = payment.destinationTransactionHash;
  if (sourceHash !== null && !transactionHash(sourceHash, route.sourceNetwork)) return null;
  if (destinationHash !== null && !transactionHash(destinationHash, route.destinationNetwork)) return null;

  const completion = lastMatching(events, (event) => event.stage === "completed" && event.txHash === destinationHash);
  const recipientVerification = lastMatching(events, (event) => event.stage === "recipient_verified" && event.txHash === destinationHash);
  if (payment.status === "completed" && (
    typeof payment.verifiedRecipientAddress !== "string" ||
    !decimal(payment.verifiedRecipientAmount) ||
    !equalAddress(route.destinationNetwork, payment.verifiedRecipientAddress, payment.recipientAddress) ||
    !equalDecimal(payment.verifiedRecipientAmount, payment.expectedRecipientAmount) ||
    destinationHash === null ||
    (requireEvents && (!completion || !recipientVerification))
  )) return null;

  return {
    id: payment.id,
    status: payment.status as PaymentStatus,
    route,
    recipientAddress: payment.recipientAddress,
    expectedAmount: payment.expectedRecipientAmount,
    verifiedRecipient: payment.verifiedRecipientAddress as string | null,
    verifiedAmount: payment.verifiedRecipientAmount as string | null,
    asset: "USDC",
    fees,
    sourceTransaction: sourceHash === null ? null : {
      network: route.sourceNetwork,
      txHash: sourceHash as string,
      explorerUrl: explorerUrl(route.sourceNetwork, sourceHash as string),
    },
    destinationTransaction: destinationHash === null ? null : {
      network: route.destinationNetwork,
      txHash: destinationHash as string,
      explorerUrl: explorerUrl(route.destinationNetwork, destinationHash as string),
    },
    failureCode: payment.failureCode as string | null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    completedAt: completion?.completedAt ?? completion?.occurredAt ?? null,
    events,
  };
}

export function parsePaymentActivityPage(value: unknown): PaymentActivityPage | null {
  const payload = record(value);
  if (!payload || !Array.isArray(payload.payments) || !(payload.nextCursor === null || uuid(payload.nextCursor))) return null;
  const payments = payload.payments.map((payment) => parsePersistedPayment(payment));
  if (payments.some((payment) => payment === null)) return null;
  return { payments: payments as PersistedPayment[], nextCursor: payload.nextCursor as string | null };
}

export function parsePaymentActivityDetail(value: unknown): PersistedPayment | null {
  const payload = record(value);
  return parsePersistedPayment(payload?.payment, true);
}
