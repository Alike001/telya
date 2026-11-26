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

export function apiMessage(value: unknown, fallback: string): string {
  const payload = record(value);
  if (typeof payload?.question === "string" && payload.question.trim()) return payload.question;
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  const message = record(payload?.message);
  if (typeof message?.content === "string" && message.content.trim()) return message.content;
  return fallback;
}
