import type {
  DecimalAmount,
  Network,
  PaymentIntent,
  PaymentIntentInputMode,
} from "./contracts";

export interface ParsedUserIntent {
  readonly kind: "payment" | "balance_check" | "agent_pass_check" | "clarification" | "unknown";
  readonly originalInput: string;
  readonly inputMode: PaymentIntentInputMode;
  readonly amount?: DecimalAmount | undefined;
  readonly recipientInput?: string | undefined;
  readonly requestedSourceNetwork?: Network | undefined;
  readonly requestedDestinationNetwork?: Network | undefined;
  readonly clarificationQuestion?: string | undefined;
  readonly options?: readonly {
    readonly label: string;
    readonly sourceNetwork: Network;
    readonly destinationNetwork: Network;
    readonly railDescription: string;
  }[] | undefined;
}

/**
 * Deterministically parses natural language payment and query statements.
 * LLMs may suggest structured intent, but this deterministic parser validates
 * amounts, handles, networks, and ambiguity.
 */
export function parseNaturalLanguageIntent(
  input: string,
  inputMode: PaymentIntentInputMode = "text",
): ParsedUserIntent {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      kind: "unknown",
      originalInput: input,
      inputMode,
    };
  }

  const lower = trimmed.toLowerCase();

  // Balance query intent
  if (
    lower.includes("balance") ||
    lower.includes("how much") ||
    lower === "bal" ||
    lower.includes("check my wallet")
  ) {
    return {
      kind: "balance_check",
      originalInput: trimmed,
      inputMode,
    };
  }

  // Agent pass check intent
  if (
    lower.includes("agent pass") ||
    lower.includes("agent allowance") ||
    lower.includes("spending limit") ||
    lower.includes("my passes")
  ) {
    return {
      kind: "agent_pass_check",
      originalInput: trimmed,
      inputMode,
    };
  }

  // Keep the user's decimal text exactly; digits inside a handle or address
  // are never treated as the amount.
  const amountMatch = trimmed.match(/(?:^|[\s$])(\d+(?:\.\d{1,7})?)(?=$|[\s,.!?])/i);

  // Extract recipient: @handle, or words following "to ", or 0x..., or G...
  const handleMatch = trimmed.match(/@([a-zA-Z0-9_]{3,30})/);
  const toAddressMatch = trimmed.match(
    /\bto\s+([0-9a-zA-Z_]{3,56})\b/i,
  );

  let recipientInput: string | undefined;
  const handle = handleMatch?.[1];
  const raw = toAddressMatch?.[1];

  if (handle) {
    recipientInput = `@${handle.toLowerCase()}`;
  } else if (raw) {
    if (raw.startsWith("0x") || raw.startsWith("G") || raw.startsWith("C")) {
      recipientInput = raw;
    } else {
      recipientInput = `@${raw.toLowerCase()}`;
    }
  }

  // Extract explicit network instructions
  let requestedSourceNetwork: Network | undefined;
  let requestedDestinationNetwork: Network | undefined;

  if (/\b(?:from|on|via)\s+base\b/i.test(trimmed)) {
    requestedSourceNetwork = "base";
  } else if (/\b(?:from|on|via)\s+stellar\b/i.test(trimmed)) {
    requestedSourceNetwork = "stellar";
  }

  if (/\b(?:to|into)\s+base\b/i.test(trimmed)) {
    requestedDestinationNetwork = "base";
  } else if (/\b(?:to|into)\s+stellar\b/i.test(trimmed)) {
    requestedDestinationNetwork = "stellar";
  }

  const rawAmount = amountMatch ? amountMatch[1] : undefined;
  const amount = rawAmount && /[1-9]/.test(rawAmount) ? rawAmount : undefined;

  // Ambiguity checks
  if (amount && !recipientInput) {
    return {
      kind: "clarification",
      originalInput: trimmed,
      inputMode,
      amount,
      clarificationQuestion: `Who would you like to send ${amount} USDC to?`,
    };
  }

  if (recipientInput && !amount) {
    return {
      kind: "clarification",
      originalInput: trimmed,
      inputMode,
      recipientInput,
      clarificationQuestion: `How much USDC would you like to send to ${recipientInput}?`,
    };
  }

  if (amount && recipientInput) {
    return {
      kind: "payment",
      originalInput: trimmed,
      inputMode,
      amount,
      recipientInput,
      requestedSourceNetwork,
      requestedDestinationNetwork,
    };
  }

  return {
    kind: "unknown",
    originalInput: trimmed,
    inputMode,
  };
}
