import {
  parseNaturalLanguageIntent,
  type ParsedUserIntent,
} from "../../domain/intent-parser";
import type { Network, PaymentIntentInputMode } from "../../domain/contracts";

type IntentRequest = (input: string, init: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function network(value: unknown): Network | undefined | null {
  if (value === null) return null;
  if (value === "stellar" || value === "base") return value;
  return undefined;
}

/**
 * Treats AI output as an untrusted intent draft. Wallet resolution, routing,
 * balances, fees, authorization and execution remain deterministic server work.
 */
export function parseAiPaymentIntent(
  value: unknown,
  originalInput: string,
  inputMode: PaymentIntentInputMode,
): ParsedUserIntent | null {
  const payload = record(value);
  const intent = record(payload?.intent);
  if (payload?.status !== "parsed" || !intent || intent.action !== "send" || intent.asset !== "USDC") {
    return null;
  }
  const source = network(intent.requestedSourceNetwork);
  const destination = network(intent.requestedDestinationNetwork);
  if (
    typeof intent.amount !== "string" ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(intent.amount) ||
    !/[1-9]/.test(intent.amount) ||
    typeof intent.recipientInput !== "string" ||
    !intent.recipientInput.trim() ||
    intent.recipientInput.length > 128 ||
    source === undefined ||
    destination === undefined
  ) return null;

  return {
    kind: "payment",
    originalInput,
    inputMode,
    amount: intent.amount,
    recipientInput: intent.recipientInput.trim(),
    ...(source ? { requestedSourceNetwork: source } : {}),
    ...(destination ? { requestedDestinationNetwork: destination } : {}),
  };
}

/** Uses authenticated AI parsing when available and always fails back to text parsing. */
export async function resolveConversationIntent(
  input: string,
  inputMode: PaymentIntentInputMode,
  request: IntentRequest,
): Promise<ParsedUserIntent> {
  const manual = parseNaturalLanguageIntent(input, inputMode);
  if (manual.kind === "balance_check" || manual.kind === "agent_pass_check") return manual;

  try {
    const response = await request("/api/intent", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: input }),
    });
    if (!response.ok) return manual;
    const parsed = parseAiPaymentIntent(await response.json(), input.trim(), inputMode);
    return parsed ?? manual;
  } catch {
    return manual;
  }
}
