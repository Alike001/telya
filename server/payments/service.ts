import type { AuthenticatedUser } from "../auth/privy.js";
import type { Fee, Network } from "../../src/domain/contracts.js";
import { getSqlClient } from "../db/client.js";
import type { RouteResult, VerifiedSourceWallet } from "./routing.js";

export type FeeQuoteProvider = (input: {
  readonly route: Extract<RouteResult, { status: "resolved" }>["route"];
  readonly amount: string;
  readonly sourceWallet: VerifiedSourceWallet;
  readonly destinationAddress: string;
}) => Promise<readonly Fee[] | null>;

export type BalanceProvider = (
  user: Pick<AuthenticatedUser, "id">,
  wallets: readonly VerifiedSourceWallet[],
) => Promise<Readonly<Record<string, string | null | undefined>>>;

export type PaymentIntentInput = {
  readonly amount: string;
  readonly asset: "USDC";
  readonly recipientInput: string;
  readonly requestedSourceNetwork: Network | null;
  readonly requestedDestinationNetwork: Network | null;
};

export type CreatePaymentInput = {
  readonly idempotencyKey: string;
  readonly conversationId: string;
  readonly intentMessageId: string;
  readonly inputMode: "text" | "voice" | "manual";
  readonly intent: PaymentIntentInput;
  readonly selectedSourceWalletId: string | null;
};

export class PaymentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentInputError";
  }
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super("Payment was not found");
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentConflictError extends Error {
  constructor(message = "This payment request conflicts with an existing operation") {
    super(message);
    this.name = "PaymentConflictError";
  }
}

export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super("Balance or fee service is unavailable");
    this.name = "PaymentProviderUnavailableError";
  }
}

function mapRouteId(routeId: string): string {
  switch (routeId) {
    case "base_to_stellar_cctp": return "base_to_stellar";
    case "stellar_to_base_cctp": return "stellar_to_base";
    default: return routeId;
  }
}

function mapRail(rail: string): string {
  switch (rail) {
    case "stellar_usdc": return "stellar_direct";
    case "base_usdc": return "base_direct";
    default: return rail;
  }
}

function validateFeeList(input: readonly Fee[] | null): readonly Fee[] | null {
  if (input === null) return null;
  if (!Array.isArray(input) || input.length > 12) throw new PaymentInputError("Invalid fee quote");
  for (const fee of input) {
    if (
      !fee ||
      !["network", "provider", "sponsor"].includes(fee.kind) ||
      !["sender", "recipient", "sponsor"].includes(fee.payer) ||
      typeof fee.amount !== "string" || !/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(fee.amount) ||
      typeof fee.asset !== "string" || !/^[A-Z0-9]{2,12}$/.test(fee.asset) ||
      typeof fee.label !== "string" || !fee.label.trim() || fee.label.length > 80
    ) throw new PaymentInputError("Invalid fee quote");
  }
  return input;
}

export async function getVerifiedSourceWallets(
  user: Pick<AuthenticatedUser, "id">,
): Promise<VerifiedSourceWallet[]> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT id, network, address
    FROM wallets
    WHERE user_id = ${user.id}::uuid AND verification_status = 'verified'
    ORDER BY network, created_at, id
  `;
  return rows.flatMap((row): VerifiedSourceWallet[] => {
    if ((row.network !== "stellar" && row.network !== "base") || typeof row.address !== "string") return [];
    return [{ id: String(row.id), network: row.network, address: row.address }];
  });
}

async function getOwnedIntentMessage(userId: string, conversationId: string, intentMessageId: string): Promise<string> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT m.content
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.id = ${conversationId}::uuid
      AND c.user_id = ${userId}::uuid
      AND m.id = ${intentMessageId}::uuid
      AND m.role = 'user'
    LIMIT 1
  `;
  if (typeof rows[0]?.content !== "string") throw new PaymentInputError("Intent message was not found in this conversation");
  return rows[0].content;
}

function intentAppearsInMessage(message: string, amount: string, recipient: string): boolean {
  const escapedAmount = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const amountMatches = new RegExp(`(?:^|[^0-9.])${escapedAmount}(?=$|[^0-9.])`).test(message);
  const normalizedRecipient = recipient.trim().replace(/^@/, "");
  const escapedRecipient = normalizedRecipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const recipientMatches = normalizedRecipient.length > 0 &&
    new RegExp(`(?:^|[^\\p{L}\\p{N}_])@?${escapedRecipient}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(message);
  return amountMatches && recipientMatches;
}

function networkIsExplicit(message: string, network: Network, side: "source" | "destination"): boolean {
  const pair = message.match(/\b(stellar|base)\s*(?:to|->)\s*(stellar|base)\b/i) ??
    message.match(/\bfrom\s+(stellar|base)\b[\s\S]{0,100}?\bon\s+(stellar|base)\b/i);
  if (pair) return (side === "source" ? pair[1] : pair[2])?.toLowerCase() === network;
  if (side === "source") return new RegExp(`\\bfrom\\s+${network}\\b`, "i").test(message);
  return new RegExp(`\\b(?:to|on|receive(?:s|d)?\\s+on)\\s+${network}\\b`, "i").test(message);
}

export async function validatePaymentIntentMessage(
  user: Pick<AuthenticatedUser, "id">,
  input: Pick<CreatePaymentInput, "conversationId" | "intentMessageId" | "inputMode" | "intent">,
): Promise<void> {
  const originalInput = await getOwnedIntentMessage(user.id, input.conversationId, input.intentMessageId);
  if (
    input.inputMode !== "manual" &&
    (
      !intentAppearsInMessage(originalInput, input.intent.amount, input.intent.recipientInput) ||
      (input.intent.requestedSourceNetwork !== null &&
        !networkIsExplicit(originalInput, input.intent.requestedSourceNetwork, "source")) ||
      (input.intent.requestedDestinationNetwork !== null &&
        !networkIsExplicit(originalInput, input.intent.requestedDestinationNetwork, "destination"))
    )
  ) throw new PaymentInputError("Intent details do not match the saved user message");
}

function routeReasons(result: Extract<RouteResult, { status: "resolved" }>): string {
  return JSON.stringify(result.reasons);
}

/** Persist a reviewable payment and its initial route event; this never submits a transaction. */
export async function createPaymentRecord(
  user: Pick<AuthenticatedUser, "id">,
  input: CreatePaymentInput,
  route: Extract<RouteResult, { status: "resolved" }>,
  rawFees: readonly Fee[] | null,
): Promise<{ readonly payment: Record<string, unknown>; readonly reused: boolean }> {
  const fees = validateFeeList(rawFees);
  if (fees === null) throw new PaymentProviderUnavailableError();
  await validatePaymentIntentMessage(user, input);

  const sql = getSqlClient();
  const dbRouteId = mapRouteId(route.route.id);
  const dbRail = mapRail(route.route.rail);
  const parsedIntent = JSON.stringify({
    action: "send",
    amount: input.intent.amount,
    asset: input.intent.asset,
    recipientInput: input.intent.recipientInput,
    requestedSourceNetwork: input.intent.requestedSourceNetwork,
    requestedDestinationNetwork: input.intent.requestedDestinationNetwork,
    inputMode: input.inputMode,
    selectedSourceWallet: {
      id: route.sourceWallet.id,
      network: route.sourceWallet.network,
      address: route.sourceWallet.address,
    },
    resolvedRecipientUserId: route.recipientUserId,
    recipientUsername: route.recipientUsername,
  });
  const previewIntent = JSON.stringify({
    status: "awaiting_confirmation",
    route: route.route,
    destinationAddress: route.destinationAddress,
    reasons: route.reasons,
    fees,
  });
  const [insertedRows, resultRows] = await sql.transaction([
    sql`
      INSERT INTO payments (
        user_id,
        conversation_id,
        intent_message_id,
        idempotency_key,
        route_id,
        source_network,
        destination_network,
        rail,
        recipient_user_id,
        recipient_username,
        recipient_address,
        asset,
        expected_recipient_amount,
        status,
        route_reasons,
        fees
      )
      SELECT
        ${user.id}::uuid,
        ${input.conversationId}::uuid,
        ${input.intentMessageId}::uuid,
        ${input.idempotencyKey},
        ${dbRouteId},
        ${route.route.sourceNetwork},
        ${route.route.destinationNetwork},
        ${dbRail},
        ${route.recipientUserId}::uuid,
        ${route.recipientUsername},
        ${route.destinationAddress},
        'USDC',
        ${input.intent.amount}::numeric,
        'awaiting_confirmation',
        ${routeReasons(route)}::jsonb,
        ${JSON.stringify(fees)}::jsonb
      FROM wallets source_wallet
      WHERE source_wallet.id = ${route.sourceWallet.id}::uuid
        AND source_wallet.user_id = ${user.id}::uuid
        AND source_wallet.network = ${route.route.sourceNetwork}
        AND source_wallet.address = ${route.sourceWallet.address}
        AND source_wallet.verification_status = 'verified'
        AND (
          ${route.recipientUserId}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM wallets destination_wallet
            WHERE destination_wallet.user_id = ${route.recipientUserId}::uuid
              AND destination_wallet.network = ${route.route.destinationNetwork}
              AND destination_wallet.normalized_address = CASE destination_wallet.network
                WHEN 'base' THEN lower(${route.destinationAddress})
                ELSE ${route.destinationAddress}
              END
              AND destination_wallet.verification_status = 'verified'
          )
          OR EXISTS (
            SELECT 1
            FROM contacts c
            JOIN contact_wallets cw ON cw.contact_id = c.id
            WHERE c.owner_user_id = ${user.id}::uuid
              AND c.resolved_user_id = ${route.recipientUserId}::uuid
              AND cw.network = ${route.route.destinationNetwork}
              AND cw.normalized_address = CASE cw.network
                WHEN 'base' THEN lower(${route.destinationAddress})
                ELSE ${route.destinationAddress}
              END
              AND cw.verification_status = 'verified'
          )
        )
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id
    `,
    sql`
      WITH target AS MATERIALIZED (
        SELECT p.*
        FROM payments p
        WHERE p.user_id = ${user.id}::uuid AND p.idempotency_key = ${input.idempotencyKey}
        FOR UPDATE
      ), compatible AS MATERIALIZED (
        SELECT p.*
        FROM target p
        WHERE p.conversation_id = ${input.conversationId}::uuid
          AND p.intent_message_id = ${input.intentMessageId}::uuid
          AND p.route_id = ${dbRouteId}
          AND p.source_network = ${route.route.sourceNetwork}
          AND p.destination_network = ${route.route.destinationNetwork}
          AND p.rail = ${dbRail}
          AND p.recipient_user_id IS NOT DISTINCT FROM ${route.recipientUserId}::uuid
          AND p.recipient_username IS NOT DISTINCT FROM ${route.recipientUsername}
          AND p.recipient_address = ${route.destinationAddress}
          AND p.expected_recipient_amount = ${input.intent.amount}::numeric
          AND p.fees = ${JSON.stringify(fees)}::jsonb
          AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.id = p.intent_message_id
              AND m.conversation_id = p.conversation_id
              AND m.role = 'user'
              AND (m.structured_intent IS NULL OR m.structured_intent = ${parsedIntent}::jsonb)
          )
          AND (
            p.intent_message_id IS NULL
            OR EXISTS (
              SELECT 1 FROM messages m
              WHERE m.id = p.intent_message_id
                AND m.structured_intent->'selectedSourceWallet'->>'id' = ${route.sourceWallet.id}
            )
          )
      ), saved_intent AS (
        UPDATE messages m
        SET structured_intent = ${parsedIntent}::jsonb
        FROM compatible p
        WHERE m.id = p.intent_message_id
        RETURNING m.id
      ), initial_event AS (
        INSERT INTO payment_events (payment_id, event_key, stage, status, network, public_message)
        SELECT p.id, 'route_resolved', 'routing', 'awaiting_confirmation', ${route.route.sourceNetwork},
          'Payment details are ready for your review.'
        FROM compatible p
        JOIN saved_intent ON saved_intent.id = p.intent_message_id
        ON CONFLICT (payment_id, event_key) DO NOTHING
        RETURNING id
      ), preview_message AS (
        INSERT INTO messages (conversation_id, role, content, structured_intent)
        SELECT
          p.conversation_id,
          'assistant',
          'Review the recipient, amount, route, and fees before confirming.',
          ${previewIntent}::jsonb
        FROM compatible p
        JOIN initial_event ON true
        RETURNING id
      )
      SELECT
        p.id,
        p.conversation_id,
        p.intent_message_id,
        p.idempotency_key,
        p.route_id,
        p.source_network,
        p.destination_network,
        p.rail,
        p.recipient_user_id,
        p.recipient_username,
        p.recipient_address,
        p.asset,
        p.expected_recipient_amount,
        p.status,
        p.route_reasons,
        p.fees,
        p.created_at,
        p.updated_at,
        (compatible.id IS NOT NULL) AS compatible
      FROM target p
      LEFT JOIN compatible ON compatible.id = p.id
    `,
  ]);

  const inserted = (insertedRows as Record<string, unknown>[])[0];
  const row = (resultRows as Record<string, unknown>[])[0];
  if (!row) throw new PaymentInputError("The source wallet or verified recipient wallet is no longer available");
  if (row.compatible !== true) throw new PaymentConflictError("The idempotency key was already used for different payment details");
  return { payment: row, reused: !inserted };
}

export async function confirmPayment(
  user: Pick<AuthenticatedUser, "id">,
  paymentId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    throw new PaymentInputError("Invalid payment ID");
  }
  const sql = getSqlClient();
  const [, eventRows, recordRows] = await sql.transaction([
    sql`
      UPDATE payments
      SET status = 'authorized', updated_at = now()
      WHERE id = ${paymentId}::uuid AND user_id = ${user.id}::uuid
        AND status = 'awaiting_confirmation'
      RETURNING id
    `,
    sql`
      WITH payment AS MATERIALIZED (
        SELECT id, status, source_network, conversation_id
        FROM payments
        WHERE id = ${paymentId}::uuid AND user_id = ${user.id}::uuid
        FOR UPDATE
      ), event AS (
        INSERT INTO payment_events (payment_id, event_key, stage, status, network, public_message)
        SELECT id, 'user_authorized', 'authorization', 'authorized', source_network,
          'You confirmed this payment. It has not been submitted yet.'
        FROM payment
        WHERE status = 'authorized'
        ON CONFLICT (payment_id, event_key) DO NOTHING
        RETURNING payment_id
      )
      INSERT INTO messages (conversation_id, role, content, structured_intent)
      SELECT payment.conversation_id, 'assistant',
        'You confirmed this payment. Wallet authorization and transaction submission are still pending.',
        jsonb_build_object('paymentId', payment.id, 'status', 'authorized')
      FROM payment
      JOIN event ON event.payment_id = payment.id
      RETURNING id
    `,
    sql`
      SELECT id, status, route_id, source_network, destination_network, rail,
        recipient_address, expected_recipient_amount, fees, route_reasons,
        created_at, updated_at
      FROM payments
      WHERE id = ${paymentId}::uuid AND user_id = ${user.id}::uuid
    `,
  ]);
  void eventRows;
  const row = (recordRows as Record<string, unknown>[])[0];
  if (!row) throw new PaymentNotFoundError();
  if (row.status !== "authorized") throw new PaymentConflictError("Payment is not awaiting confirmation");
  return row;
}

export async function getPaymentWithEvents(
  user: Pick<AuthenticatedUser, "id">,
  paymentId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    throw new PaymentInputError("Invalid payment ID");
  }
  const sql = getSqlClient();
  const rows = await sql`
    SELECT
      p.id,
      p.status,
      p.route_id,
      p.source_network,
      p.destination_network,
      p.rail,
      p.recipient_address,
      p.expected_recipient_amount,
      p.verified_recipient_address,
      p.verified_recipient_amount,
      p.source_transaction_hash,
      p.destination_transaction_hash,
      p.failure_code,
      p.fees,
      p.route_reasons,
      p.created_at,
      p.updated_at,
      COALESCE(
        json_agg(jsonb_build_object(
          'id', e.id,
          'stage', e.stage,
          'status', e.status,
          'network', e.network,
          'txHash', e.transaction_hash,
          'publicMessage', e.public_message,
          'errorCode', e.error_code,
          'occurredAt', e.occurred_at,
          'completedAt', e.completed_at
        ) ORDER BY e.occurred_at, e.id) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS events
    FROM payments p
    LEFT JOIN payment_events e ON e.payment_id = p.id
    WHERE p.id = ${paymentId}::uuid AND p.user_id = ${user.id}::uuid
    GROUP BY p.id
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new PaymentNotFoundError();
  return row as Record<string, unknown>;
}
