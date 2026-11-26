import type {
  DecimalAmount,
  Fee,
  Network,
  PaymentIntent,
  PaymentIntentInputMode,
  PaymentRoute,
  RouteDecision,
} from "./contracts";

export interface ParsedUserIntent {
  readonly kind:
    | "payment"
    | "balance_check"
    | "agent_pass_check"
    | "activity_check"
    | "clarification"
    | "unknown";
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

export interface UserBalances {
  readonly stellarUsdc: DecimalAmount;
  readonly baseUsdc: DecimalAmount;
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

  // Activity / timeline query intent
  if (
    lower.includes("activity") ||
    lower.includes("history") ||
    lower.includes("where is my money") ||
    lower.includes("transactions") ||
    lower.includes("my payments") ||
    lower.includes("past payments")
  ) {
    return {
      kind: "activity_check",
      originalInput: trimmed,
      inputMode,
    };
  }

  // Extract amount: e.g. "$5", "5 USDC", "5.50", "10 dollars"
  const amountMatch =
    trimmed.match(/(?:\$|usd|usdc\s*)?(\d+(?:\.\d{1,6})?)(?:\s*(?:usdc|usd|dollars))?/i) ??
    trimmed.match(/(\d+(?:\.\d{1,6})?)/);

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
  const amount = rawAmount && Number(rawAmount) > 0 ? Number(rawAmount).toFixed(2) : undefined;

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

/**
 * Resolves a concrete payment route and fee structure deterministically.
 * If source or destination network is ambiguous, requires explicit user selection.
 */
export function resolvePaymentRouteDecision(params: {
  readonly paymentIntentId: string;
  readonly amount: DecimalAmount;
  readonly recipientInput: string;
  readonly requestedSourceNetwork?: Network | undefined;
  readonly requestedDestinationNetwork?: Network | undefined;
  readonly userBalances: UserBalances;
}): RouteDecision {
  const {
    paymentIntentId,
    amount,
    recipientInput,
    requestedSourceNetwork,
    requestedDestinationNetwork,
    userBalances,
  } = params;

  const decidedAt = new Date().toISOString();
  const numAmount = Number(amount);
  const stellarBal = Number(userBalances.stellarUsdc);
  const baseBal = Number(userBalances.baseUsdc);

  // If source network was explicitly requested by user
  let sourceNetwork: Network | null = requestedSourceNetwork ?? null;

  // Check if balance on any network is sufficient
  if (numAmount > stellarBal && numAmount > baseBal) {
    return {
      id: `route_${Date.now()}`,
      paymentIntentId,
      sourceWalletId: null,
      destinationAddress: null,
      status: "unavailable",
      route: null,
      recipient: { kind: "username", username: recipientInput.replace(/^@/, "") },
      requestedSourceNetwork: sourceNetwork,
      requestedDestinationNetwork: requestedDestinationNetwork ?? null,
      reasonCode: "only_sufficient_balance",
      explanation: `Insufficient funds: Transfer amount of ${amount} USDC exceeds your available balance ($${(stellarBal + baseBal).toFixed(2)} USDC).`,
      unavailabilityReason: `Insufficient funds: Transfer amount of ${amount} USDC exceeds your available balance ($${(stellarBal + baseBal).toFixed(2)} USDC).`,
      fees: [],
      decidedAt,
    };
  }

  // If not explicitly requested, infer from sufficient balance
  if (!sourceNetwork) {
    if (stellarBal >= numAmount && baseBal < numAmount) {
      sourceNetwork = "stellar";
    } else if (baseBal >= numAmount && stellarBal < numAmount) {
      sourceNetwork = "base";
    } else if (stellarBal >= numAmount && baseBal >= numAmount) {
      // User has enough on BOTH networks! Non-negotiable invariant: NEVER guess.
      return {
        id: `route_${Date.now()}`,
        paymentIntentId,
        sourceWalletId: null,
        destinationAddress: null,
        status: "needs_clarification",
        route: null,
        recipient: { kind: "username", username: recipientInput.replace(/^@/, "") },
        requestedSourceNetwork: null,
        requestedDestinationNetwork: requestedDestinationNetwork ?? null,
        reasonCode: "ambiguous_requires_clarification",
        explanation:
          "You have sufficient USDC balances on both Stellar and Base. Please select your preferred source wallet.",
        clarificationQuestion:
          "Which wallet would you like to send the funds from?",
        fees: [],
        decidedAt,
      };
    }
  }

  // If source was explicitly selected, verify its balance
  if (sourceNetwork === "stellar" && numAmount > stellarBal) {
    return {
      id: `route_${Date.now()}`,
      paymentIntentId,
      sourceWalletId: "wallet_stellar",
      destinationAddress: null,
      status: "unavailable",
      route: null,
      recipient: { kind: "username", username: recipientInput.replace(/^@/, "") },
      requestedSourceNetwork: "stellar",
      requestedDestinationNetwork: requestedDestinationNetwork ?? null,
      reasonCode: "only_sufficient_balance",
      explanation: `Insufficient Stellar balance: Requested ${amount} USDC, but your Stellar balance is $${stellarBal.toFixed(2)} USDC.`,
      unavailabilityReason: `Insufficient Stellar balance: Requested ${amount} USDC, but your Stellar balance is $${stellarBal.toFixed(2)} USDC.`,
      fees: [],
      decidedAt,
    };
  }

  if (sourceNetwork === "base" && numAmount > baseBal) {
    return {
      id: `route_${Date.now()}`,
      paymentIntentId,
      sourceWalletId: "wallet_base",
      destinationAddress: null,
      status: "unavailable",
      route: null,
      recipient: { kind: "username", username: recipientInput.replace(/^@/, "") },
      requestedSourceNetwork: "base",
      requestedDestinationNetwork: requestedDestinationNetwork ?? null,
      reasonCode: "only_sufficient_balance",
      explanation: `Insufficient Base balance: Requested ${amount} USDC, but your Base balance is $${baseBal.toFixed(2)} USDC.`,
      unavailabilityReason: `Insufficient Base balance: Requested ${amount} USDC, but your Base balance is $${baseBal.toFixed(2)} USDC.`,
      fees: [],
      decidedAt,
    };
  }

  // Recipient destination network: default to Stellar for handles unless specified
  const destNetwork: Network =
    requestedDestinationNetwork ??
    (recipientInput.startsWith("0x") ? "base" : "stellar");

  // Determine route and fees
  let route: PaymentRoute;
  let explanation: string;
  let fees: Fee[];

  if (sourceNetwork === "stellar" && destNetwork === "stellar") {
    route = {
      id: "stellar_to_stellar",
      sourceNetwork: "stellar",
      destinationNetwork: "stellar",
      rail: "stellar_usdc",
    };
    explanation =
      `Direct Stellar transfer: Recipient ${recipientInput} is on Stellar. Route is instant and network fees are sponsored by Telya.`;
    fees = [
      {
        kind: "sponsor",
        amount: "0.00",
        asset: "USDC",
        payer: "sponsor",
        label: "Sponsored Network Fee",
      },
    ];
  } else if (sourceNetwork === "base" && destNetwork === "stellar") {
    route = {
      id: "base_to_stellar_cctp",
      sourceNetwork: "base",
      destinationNetwork: "stellar",
      rail: "circle_cctp_standard",
    };
    explanation =
      `Circle CCTP Cross-Chain: Your funds are on Base Sepolia and ${recipientInput} receives native USDC on Stellar Testnet with zero slippage.`;
    fees = [
      {
        kind: "network",
        amount: "0.00",
        asset: "USDC",
        payer: "sponsor",
        label: "Sponsored CCTP Attestation",
      },
    ];
  } else if (sourceNetwork === "stellar" && destNetwork === "base") {
    route = {
      id: "stellar_to_base_cctp",
      sourceNetwork: "stellar",
      destinationNetwork: "base",
      rail: "circle_cctp_standard",
    };
    explanation =
      `Circle CCTP Cross-Chain: Sent from Stellar Smart Account to Base address with cryptographic attestation.`;
    fees = [
      {
        kind: "network",
        amount: "0.00",
        asset: "USDC",
        payer: "sponsor",
        label: "Sponsored CCTP Attestation",
      },
    ];
  } else {
    route = {
      id: "base_to_base",
      sourceNetwork: "base",
      destinationNetwork: "base",
      rail: "base_usdc",
    };
    explanation =
      `Direct Base Transfer: Sent natively on Base Sepolia.`;
    fees = [
      {
        kind: "network",
        amount: "0.01",
        asset: "USDC",
        payer: "sender",
        label: "Base Network Gas Fee",
      },
    ];
  }

  return {
    id: `route_${Date.now()}`,
    paymentIntentId,
    sourceWalletId: `wallet_${sourceNetwork}`,
    destinationAddress: recipientInput,
    status: "resolved",
    route,
    recipient: {
      kind: "username",
      username: recipientInput.replace(/^@/, ""),
    },
    reasonCode: requestedSourceNetwork
      ? "explicit_user_instruction"
      : "only_sufficient_balance",
    explanation,
    fees,
    decidedAt,
  };
}
