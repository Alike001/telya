/**
 * Framework-neutral contracts shared by the Telya UI, API, and payment
 * integrations. Financial amounts are decimal strings so callers never lose
 * precision through JavaScript floating-point arithmetic.
 */

export type Identifier = string;
export type IsoDateTime = string;
export type DecimalAmount = string;

export type Network = "stellar" | "base";
export type Asset = "USDC";
export type WalletAddress = string;

export type WalletKind = "stellar_smart_account" | "base_wallet";
export type WalletStatus = "pending" | "active" | "disabled";

export interface Wallet {
  readonly id: Identifier;
  readonly userId: Identifier;
  readonly network: Network;
  readonly kind: WalletKind;
  readonly address: string;
  readonly status: WalletStatus;
  readonly isVerified: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ContactDestination {
  readonly network: Network;
  readonly address: string;
  readonly isVerified: boolean;
}

export interface Contact {
  readonly id: Identifier;
  readonly ownerUserId: Identifier;
  readonly displayName: string;
  /** Normalized, lowercase username without the leading @. */
  readonly username: string | null;
  readonly destinations: readonly ContactDestination[];
  readonly preferredReceiveNetwork: Network | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type PaymentIntentInputMode = "text" | "voice" | "manual";
export type PaymentIntentStatus =
  | "parsed"
  | "needs_clarification"
  | "resolved"
  | "rejected";

/**
 * AI may produce the initial structured fields, but deterministic application
 * code must resolve the recipient, source, network, route, and policy.
 */
export interface PaymentIntent {
  readonly id: Identifier;
  readonly userId: Identifier;
  readonly conversationId: Identifier | null;
  readonly inputMode: PaymentIntentInputMode;
  readonly originalInput: string;
  readonly amount: DecimalAmount;
  readonly asset: Asset;
  readonly recipientInput: string;
  readonly requestedSourceNetwork: Network | null;
  readonly requestedDestinationNetwork: Network | null;
  readonly status: PaymentIntentStatus;
  readonly clarificationQuestion: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

/** A username, saved contact, or explicit network address from the user's input. */
export type RecipientReference =
  | { readonly kind: "username"; readonly username: string }
  | { readonly kind: "contact"; readonly contactId: Identifier }
  | { readonly kind: "address"; readonly network: Network; readonly address: WalletAddress };

export type FeeKind = "network" | "provider" | "sponsor";
export type FeePayer = "sender" | "recipient" | "sponsor";

/** A separately displayable fee; amounts remain decimal strings. */
export interface Fee {
  readonly kind: FeeKind;
  readonly amount: DecimalAmount;
  readonly asset: string;
  readonly payer: FeePayer;
  readonly label: string;
}

/** The only route/network/rail combinations supported by the P0 product. */
export type PaymentRoute =
  | {
      readonly id: "stellar_to_stellar";
      readonly sourceNetwork: "stellar";
      readonly destinationNetwork: "stellar";
      readonly rail: "stellar_usdc";
    }
  | {
      readonly id: "base_to_base";
      readonly sourceNetwork: "base";
      readonly destinationNetwork: "base";
      readonly rail: "base_usdc";
    }
  | {
      readonly id: "base_to_stellar_cctp";
      readonly sourceNetwork: "base";
      readonly destinationNetwork: "stellar";
      readonly rail: "circle_cctp_standard";
    }
  | {
      readonly id: "stellar_to_base_cctp";
      readonly sourceNetwork: "stellar";
      readonly destinationNetwork: "base";
      readonly rail: "circle_cctp_standard";
    };

/** Route IDs and rails stay derived from the route union. */
export type Route = PaymentRoute["id"];
export type RouteRail = PaymentRoute["rail"];

export type RouteReasonCode =
  | "explicit_user_instruction"
  | "selected_source_wallet"
  | "destination_address_network"
  | "contact_preference"
  | "only_sufficient_balance"
  | "ambiguous_requires_clarification";

export type RouteDecisionStatus = "resolved" | "needs_clarification" | "unavailable";

interface RouteDecisionBase {
  readonly id: Identifier;
  readonly paymentIntentId: Identifier;
  readonly sourceWalletId: Identifier | null;
  readonly destinationAddress: string | null;
  readonly reasonCode: RouteReasonCode;
  /** Consumer-safe explanation of why this route was or was not chosen. */
  readonly explanation: string;
  readonly fees: readonly Fee[];
  readonly decidedAt: IsoDateTime;
}

export type RouteDecision =
  | (RouteDecisionBase & {
      readonly status: "resolved";
      readonly route: PaymentRoute;
      readonly recipient: RecipientReference;
    })
  | (RouteDecisionBase & {
      readonly status: "needs_clarification";
      readonly route: null;
      readonly recipient: RecipientReference | null;
      readonly requestedSourceNetwork: Network | null;
      readonly requestedDestinationNetwork: Network | null;
      readonly clarificationQuestion: string;
    })
  | (RouteDecisionBase & {
      readonly status: "unavailable";
      readonly route: null;
      readonly recipient: RecipientReference | null;
      readonly requestedSourceNetwork: Network | null;
      readonly requestedDestinationNetwork: Network | null;
      readonly unavailabilityReason: string;
    });

export type PaymentStatus =
  | "created"
  | "route_resolved"
  | "awaiting_confirmation"
  | "authorized"
  | "submitted"
  | "source_confirmed"
  | "awaiting_attestation"
  | "destination_submitted"
  | "destination_confirmed"
  | "recipient_verified"
  | "completed"
  | "failed";

export interface TransactionReference {
  readonly network: Network;
  readonly txHash: string;
  readonly explorerUrl: string;
}

interface PaymentRecord {
  readonly id: Identifier;
  readonly userId: Identifier;
  readonly paymentIntentId: Identifier;
  readonly routeDecisionId: Identifier;
  readonly idempotencyKey: string;
  readonly route: PaymentRoute;
  readonly sourceWalletId: Identifier;
  readonly recipient: RecipientReference;
  readonly expectedRecipient: string;
  readonly asset: Asset;
  readonly expectedAmount: DecimalAmount;
  readonly fees: readonly Fee[];
  readonly feeAmount: DecimalAmount;
  readonly sourceTransaction: TransactionReference | null;
  readonly failureCode: string | null;
  readonly failureStage: PaymentStatus | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

/**
 * Completed payments must carry destination and recipient/amount verification
 * evidence. A source transaction alone cannot produce the completed variant.
 */
export type Payment =
  | (PaymentRecord & {
      readonly status: Exclude<PaymentStatus, "completed">;
      readonly actualRecipient: string | null;
      readonly actualAmount: DecimalAmount | null;
      readonly destinationTransaction: TransactionReference | null;
      readonly recipientVerification?: never;
      readonly completedAt: null;
    })
  | (PaymentRecord & {
      readonly status: "completed";
      readonly actualRecipient: string;
      readonly actualAmount: DecimalAmount;
      readonly destinationTransaction: TransactionReference;
      readonly recipientVerification: {
        readonly recipientAddress: WalletAddress;
        readonly receivedAmount: DecimalAmount;
        readonly verifiedAt: IsoDateTime;
      };
      readonly completedAt: IsoDateTime;
    });

export type PaymentEventStatus = "started" | "succeeded" | "failed";

export interface PaymentEvent {
  readonly id: Identifier;
  readonly paymentId: Identifier;
  readonly sequence: number;
  readonly stage: PaymentStatus;
  readonly status: PaymentEventStatus;
  readonly network: Network | null;
  readonly txHash: string | null;
  readonly explorerUrl: string | null;
  readonly publicMessage: string;
  /** Server-only diagnostic context. Never render this directly to consumers. */
  readonly debugMessage: string | null;
  readonly errorCode: string | null;
  readonly startedAt: IsoDateTime;
  readonly completedAt: IsoDateTime | null;
}

export type AgentPassStatus = "active" | "expired" | "revoked";

export interface AgentPass {
  readonly id: Identifier;
  readonly ownerUserId: Identifier;
  readonly stellarSmartAccountId: Identifier;
  readonly agentAddress: string;
  readonly asset: Asset;
  readonly spendingLimit: DecimalAmount;
  readonly amountSpent: DecimalAmount;
  readonly expiresAt: IsoDateTime;
  readonly status: AgentPassStatus;
  readonly onChainReference: string;
  readonly createdAt: IsoDateTime;
  readonly revokedAt: IsoDateTime | null;
}

export type RampDirection = "cash_in" | "cash_out";
export type RampProvider = "moneygram";
export type RampEnvironment = "sandbox";
export type RampStatus =
  | "created"
  | "quoted"
  | "awaiting_user_action"
  | "provider_processing"
  | "completed"
  | "failed"
  | "expired";

export interface RampTransaction {
  readonly id: Identifier;
  readonly userId: Identifier;
  readonly provider: RampProvider;
  readonly environment: RampEnvironment;
  readonly direction: RampDirection;
  readonly status: RampStatus;
  readonly fiatCurrency: string;
  readonly fiatAmount: DecimalAmount;
  readonly usdcAmount: DecimalAmount;
  readonly providerFeeAmount: DecimalAmount;
  readonly providerReference: string | null;
  readonly failureCode: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly completedAt: IsoDateTime | null;
}
