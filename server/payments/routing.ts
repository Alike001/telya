import type {
  Network,
  PaymentRoute,
  RecipientReference,
  RouteReasonCode,
} from "../../src/domain/contracts.ts";
import type { ResolvedRecipient } from "../contacts/service.ts";

export type VerifiedSourceWallet = {
  readonly id: string;
  readonly network: Network;
  readonly address: string;
};

export type RouteInput = {
  readonly recipient: ResolvedRecipient;
  readonly amount: string;
  readonly requestedSourceNetwork?: Network | null;
  readonly requestedDestinationNetwork?: Network | null;
  readonly selectedSourceWalletId?: string | null;
  readonly sourceWallets: readonly VerifiedSourceWallet[];
  /** Server-verified balance snapshot by wallet ID. */
  readonly balances: Readonly<Record<string, string | null | undefined>>;
};

export type RouteResult =
  | {
      readonly status: "resolved";
      readonly route: PaymentRoute;
      readonly sourceWallet: VerifiedSourceWallet;
      readonly destinationAddress: string;
      readonly recipient: RecipientReference;
      readonly recipientUserId: string | null;
      readonly recipientUsername: string | null;
      readonly reasons: readonly RouteReasonCode[];
    }
  | {
      readonly status: "needs_clarification";
      readonly question: string;
      readonly reasons: readonly RouteReasonCode[];
    }
  | {
      readonly status: "unavailable";
      readonly reason: "invalid_amount" | "recipient_network_unavailable" | "source_wallet_unavailable" | "balance_unavailable" | "insufficient_balance";
      readonly reasons: readonly RouteReasonCode[];
    };

function amountUnits(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,19})(?:\.(\d{1,18}))?$/.exec(value);
  if (!match) return null;
  const whole = match[1];
  if (!whole) return null;
  const fraction = (match[2] ?? "").padEnd(18, "0");
  const units = BigInt(whole) * 10n ** 18n + BigInt(fraction || "0");
  return units > 0n ? units : null;
}

function amountFitsRoute(value: string, source: Network, destination: Network): boolean {
  const fraction = value.split(".")[1]?.replace(/0+$/, "") ?? "";
  const maxDecimals = source === "stellar" && destination === "stellar" ? 7 : 6;
  return fraction.length <= maxDecimals;
}

function routeFor(source: Network, destination: Network): PaymentRoute {
  if (source === "stellar" && destination === "stellar") {
    return { id: "stellar_to_stellar", sourceNetwork: source, destinationNetwork: destination, rail: "stellar_usdc" };
  }
  if (source === "base" && destination === "base") {
    return { id: "base_to_base", sourceNetwork: source, destinationNetwork: destination, rail: "base_usdc" };
  }
  if (source === "base" && destination === "stellar") {
    return { id: "base_to_stellar_cctp", sourceNetwork: source, destinationNetwork: destination, rail: "circle_cctp_standard" };
  }
  return { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" };
}

function clarification(question: string, reasons: readonly RouteReasonCode[]): RouteResult {
  return { status: "needs_clarification", question, reasons };
}

/** Resolve route constraints in product priority order without making provider or chain calls. */
export function resolvePaymentRoute(input: RouteInput): RouteResult {
  const amount = amountUnits(input.amount);
  if (amount === null) return { status: "unavailable", reason: "invalid_amount", reasons: [] };

  const destinations = input.recipient.destinations;
  if (destinations.length === 0) {
    return { status: "unavailable", reason: "recipient_network_unavailable", reasons: [] };
  }
  let destinationNetwork = input.requestedDestinationNetwork ?? null;
  let destinationAddress: string | null = null;
  const reasons: RouteReasonCode[] = [];

  if (input.requestedSourceNetwork || input.requestedDestinationNetwork) {
    reasons.push("explicit_user_instruction");
  }

  if (destinationNetwork) {
    const destination = destinations.find((entry) => entry.network === destinationNetwork);
    if (!destination) {
      return { status: "unavailable", reason: "recipient_network_unavailable", reasons };
    }
    destinationAddress = destination.address;
  } else if (input.recipient.reference.kind === "address" && destinations.length === 1) {
    destinationNetwork = destinations[0]?.network ?? null;
    destinationAddress = destinations[0]?.address ?? null;
    if (destinationNetwork) reasons.push("destination_address_network");
  } else if (input.recipient.preferredReceiveNetwork) {
    const destination = destinations.find((entry) => entry.network === input.recipient.preferredReceiveNetwork);
    if (destination) {
      destinationNetwork = destination.network;
      destinationAddress = destination.address;
      reasons.push("contact_preference");
    } else if (destinations.length === 1) {
      destinationNetwork = destinations[0]?.network ?? null;
      destinationAddress = destinations[0]?.address ?? null;
      if (destinationNetwork) reasons.push("destination_address_network");
    } else {
      return clarification("Which network should the recipient receive the USDC on?", [
        ...reasons,
        "ambiguous_requires_clarification",
      ]);
    }
  } else if (destinations.length === 1) {
    destinationNetwork = destinations[0]?.network ?? null;
    destinationAddress = destinations[0]?.address ?? null;
    if (destinationNetwork) reasons.push("destination_address_network");
  } else if (!input.requestedSourceNetwork) {
    return clarification("Which network should the recipient receive the USDC on?", [
      ...reasons,
      "ambiguous_requires_clarification",
    ]);
  }

  const sourceCandidates = input.requestedSourceNetwork
    ? input.sourceWallets.filter((wallet) => wallet.network === input.requestedSourceNetwork)
    : input.selectedSourceWalletId
      ? input.sourceWallets.filter((wallet) => wallet.id === input.selectedSourceWalletId)
      : [];

  let sourceWallet: VerifiedSourceWallet | undefined;
  if (input.requestedSourceNetwork) {
    const selectedWallet = input.selectedSourceWalletId
      ? sourceCandidates.find((wallet) => wallet.id === input.selectedSourceWalletId)
      : undefined;
    if (selectedWallet) {
      sourceWallet = selectedWallet;
      reasons.push("selected_source_wallet");
    } else if (sourceCandidates.length === 1) {
      sourceWallet = sourceCandidates[0];
    } else if (sourceCandidates.length > 1) {
      const sufficientWallets = sourceCandidates.filter((wallet) => {
        const balance = input.balances[wallet.id];
        const available = balance === null || balance === undefined ? null : amountUnits(balance);
        return available !== null && available >= amount;
      });
      const hasUnknownBalance = sourceCandidates.some((wallet) => {
        const balance = input.balances[wallet.id];
        return balance === null || balance === undefined || amountUnits(balance) === null;
      });
      if (sufficientWallets.length === 1 && !hasUnknownBalance) {
        sourceWallet = sufficientWallets[0];
        reasons.push("only_sufficient_balance");
      } else if (sufficientWallets.length > 1 || hasUnknownBalance) {
        return clarification("Which of your selected network's wallets should the payment use?", [
          ...reasons,
          "ambiguous_requires_clarification",
        ]);
      } else {
        const hasUnknownBalance = sourceCandidates.some((wallet) => {
          const balance = input.balances[wallet.id];
          return balance === null || balance === undefined || amountUnits(balance) === null;
        });
        return {
          status: "unavailable",
          reason: hasUnknownBalance ? "balance_unavailable" : "insufficient_balance",
          reasons,
        };
      }
    }
    if (!sourceWallet) {
      return { status: "unavailable", reason: "source_wallet_unavailable", reasons };
    }
  } else if (input.selectedSourceWalletId) {
    sourceWallet = sourceCandidates[0];
    if (!sourceWallet) return { status: "unavailable", reason: "source_wallet_unavailable", reasons };
    reasons.push("selected_source_wallet");
  } else {
    if (input.sourceWallets.length === 0) {
      return { status: "unavailable", reason: "source_wallet_unavailable", reasons };
    }
    const sufficientWallets = input.sourceWallets.filter((wallet) => {
      const balance = input.balances[wallet.id];
      const available = balance === null || balance === undefined ? null : amountUnits(balance);
      return available !== null && available >= amount;
    });
    if (sufficientWallets.length === 0) {
      const hasUnknownBalance = input.sourceWallets.some((wallet) => {
        const balance = input.balances[wallet.id];
        return balance === null || balance === undefined || amountUnits(balance) === null;
      });
      return {
        status: "unavailable",
        reason: hasUnknownBalance ? "balance_unavailable" : "insufficient_balance",
        reasons,
      };
    }
    const hasUnknownBalance = input.sourceWallets.some((wallet) => {
      const balance = input.balances[wallet.id];
      return balance === null || balance === undefined || amountUnits(balance) === null;
    });
    if (hasUnknownBalance) {
      return clarification("Which wallet should the payment use? I couldn't verify every wallet balance.", [
        ...reasons,
        "ambiguous_requires_clarification",
      ]);
    }
    const sufficientNetworks = [...new Set(sufficientWallets.map((wallet) => wallet.network))];
    if (sufficientNetworks.length > 1) {
      return clarification("Which network should the payment come from?", [
        ...reasons,
        "ambiguous_requires_clarification",
      ]);
    }
    if (sufficientWallets.length > 1) {
      return clarification("Which of your wallets should the payment use?", [
        ...reasons,
        "only_sufficient_balance",
        "ambiguous_requires_clarification",
      ]);
    }
    sourceWallet = sufficientWallets[0];
    if (!sourceWallet) return { status: "unavailable", reason: "source_wallet_unavailable", reasons };
    reasons.push("only_sufficient_balance");
  }

  if (!destinationNetwork || !destinationAddress) {
    const availableNetworks = [...new Set(destinations.map((entry) => entry.network))];
    if (availableNetworks.length !== 1) {
      return clarification("Which network should the recipient receive the USDC on?", [
        ...reasons,
        "ambiguous_requires_clarification",
      ]);
    }
    destinationNetwork = availableNetworks[0] ?? null;
    destinationAddress = destinations.find((entry) => entry.network === destinationNetwork)?.address ?? null;
  }

  if (!destinationNetwork || !destinationAddress) {
    return { status: "unavailable", reason: "recipient_network_unavailable", reasons };
  }

  if (!amountFitsRoute(input.amount, sourceWallet.network, destinationNetwork)) {
    return { status: "unavailable", reason: "invalid_amount", reasons };
  }

  const sourceBalance = input.balances[sourceWallet.id];
  if (sourceBalance === null || sourceBalance === undefined) {
    return { status: "unavailable", reason: "balance_unavailable", reasons };
  }
  const available = amountUnits(sourceBalance);
  if (available === null || available < amount) {
    return { status: "unavailable", reason: "insufficient_balance", reasons };
  }

  return {
    status: "resolved",
    route: routeFor(sourceWallet.network, destinationNetwork),
    sourceWallet,
    destinationAddress,
    recipient: input.recipient.reference,
    recipientUserId: input.recipient.resolvedUserId,
    recipientUsername: input.recipient.username,
    reasons,
  };
}
