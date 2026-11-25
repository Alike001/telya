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

export type Route =
  | "stellar_to_stellar"
  | "base_to_base"
  | "base_to_stellar_cctp"
  | "stellar_to_base_cctp";

export type RouteRail = "stellar_usdc" | "base_usdc" | "circle_cctp_standard";

export type RouteReasonCode =
  | "explicit_user_instruction"
  | "selected_source_wallet"
  | "destination_address_network"
  | "contact_preference"
  | "only_sufficient_balance"
  | "ambiguous_requires_clarification";

export type RouteDecisionStatus = "resolved" | "needs_clarification";

export interface RouteDecision {
  readonly id: Identifier;
  readonly paymentIntentId: Identifier;
  readonly status: RouteDecisionStatus;
  readonly route: Route | null;
  readonly rail: RouteRail | null;
  readonly sourceNetwork: Network | null;
  readonly destinationNetwork: Network | null;
  readonly sourceWalletId: Identifier | null;
  readonly destinationAddress: string | null;
  readonly reasonCode: RouteReasonCode;
  /** Consumer-safe explanation of why this route was or was not chosen. */
  readonly explanation: string;
  readonly decidedAt: IsoDateTime;
}

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

export interface Payment {
  readonly id: Identifier;
  readonly userId: Identifier;
  readonly paymentIntentId: Identifier;
  readonly routeDecisionId: Identifier;
  readonly idempotencyKey: string;
  readonly route: Route;
  readonly sourceNetwork: Network;
  readonly destinationNetwork: Network;
  readonly sourceWalletId: Identifier;
  readonly expectedRecipient: string;
  readonly actualRecipient: string | null;
  readonly asset: Asset;
  readonly expectedAmount: DecimalAmount;
  readonly actualAmount: DecimalAmount | null;
  readonly feeAmount: DecimalAmount;
  readonly status: PaymentStatus;
  readonly sourceTransaction: TransactionReference | null;
  readonly destinationTransaction: TransactionReference | null;
  readonly failureCode: string | null;
  readonly failureStage: PaymentStatus | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly completedAt: IsoDateTime | null;
}

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
