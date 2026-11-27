import "server-only";

import { randomUUID } from "node:crypto";

import { StrKey } from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

import { getSqlClient } from "../../server/db/client.ts";
import {
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
  CCTP_BASE_DOMAIN,
  CCTP_STELLAR_DOMAIN,
  encodeCctpForwarderHookData,
  encodeCctpReceiveMessage,
  findBaseCctpMessage,
  getBaseTransactionReceipt,
  isBaseTransactionFinalized,
  normalizeBaseUsdcAmount,
  normalizeBaseUsdcFee,
  parseCctpMessage,
  requireEvmAddress,
  verifyBaseCctpMint,
  verifyBaseUsdcTransfer,
  type BaseRpc,
  type BaseTransaction,
} from "../base/evm.ts";
import { getCircleCctpStatus, type CircleCctpStatus } from "../base/circle.ts";
import {
  reconcileStellarCctpSource,
  settleBaseToStellarCctp,
} from "./stellar-cctp.ts";
import {
  CCTP_STANDARD_FINALITY_THRESHOLD,
  stellarCctpConfigFromEnvironment,
} from "../stellar/cctp.ts";
import { normalizeStellarUsdcAmount } from "../stellar/usdc.ts";

export type BaseCctpSourceVerification =
  | { readonly status: "pending"; readonly sourceTransactionHash: string }
  | {
      readonly status: "verified";
      readonly sourceTransactionHash: string;
      readonly circle: Extract<CircleCctpStatus, { status: "complete" }>;
      readonly amountAtomic: string;
    }
  | {
      readonly status: "failed" | "mismatch";
      readonly sourceTransactionHash: string;
      readonly reason: string;
    };

function baseAddressAsBytes32(address: string): string {
  return `0x${requireEvmAddress(address, "source wallet").slice(2).padStart(64, "0")}`;
}

function stellarContractAsBytes32(address: string): string {
  return `0x${Buffer.from(StrKey.decodeContract(address)).toString("hex")}`;
}

function canonicalDatabaseDecimal(value: unknown): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(String(value));
  if (!match) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Stored payment amount is invalid");
  }
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction ? `${match[1]}.${fraction}` : match[1]!;
}

const CCTP_V2_MIN_MESSAGE_BYTES = 148 + 228;
const CCTP_V2_EMPTY_NONCE = `0x${"0".repeat(64)}`;
const CIRCLE_ATTESTATION_MUTABLE_RANGES = [
  { start: 12, length: 32 }, // MessageV2.nonce
  { start: 144, length: 4 }, // MessageV2.finalityThresholdExecuted
  { start: 312, length: 32 }, // BurnMessageV2.feeExecuted
  { start: 344, length: 32 }, // BurnMessageV2.expirationBlock
] as const;

/**
 * Iris fills exactly four zero placeholders before signing a CCTP v2 message.
 * Every other byte must remain identical to the source MessageSent event.
 */
function circleAttestationMatchesSourceEvent(sourceMessage: string, attestedMessage: string): boolean {
  const source = sourceMessage.trim().replace(/^0x/i, "").toLowerCase();
  const attested = attestedMessage.trim().replace(/^0x/i, "").toLowerCase();
  if (source.length < CCTP_V2_MIN_MESSAGE_BYTES * 2 ||
      source.length !== attested.length || source.length % 2 !== 0 ||
      !/^[0-9a-f]+$/.test(source) || !/^[0-9a-f]+$/.test(attested)) {
    return false;
  }

  let cursor = 0;
  for (const range of CIRCLE_ATTESTATION_MUTABLE_RANGES) {
    const start = range.start * 2;
    const end = (range.start + range.length) * 2;
    if (source.slice(cursor, start) !== attested.slice(cursor, start) ||
        source.slice(start, end) !== "0".repeat(range.length * 2)) {
      return false;
    }
    cursor = end;
  }
  return source.slice(cursor) === attested.slice(cursor);
}

/** Verify the finalized Base burn and bind Circle's attestation to its MessageSent log. */
export async function verifyBaseCctpSource(input: {
  readonly rpc: BaseRpc;
  readonly sourceTransactionHash: string;
  readonly sourceAddress: string;
  readonly burnAmount: string;
  readonly maxFee: string;
  readonly expectedRecipientAmount: string;
  readonly expectedRecipientAddress: string;
  readonly expectedMintRecipient: string;
  readonly expectedDestinationTokenMessenger: string;
  readonly destinationDomain?: number;
  readonly fetchCircle?: typeof getCircleCctpStatus;
}): Promise<BaseCctpSourceVerification> {
  const sourceTransactionHash = input.sourceTransactionHash.trim().toLowerCase();
  const receipt = await getBaseTransactionReceipt(input.rpc, sourceTransactionHash);
  if (!receipt) return { status: "pending", sourceTransactionHash };
  if (receipt.status !== "0x1") {
    return {
      status: "failed",
      sourceTransactionHash,
      reason: "Base finalized the CCTP source transaction as failed",
    };
  }
  if (!(await isBaseTransactionFinalized(input.rpc, receipt))) {
    return { status: "pending", sourceTransactionHash };
  }
  const emittedMessage = findBaseCctpMessage({
    receipt,
    messageTransmitterAddress: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  });
  if (!emittedMessage) {
    return {
      status: "mismatch",
      sourceTransactionHash,
      reason: "Finalized Base transaction did not emit exactly one CCTP message",
    };
  }
  const circle = await (input.fetchCircle ?? getCircleCctpStatus)({
    sourceDomain: CCTP_BASE_DOMAIN,
    sourceTransactionHash,
  });
  if (circle.status === "pending") return { status: "pending", sourceTransactionHash };
  if (!circleAttestationMatchesSourceEvent(emittedMessage, circle.message)) {
    return {
      status: "mismatch",
      sourceTransactionHash,
      reason: "Circle's attested message differs from the Base MessageSent log outside attestation fields",
    };
  }
  const parsed = parseCctpMessage(circle.message);
  const expectedAmount = normalizeBaseUsdcAmount(input.burnAmount);
  const expectedMaxFee = normalizeBaseUsdcFee(input.maxFee);
  const expectedRecipientAmount = normalizeBaseUsdcAmount(input.expectedRecipientAmount);
  const destinationDomain = input.destinationDomain ?? CCTP_STELLAR_DOMAIN;
  let expectedHookData: string;
  try {
    expectedHookData = encodeCctpForwarderHookData(input.expectedRecipientAddress);
  } catch {
    return {
      status: "mismatch",
      sourceTransactionHash,
      reason: "Expected Stellar CCTP forward recipient is invalid",
    };
  }
  let expectedMintRecipient: string;
  let expectedDestinationTokenMessenger: string;
  try {
    expectedMintRecipient = stellarContractAsBytes32(input.expectedMintRecipient);
    expectedDestinationTokenMessenger = stellarContractAsBytes32(input.expectedDestinationTokenMessenger);
  } catch {
    return {
      status: "mismatch",
      sourceTransactionHash,
      reason: "Expected Stellar CCTP destination addresses are not valid contract addresses",
    };
  }
  const matches =
    parsed.sourceDomain === CCTP_BASE_DOMAIN &&
    parsed.destinationDomain === destinationDomain &&
    parsed.sender.toLowerCase() === baseAddressAsBytes32(BASE_SEPOLIA_TOKEN_MESSENGER) &&
    parsed.recipient.toLowerCase() === expectedDestinationTokenMessenger &&
    parsed.burnToken.toLowerCase() === baseAddressAsBytes32(BASE_SEPOLIA_USDC) &&
    parsed.messageSender.toLowerCase() === baseAddressAsBytes32(input.sourceAddress) &&
    parsed.mintRecipient.toLowerCase() === expectedMintRecipient &&
    parsed.destinationCaller.toLowerCase() === expectedMintRecipient &&
    parsed.hookData.toLowerCase() === expectedHookData &&
    parsed.nonce !== CCTP_V2_EMPTY_NONCE &&
    parsed.minFinalityThreshold === CCTP_STANDARD_FINALITY_THRESHOLD &&
    parsed.finalityThresholdExecuted >= CCTP_STANDARD_FINALITY_THRESHOLD &&
    parsed.amount === expectedAmount &&
    parsed.maxFee === expectedMaxFee &&
    parsed.feeExecuted <= parsed.maxFee &&
    parsed.feeExecuted < parsed.amount &&
    parsed.amount - parsed.feeExecuted === expectedRecipientAmount;
  if (!matches) {
    return {
      status: "mismatch",
      sourceTransactionHash,
      reason: "Attested CCTP burn does not match the payment's source, destination, token, and amount",
    };
  }
  return {
    status: "verified",
    sourceTransactionHash,
    circle,
    amountAtomic: parsed.amount.toString(),
  };
}

export class BaseCctpPersistenceError extends Error {
  constructor(
    readonly code:
      | "PAYMENT_NOT_FOUND"
      | "INVALID_PAYMENT_STATE"
      | "DESTINATION_IN_PROGRESS"
      | "DESTINATION_MISMATCH"
      | "SUBMISSION_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BaseCctpPersistenceError";
  }
}

interface PaymentOperationRow extends Record<string, unknown> {
  readonly id: string;
  readonly route_id: string;
  readonly status: string;
  readonly recipient_address: string;
  readonly expected_amount: string;
  readonly source_address: string | null;
  readonly source_transaction_hash: string | null;
  readonly destination_transaction_hash: string | null;
  readonly verified_recipient_address: string | null;
  readonly verified_recipient_amount: string | null;
}

function requirePaymentId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BaseCctpPersistenceError("PAYMENT_NOT_FOUND", "Invalid payment ID");
  }
  return value.toLowerCase();
}

function decimalToBaseAtomic(amount: string): string {
  return normalizeBaseUsdcAmount(amount).toString();
}

function atomicToDecimal(value: string, decimals: number): string {
  const atomic = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = atomic / scale;
  const fraction = (atomic % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function normalizeStellarUsdcFee(amount: string): bigint {
  const value = amount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(value)) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Stellar CCTP fee must be a non-negative decimal with at most 7 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10_000_000n + BigInt(fraction.padEnd(7, "0") || "0");
}

async function getPaymentOperation(paymentId: string, routes: readonly string[]) {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT p.id, p.route_id, p.status, p.recipient_address,
      p.expected_recipient_amount::text AS expected_amount,
      p.source_transaction_hash, p.destination_transaction_hash,
      p.verified_recipient_address,
      p.verified_recipient_amount::text AS verified_recipient_amount,
      w.address AS source_address
    FROM payments p
    LEFT JOIN messages m ON m.id = p.intent_message_id
    LEFT JOIN wallets w ON w.id::text =
      m.structured_intent->'selectedSourceWallet'->>'id'
    WHERE p.id = ${paymentId}::uuid
      AND p.route_id = ANY(${[...routes]}::text[])
    LIMIT 1
  `;
  const payment = rows[0] as PaymentOperationRow | undefined;
  if (!payment) {
    throw new BaseCctpPersistenceError("PAYMENT_NOT_FOUND", "Base payment not found");
  }
  return { sql, payment };
}

export async function recordBaseDirectVerificationFailure(input: {
  readonly paymentId: string;
  readonly transactionHash: string;
  readonly reason: string;
}): Promise<void> {
  const sql = getSqlClient();
  const rows = await sql`
    WITH operation AS (
      UPDATE base_cctp_operations SET status = 'failed',
        failure_code = 'DESTINATION_MISMATCH', updated_at = now()
      WHERE payment_id = ${input.paymentId}::uuid AND route_id = 'base_to_base'
        AND status = 'destination_submitted'
        AND destination_transaction_hash = ${input.transactionHash}
      RETURNING payment_id
    ), payment AS (
      UPDATE payments p SET status = 'failed', failure_code = 'DESTINATION_MISMATCH',
        failure_message = 'Base finalized without the exact intended USDC transfer.',
        updated_at = now()
      FROM operation o WHERE p.id = o.payment_id
        AND p.route_id = 'base_to_base' AND p.status = 'destination_submitted'
        AND p.destination_transaction_hash = ${input.transactionHash}
      RETURNING p.id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, debug_message, error_code, completed_at
      )
      SELECT p.id, 'base_direct_destination_mismatch', 'recipient_verification',
        'failed', 'base', ${input.transactionHash},
        'Base finalized, but the exact recipient and USDC amount could not be verified.',
        ${input.reason}, 'DESTINATION_MISMATCH', now()
      FROM payment p JOIN operation o ON o.payment_id = p.id
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT p.id FROM payment p JOIN operation o ON o.payment_id = p.id
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Base direct payment changed while destination failure was being recorded",
    );
  }
}

export async function recordBaseCctpSourceVerificationFailure(input: {
  readonly paymentId: string;
  readonly transactionHash: string;
  readonly reason: string;
}): Promise<void> {
  const sql = getSqlClient();
  const rows = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id FROM payments p
      JOIN base_cctp_operations o ON o.payment_id = p.id
      WHERE p.id = ${input.paymentId}::uuid
        AND p.route_id = 'base_to_stellar'
        AND p.status IN ('submitted', 'source_confirmed', 'awaiting_attestation')
        AND p.source_transaction_hash = ${input.transactionHash}
        AND p.destination_transaction_hash IS NULL
        AND o.route_id = 'base_to_stellar'
        AND o.status IN ('source_submitted', 'source_confirmed', 'awaiting_attestation')
        AND o.source_transaction_hash = ${input.transactionHash}
        AND o.destination_transaction_hash IS NULL
      FOR UPDATE OF p, o
    ), operation AS (
      UPDATE base_cctp_operations o SET status = 'failed',
        failure_code = 'DESTINATION_MISMATCH', updated_at = now()
      FROM eligible e WHERE o.payment_id = e.id
      RETURNING o.payment_id
    ), payment AS (
      UPDATE payments p SET status = 'failed', failure_code = 'DESTINATION_MISMATCH',
        failure_message = 'The Base CCTP source or forwarding proof did not match the authorized payment. Stellar delivery is not verified.',
        updated_at = now()
      FROM eligible e WHERE p.id = e.id
      RETURNING p.id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, debug_message, error_code, completed_at
      )
      SELECT p.id, 'base_cctp_source_mismatch', 'failure',
        'failed', 'base', ${input.transactionHash},
        'The Base burn or forwarding proof failed verification. Stellar recipient credit is not verified.',
        ${input.reason}, 'DESTINATION_MISMATCH', now()
      FROM payment p JOIN operation o ON o.payment_id = p.id
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT p.id FROM payment p JOIN operation o ON o.payment_id = p.id
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Base CCTP payment changed while source failure was being recorded",
    );
  }
}

export async function recordStellarToBaseDestinationVerificationFailure(input: {
  readonly paymentId: string;
  readonly transactionHash: string;
  readonly reason: string;
}): Promise<void> {
  const sql = getSqlClient();
  const rows = await sql`
    WITH operation AS (
      UPDATE base_cctp_operations SET status = 'failed',
        failure_code = 'DESTINATION_MISMATCH', updated_at = now()
      WHERE payment_id = ${input.paymentId}::uuid AND route_id = 'stellar_to_base'
        AND status = 'destination_submitted'
        AND destination_transaction_hash = ${input.transactionHash}
      RETURNING payment_id
    ), payment AS (
      UPDATE payments p SET status = 'failed', failure_code = 'DESTINATION_MISMATCH',
        failure_message = 'Base finalized without the exact intended CCTP recipient and amount.',
        updated_at = now()
      FROM operation o WHERE p.id = o.payment_id
        AND p.route_id = 'stellar_to_base' AND p.status = 'destination_submitted'
        AND p.destination_transaction_hash = ${input.transactionHash}
      RETURNING p.id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, debug_message, error_code, completed_at
      )
      SELECT p.id, 'base_cctp_destination_mismatch', 'recipient_verification',
        'failed', 'base', ${input.transactionHash},
        'Base finalized, but the exact CCTP recipient and USDC amount could not be verified.',
        ${input.reason}, 'DESTINATION_MISMATCH', now()
      FROM payment p JOIN operation o ON o.payment_id = p.id
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT p.id FROM payment p JOIN operation o ON o.payment_id = p.id
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Stellar-to-Base payment changed while destination failure was being recorded",
    );
  }
}

/** Persist deterministic burn/fee limits before a wallet is asked to sign. */
export async function reserveBaseCctpOperation(input: {
  readonly paymentId: string;
  readonly burnAmount: string;
  readonly maxFee: string;
}): Promise<{ readonly burnAmountAtomic: string; readonly maxFeeAtomic: string }> {
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["base_to_stellar", "stellar_to_base"]);
  if (!["awaiting_confirmation", "authorized"].includes(payment.status)) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "CCTP payment is not ready for source authorization");
  }
  const sourceIsStellar = payment.route_id === "stellar_to_base";
  const decimals = sourceIsStellar ? 7 : 6;
  let burnAmountAtomic: bigint;
  let maxFeeAtomic: bigint;
  try {
    if (sourceIsStellar) {
      const normalizedBurn = normalizeStellarUsdcAmount(input.burnAmount);
      burnAmountAtomic = normalizedBurn.raw;
      maxFeeAtomic = normalizeStellarUsdcFee(input.maxFee);
    } else {
      burnAmountAtomic = normalizeBaseUsdcAmount(input.burnAmount);
      maxFeeAtomic = normalizeBaseUsdcFee(input.maxFee);
    }
  } catch (error) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "CCTP burn amount or fee is invalid", { cause: error });
  }
  if (burnAmountAtomic <= 0n || maxFeeAtomic < 0n || maxFeeAtomic >= burnAmountAtomic) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "CCTP max fee must be non-negative and less than the burn amount");
  }
  const expectedAmountAtomic = sourceIsStellar
    ? normalizeBaseUsdcAmount(canonicalDatabaseDecimal(payment.expected_amount))
    : normalizeStellarUsdcAmount(canonicalDatabaseDecimal(payment.expected_amount)).raw;
  const rows = await sql`
    INSERT INTO base_cctp_operations (
      payment_id, route_id, status, burn_amount_atomic, max_fee_atomic,
      expected_recipient_address, expected_amount_atomic
    ) VALUES (
      ${paymentId}::uuid, ${payment.route_id}, 'authorized',
      ${burnAmountAtomic.toString()}::numeric, ${maxFeeAtomic.toString()}::numeric,
      ${payment.recipient_address}, ${expectedAmountAtomic.toString()}::numeric
    )
    ON CONFLICT (payment_id) DO UPDATE SET updated_at = now()
    WHERE base_cctp_operations.route_id = EXCLUDED.route_id
      AND base_cctp_operations.burn_amount_atomic = EXCLUDED.burn_amount_atomic
      AND base_cctp_operations.max_fee_atomic = EXCLUDED.max_fee_atomic
      AND base_cctp_operations.expected_recipient_address = EXCLUDED.expected_recipient_address
      AND base_cctp_operations.expected_amount_atomic = EXCLUDED.expected_amount_atomic
    RETURNING burn_amount_atomic::text AS burn_amount, max_fee_atomic::text AS max_fee
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "CCTP payment already has a conflicting burn intent");
  }
  return {
    burnAmountAtomic: String(rows[0]!.burn_amount),
    maxFeeAtomic: String(rows[0]!.max_fee),
  };
}

/** Mark an exact Base-source CCTP review authorized before the wallet signs. */
export async function authorizeBaseCctpOperation(input: {
  readonly paymentId: string;
  readonly burnAmount: string;
  readonly maxFee: string;
}): Promise<{ readonly sourceAddress: string; readonly burnAmountAtomic: string; readonly maxFeeAtomic: string }> {
  const reserved = await reserveBaseCctpOperation(input);
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["base_to_stellar"]);
  if (!["awaiting_confirmation", "authorized"].includes(payment.status) ||
      typeof payment.source_address !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base CCTP payment is not ready for wallet authorization");
  }
  const rows = await sql`
    WITH operation AS (
      UPDATE base_cctp_operations SET status = 'authorized', updated_at = now()
      WHERE payment_id = ${paymentId}::uuid AND route_id = 'base_to_stellar'
        AND burn_amount_atomic = ${reserved.burnAmountAtomic}::numeric
        AND max_fee_atomic = ${reserved.maxFeeAtomic}::numeric
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'authorized', updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
        AND route_id = 'base_to_stellar'
        AND status IN ('awaiting_confirmation', 'authorized')
      RETURNING id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, public_message, completed_at
      )
      SELECT id, 'base_cctp_owner_authorized', 'authorization', 'authorized', 'base',
        'The owner authorized the exact Base CCTP burn and fee limit.', now()
      FROM payment
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT id FROM payment
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base CCTP authorization changed concurrently");
  }
  return { sourceAddress: payment.source_address, ...reserved };
}

/** Persist the exact Base direct intent before the wallet signs it. */
export async function authorizeBaseDirectOperation(input: {
  readonly paymentId: string;
}): Promise<{ readonly sourceAddress: string; readonly recipientAddress: string; readonly amount: string }> {
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["base_to_base"]);
  if (!["awaiting_confirmation", "authorized"].includes(payment.status) ||
      typeof payment.source_address !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base direct payment is not ready for wallet authorization");
  }
  const amount = canonicalDatabaseDecimal(payment.expected_amount);
  const amountAtomic = decimalToBaseAtomic(amount);
  const rows = await sql`
    WITH operation AS (
      INSERT INTO base_cctp_operations (
        payment_id, route_id, status, expected_recipient_address, expected_amount_atomic
      ) VALUES (
        ${paymentId}::uuid, 'base_to_base', 'authorized',
        ${payment.recipient_address}, ${amountAtomic}::numeric
      )
      ON CONFLICT (payment_id) DO UPDATE SET status = 'authorized', updated_at = now()
      WHERE base_cctp_operations.route_id = 'base_to_base'
        AND lower(base_cctp_operations.expected_recipient_address) = lower(EXCLUDED.expected_recipient_address)
        AND base_cctp_operations.expected_amount_atomic = EXCLUDED.expected_amount_atomic
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'authorized', updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
        AND route_id = 'base_to_base'
        AND status IN ('awaiting_confirmation', 'authorized')
        AND lower(recipient_address) = lower(${payment.recipient_address})
        AND expected_recipient_amount = ${amount}::numeric
      RETURNING id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, public_message, completed_at
      )
      SELECT id, 'base_direct_owner_authorized', 'authorization', 'authorized', 'base',
        'The owner authorized the exact Base USDC recipient and amount.', now()
      FROM payment
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT id FROM payment
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base direct authorization changed concurrently");
  }
  return {
    sourceAddress: payment.source_address,
    recipientAddress: payment.recipient_address,
    amount,
  };
}

/** Atomically persist Base source/Circle evidence with the Payment timeline. */
export async function recordBaseCctpAttestation(input: {
  readonly paymentId: string;
  readonly sourceTransactionHash: string;
  readonly expectedRecipientAddress: string;
  readonly expectedRecipientAmount: string;
  readonly expectedAmountAtomic: string;
  readonly burnAmountAtomic: string;
  readonly maxFeeAtomic: string;
  readonly circle: Extract<CircleCctpStatus, { status: "complete" }>;
}): Promise<void> {
  const sql = getSqlClient();
  const rows = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id
      FROM payments p
      JOIN base_cctp_operations o ON o.payment_id = p.id
      WHERE p.id = ${input.paymentId}::uuid
        AND p.route_id = 'base_to_stellar'
        AND p.status IN ('authorized', 'submitted', 'source_confirmed', 'awaiting_attestation')
        AND p.recipient_address = ${input.expectedRecipientAddress}
        AND p.expected_recipient_amount = ${input.expectedRecipientAmount}::numeric
        AND (p.source_transaction_hash IS NULL
          OR p.source_transaction_hash = ${input.sourceTransactionHash})
        AND o.route_id = 'base_to_stellar'
        AND o.status IN ('authorized', 'source_submitted', 'source_confirmed', 'awaiting_attestation')
        AND o.burn_amount_atomic = ${input.burnAmountAtomic}::numeric
        AND o.max_fee_atomic = ${input.maxFeeAtomic}::numeric
        AND o.expected_recipient_address = ${input.expectedRecipientAddress}
        AND o.expected_amount_atomic = ${input.expectedAmountAtomic}::numeric
        AND (o.source_transaction_hash IS NULL
          OR o.source_transaction_hash = ${input.sourceTransactionHash})
        AND (o.circle_message_hash IS NULL
          OR o.circle_message_hash = ${input.circle.messageHash})
        AND (o.circle_attestation_hash IS NULL
          OR o.circle_attestation_hash = ${input.circle.attestationHash})
      FOR UPDATE OF p, o
    ), operation AS (
      UPDATE base_cctp_operations o SET
        status = 'awaiting_attestation',
        source_transaction_hash = ${input.sourceTransactionHash},
        circle_message_hash = ${input.circle.messageHash},
        circle_attestation_hash = ${input.circle.attestationHash},
        circle_message = ${input.circle.message},
        circle_attestation = ${input.circle.attestation}, updated_at = now()
      FROM eligible e WHERE o.payment_id = e.id
      RETURNING o.payment_id
    ), payment AS (
      UPDATE payments p SET status = 'awaiting_attestation',
        source_transaction_hash = ${input.sourceTransactionHash}, updated_at = now()
      FROM eligible e WHERE p.id = e.id
      RETURNING p.id
    ), events AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      )
      SELECT p.id, event.event_key, event.stage, event.status, 'base',
        ${input.sourceTransactionHash}, event.public_message, now()
      FROM payment p
      JOIN operation o ON o.payment_id = p.id
      CROSS JOIN (VALUES
        ('base_cctp_source_confirmed', 'source_confirmation', 'source_confirmed',
          'Base finalized the USDC burn. The payment is waiting for Circle attestation.'),
        ('base_cctp_attestation_ready', 'attestation', 'awaiting_attestation',
          'Circle completed the Base burn attestation. Stellar settlement is starting.')
      ) AS event(event_key, stage, status, public_message)
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT p.id FROM payment p JOIN operation o ON o.payment_id = p.id
  `;
  if (rows.length === 0) {
    throw new BaseCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Base CCTP payment changed while source evidence was being recorded",
    );
  }
}

/** Records Base -> Base only after a finalized exact USDC transfer is proven. */
export async function reconcileBaseDirectPayment(input: {
  readonly paymentId: string;
  readonly transactionHash: string;
  readonly rpc: BaseRpc;
}): Promise<{ readonly status: "pending" | "completed"; readonly transactionHash: string }> {
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["base_to_base"]);
  if (payment.status === "completed") {
    if (payment.destination_transaction_hash !== input.transactionHash.trim().toLowerCase()) {
      throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Payment was completed by a different Base transaction");
    }
    return { status: "completed", transactionHash: String(payment.destination_transaction_hash) };
  }
  if (!["authorized", "submitted", "destination_submitted"].includes(payment.status)) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base payment is not authorized for reconciliation");
  }
  if (payment.destination_transaction_hash &&
      payment.destination_transaction_hash !== input.transactionHash.trim().toLowerCase()) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "A different Base destination transaction is already recorded");
  }
  if (typeof payment.source_address !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base source wallet is missing");
  }
  const hash = input.transactionHash.trim().toLowerCase();
  const submitted = await sql`
    WITH operation AS (
      UPDATE base_cctp_operations SET status = 'destination_submitted',
        destination_transaction_hash = ${hash}, updated_at = now()
      WHERE payment_id = ${paymentId}::uuid AND route_id = 'base_to_base'
        AND status IN ('authorized', 'destination_submitted')
        AND (destination_transaction_hash IS NULL OR destination_transaction_hash = ${hash})
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'destination_submitted',
        destination_transaction_hash = ${hash}, updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
        AND route_id = 'base_to_base'
        AND status IN ('authorized', 'submitted', 'destination_submitted')
        AND (destination_transaction_hash IS NULL OR destination_transaction_hash = ${hash})
      RETURNING id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      )
      SELECT id, 'base_direct_submitted', 'destination_submission',
        'destination_submitted', 'base', ${hash},
        'The Base wallet submitted the USDC transfer. Finality and recipient verification are pending.', now()
      FROM payment
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT id FROM payment
  `;
  if (submitted.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base direct submission conflicts with persisted payment state");
  }
  const verification = await verifyBaseUsdcTransfer({
    rpc: input.rpc,
    txHash: hash,
    expectedSender: payment.source_address,
    expectedRecipient: payment.recipient_address,
    expectedAmount: String(payment.expected_amount),
  });
  if (verification.status === "pending") return { status: "pending", transactionHash: hash };
  if (verification.status !== "verified") {
    await recordBaseDirectVerificationFailure({
      paymentId,
      transactionHash: hash,
      reason: "The finalized Base transaction did not contain the exact authorized USDC transfer.",
    });
    throw new BaseCctpPersistenceError(
      "DESTINATION_MISMATCH",
      "Base did not finalize the exact USDC transfer to the expected recipient",
    );
  }
  const amountAtomic = decimalToBaseAtomic(verification.amount!);
  const completed = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id
      FROM payments p
      LEFT JOIN base_cctp_operations o ON o.payment_id = p.id
      WHERE p.id = ${paymentId}::uuid AND p.route_id = 'base_to_base'
        AND p.status IN ('authorized', 'submitted', 'destination_submitted', 'completed')
        AND lower(p.recipient_address) = lower(${verification.recipient})
        AND p.expected_recipient_amount = ${verification.amount}::numeric
        AND (p.destination_transaction_hash IS NULL OR p.destination_transaction_hash = ${hash})
        AND (o.payment_id IS NULL OR (
          o.route_id = 'base_to_base'
          AND lower(o.expected_recipient_address) = lower(${verification.recipient})
          AND o.expected_amount_atomic = ${amountAtomic}::numeric
          AND (o.destination_transaction_hash IS NULL OR o.destination_transaction_hash = ${hash})
        ))
      FOR UPDATE OF p
    ), operation AS (
      INSERT INTO base_cctp_operations (
        payment_id, route_id, status, destination_transaction_hash,
        expected_recipient_address, expected_amount_atomic,
        verified_recipient_address, verified_amount_atomic, verified_at
      )
      SELECT id, 'base_to_base', 'completed', ${hash},
        ${verification.recipient}, ${amountAtomic}::numeric,
        ${verification.recipient}, ${amountAtomic}::numeric, now()
      FROM eligible
      WHERE true
      ON CONFLICT (payment_id) DO UPDATE SET
        status = 'completed', destination_transaction_hash = EXCLUDED.destination_transaction_hash,
        verified_recipient_address = EXCLUDED.verified_recipient_address,
        verified_amount_atomic = EXCLUDED.verified_amount_atomic,
        verified_at = COALESCE(base_cctp_operations.verified_at, now()), updated_at = now()
      WHERE base_cctp_operations.route_id = 'base_to_base'
        AND lower(base_cctp_operations.expected_recipient_address) = lower(EXCLUDED.expected_recipient_address)
        AND base_cctp_operations.expected_amount_atomic = EXCLUDED.expected_amount_atomic
        AND (base_cctp_operations.destination_transaction_hash IS NULL
          OR base_cctp_operations.destination_transaction_hash = EXCLUDED.destination_transaction_hash)
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'completed',
        destination_transaction_hash = ${hash},
        verified_recipient_address = ${verification.recipient},
        verified_recipient_amount = ${verification.amount}::numeric,
        recipient_verified_at = COALESCE(recipient_verified_at, now()), updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
        AND route_id = 'base_to_base'
        AND lower(recipient_address) = lower(${verification.recipient})
        AND expected_recipient_amount = ${verification.amount}::numeric
        AND status IN ('authorized', 'submitted', 'destination_submitted', 'completed')
        AND (destination_transaction_hash IS NULL OR destination_transaction_hash = ${hash})
      RETURNING id
    ), events AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      )
      SELECT payment.id, event.event_key, event.stage, event.status, 'base', ${hash},
        event.public_message, now()
      FROM payment
      CROSS JOIN (VALUES
        ('base_direct_destination_confirmed', 'destination_confirmation', 'destination_confirmed', 'Base Sepolia finalized the USDC transfer.'),
        ('base_direct_recipient_verified', 'recipient_verification', 'recipient_verified', 'The finalized Base transfer matches the expected recipient and USDC amount.'),
        ('base_direct_completed', 'completion', 'completed', 'The recipient received the verified USDC amount on Base.')
      ) AS event(event_key, stage, status, public_message)
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT payment.id FROM payment JOIN operation ON operation.payment_id = payment.id
  `;
  if (completed.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base payment changed while destination verification was being recorded");
  }
  return { status: "completed", transactionHash: hash };
}

async function persistCompletedBaseToStellarOperation(input: {
  readonly sql: ReturnType<typeof getSqlClient>;
  readonly paymentId: string;
  readonly destinationTransactionHash: string;
  readonly recipientAddress: string;
  readonly amountAtomic: string;
}): Promise<void> {
  const persisted = await input.sql`
    UPDATE base_cctp_operations SET status = 'completed',
      destination_transaction_hash = ${input.destinationTransactionHash},
      verified_recipient_address = ${input.recipientAddress},
      verified_amount_atomic = ${input.amountAtomic}::numeric,
      verified_at = COALESCE(verified_at, now()), updated_at = now()
    WHERE payment_id = ${input.paymentId}::uuid AND route_id = 'base_to_stellar'
      AND expected_recipient_address = ${input.recipientAddress}
      AND expected_amount_atomic = ${input.amountAtomic}::numeric
      AND (destination_transaction_hash IS NULL
        OR destination_transaction_hash = ${input.destinationTransactionHash})
    RETURNING payment_id
  `;
  if (persisted.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Completed Stellar settlement conflicts with persisted Base CCTP state");
  }
}

/** Confirms a Base burn, records Circle evidence, then delegates Stellar settlement to ST-04. */
export async function reconcileBaseToStellarCctp(input: {
  readonly paymentId: string;
  readonly sourceTransactionHash: string;
  readonly rpc: BaseRpc;
  readonly stellarRpc?: Pick<rpc.Server, "getTransaction">;
}): Promise<{
  readonly status: "pending" | "in_progress" | "completed";
  readonly sourceTransactionHash?: string;
  readonly destinationTransactionHash?: string;
}> {
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["base_to_stellar"]);
  if (payment.status === "completed") {
    if (
      typeof payment.destination_transaction_hash === "string" &&
      typeof payment.verified_recipient_address === "string" &&
      typeof payment.verified_recipient_amount === "string"
    ) {
      const verifiedAtomic = normalizeStellarUsdcAmount(payment.verified_recipient_amount).raw.toString();
      const persisted = await sql`
        UPDATE base_cctp_operations SET status = 'completed',
          destination_transaction_hash = ${payment.destination_transaction_hash},
          verified_recipient_address = ${payment.verified_recipient_address},
          verified_amount_atomic = ${verifiedAtomic}::numeric,
          verified_at = COALESCE(verified_at, now()), updated_at = now()
        WHERE payment_id = ${paymentId}::uuid
          AND route_id = 'base_to_stellar'
          AND (destination_transaction_hash IS NULL
            OR destination_transaction_hash = ${payment.destination_transaction_hash})
        RETURNING payment_id
      `;
      if (persisted.length === 0) {
        throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Completed Stellar settlement conflicts with persisted Base CCTP state");
      }
    } else {
      throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Completed Stellar settlement is missing verified destination evidence");
    }
    return {
      status: "completed",
      destinationTransactionHash: String(payment.destination_transaction_hash ?? ""),
    };
  }
  if (!["authorized", "submitted", "source_confirmed", "awaiting_attestation", "destination_submitted"].includes(payment.status)) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base-to-Stellar payment is not awaiting source reconciliation");
  }
  if (typeof payment.source_address !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base source wallet is missing");
  }
  if (payment.source_transaction_hash &&
      payment.source_transaction_hash !== input.sourceTransactionHash.trim().toLowerCase()) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "A different Base source burn is already recorded");
  }
  const operations = await sql`
    SELECT burn_amount_atomic::text AS burn_amount,
      max_fee_atomic::text AS max_fee, status, source_transaction_hash,
      circle_message, circle_attestation, expected_recipient_address,
      expected_amount_atomic::text AS expected_amount_atomic
    FROM base_cctp_operations WHERE payment_id = ${paymentId}::uuid
  `;
  const operation = operations[0] as Record<string, unknown> | undefined;
  if (typeof operation?.burn_amount !== "string" || typeof operation.max_fee !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base CCTP burn amount and max fee must be reserved before signing");
  }
  const sourceHash = input.sourceTransactionHash.trim().toLowerCase();
  const stellarConfig = stellarCctpConfigFromEnvironment();
  const atomic = normalizeStellarUsdcAmount(String(payment.expected_amount)).raw.toString();
  if (payment.status === "destination_submitted") {
    if (operation.status !== "awaiting_attestation" ||
        operation.source_transaction_hash !== sourceHash ||
        operation.expected_recipient_address !== payment.recipient_address ||
        operation.expected_amount_atomic !== atomic ||
        typeof operation.circle_message !== "string" ||
        typeof operation.circle_attestation !== "string") {
      throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Saved CCTP destination evidence does not match this payment");
    }
    const resumed = await settleBaseToStellarCctp({
      paymentId,
      sourceTransactionHash: sourceHash.slice(2),
      message: operation.circle_message,
      attestation: operation.circle_attestation,
      rpc: input.stellarRpc ?? new rpc.Server(stellarConfig.rpcUrl),
      config: stellarConfig,
    });
    if (resumed.status === "completed") {
      if (!resumed.destinationTransactionHash) {
        throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Completed Stellar settlement has no destination hash");
      }
      await persistCompletedBaseToStellarOperation({
        sql, paymentId, destinationTransactionHash: resumed.destinationTransactionHash,
        recipientAddress: payment.recipient_address, amountAtomic: atomic,
      });
    }
    return resumed.status === "completed"
      ? resumed
      : { ...resumed, sourceTransactionHash: sourceHash };
  }
  const submitted = await sql`
    WITH operation AS (
      UPDATE base_cctp_operations SET status = CASE
          WHEN status = 'authorized' THEN 'source_submitted' ELSE status END,
        source_transaction_hash = ${sourceHash}, updated_at = now()
      WHERE payment_id = ${paymentId}::uuid AND route_id = 'base_to_stellar'
        AND status IN ('authorized', 'source_submitted', 'source_confirmed', 'awaiting_attestation')
        AND (source_transaction_hash IS NULL OR source_transaction_hash = ${sourceHash})
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = CASE
          WHEN status = 'authorized' THEN 'submitted' ELSE status END,
        source_transaction_hash = ${sourceHash}, updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
        AND route_id = 'base_to_stellar'
        AND status IN ('authorized', 'submitted', 'source_confirmed', 'awaiting_attestation')
        AND (source_transaction_hash IS NULL OR source_transaction_hash = ${sourceHash})
      RETURNING id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      )
      SELECT id, 'base_cctp_submitted', 'source_submission', 'submitted', 'base',
        ${sourceHash}, 'The Base wallet submitted the Circle USDC burn. Finality is pending.', now()
      FROM payment
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT id FROM payment
  `;
  if (submitted.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base CCTP submission conflicts with persisted payment state");
  }
  const verification = await verifyBaseCctpSource({
    rpc: input.rpc,
    sourceTransactionHash: input.sourceTransactionHash,
    sourceAddress: payment.source_address,
    burnAmount: atomicToDecimal(String(operation.burn_amount), 6),
    maxFee: atomicToDecimal(String(operation.max_fee), 6),
    expectedRecipientAmount: String(payment.expected_amount),
    expectedRecipientAddress: payment.recipient_address,
    expectedMintRecipient: stellarConfig.forwarder,
    expectedDestinationTokenMessenger: stellarConfig.tokenMessenger,
  });
  if (verification.status === "pending") {
    return { status: "pending", sourceTransactionHash: sourceHash };
  }
  if (verification.status !== "verified") {
    await recordBaseCctpSourceVerificationFailure({
      paymentId,
      transactionHash: sourceHash,
      reason: verification.reason,
    });
    throw new BaseCctpPersistenceError(
      "DESTINATION_MISMATCH",
      verification.reason,
    );
  }
  await recordBaseCctpAttestation({
    paymentId,
    sourceTransactionHash: verification.sourceTransactionHash,
    expectedRecipientAddress: payment.recipient_address,
    expectedRecipientAmount: String(payment.expected_amount),
    expectedAmountAtomic: atomic,
    burnAmountAtomic: String(operation.burn_amount),
    maxFeeAtomic: String(operation.max_fee),
    circle: verification.circle,
  });
  const result = await settleBaseToStellarCctp({
    paymentId,
    sourceTransactionHash: verification.sourceTransactionHash.replace(/^0x/, ""),
    message: verification.circle.message,
    attestation: verification.circle.attestation,
    rpc: input.stellarRpc ?? new rpc.Server(stellarConfig.rpcUrl),
    config: stellarConfig,
  });
  if (result.status === "completed") {
    if (!result.destinationTransactionHash) {
      throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Completed Stellar settlement has no destination hash");
    }
    await persistCompletedBaseToStellarOperation({
      sql, paymentId, destinationTransactionHash: result.destinationTransactionHash,
      recipientAddress: payment.recipient_address, amountAtomic: atomic,
    });
  }
  return result.status === "completed"
    ? result
    : { ...result, sourceTransactionHash: sourceHash };
}

export interface PreparedBaseCctpDestination {
  readonly status: "pending" | "in_progress" | "completed";
  readonly destinationTransactionHash?: string;
  readonly sourceTransactionHash?: string;
}

/** Reconciles Stellar source finality and Circle's forwarded Base mint. */
export async function prepareStellarToBaseCctpDestination(input: {
  readonly paymentId: string;
  readonly stellarSourceTransactionHash: string;
  readonly stellarRpc: Pick<rpc.Server, "getTransaction">;
  readonly config?: ReturnType<typeof stellarCctpConfigFromEnvironment>;
  readonly fetchCircle?: typeof getCircleCctpStatus;
  readonly baseRpc: BaseRpc;
}): Promise<PreparedBaseCctpDestination> {
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["stellar_to_base"]);
  const rows = await sql`
    SELECT burn_amount_atomic::text AS burn_amount,
      max_fee_atomic::text AS max_fee, status, source_transaction_hash,
      circle_message, circle_attestation, submission_lease_expires_at,
      destination_transaction_hash
    FROM base_cctp_operations
    WHERE payment_id = ${paymentId}::uuid
  `;
  const operation = rows[0] as Record<string, unknown> | undefined;
  if (!operation || typeof operation.burn_amount !== "string" || typeof operation.max_fee !== "string") {
    throw new BaseCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Stellar-to-Base CCTP requires server-approved burn amount and fee limits before signing",
    );
  }
  if (operation.status === "completed" && typeof operation.destination_transaction_hash === "string") {
    return {
      status: "completed",
      sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
      destinationTransactionHash: operation.destination_transaction_hash,
    };
  }
  if (typeof operation.destination_transaction_hash === "string") {
    try {
      await recordStellarToBaseDestinationSubmitted({
        paymentId,
        destinationTransactionHash: operation.destination_transaction_hash,
        rpc: input.baseRpc,
      });
    } catch (error) {
      if (error instanceof BaseCctpPersistenceError && error.code === "SUBMISSION_FAILED") {
        return {
          status: "pending",
          sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
          destinationTransactionHash: operation.destination_transaction_hash,
        };
      }
      throw error;
    }
    return reconcileStellarToBaseDestination({
      paymentId,
      destinationTransactionHash: operation.destination_transaction_hash,
      rpc: input.baseRpc,
    });
  }
  if (typeof operation.source_transaction_hash === "string" &&
      operation.source_transaction_hash !== input.stellarSourceTransactionHash.trim().toLowerCase()) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "A different Stellar source burn is already reserved");
  }
  const config = input.config ?? stellarCctpConfigFromEnvironment();
  const source = await reconcileStellarCctpSource({
    paymentId,
    transactionHash: input.stellarSourceTransactionHash,
    burnAmount: atomicToDecimal(String(operation.burn_amount), 7),
    maxFee: atomicToDecimal(String(operation.max_fee), 7),
    rpc: input.stellarRpc,
    config,
  });
  if (source.status === "pending") {
    return {
      status: "pending",
      sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
    };
  }
  const circle = await (input.fetchCircle ?? getCircleCctpStatus)({
    sourceDomain: CCTP_STELLAR_DOMAIN,
    sourceTransactionHash: input.stellarSourceTransactionHash,
  });
  if (circle.status === "pending") {
    await sql`
      UPDATE base_cctp_operations SET status = 'awaiting_attestation',
        source_transaction_hash = ${input.stellarSourceTransactionHash.trim().toLowerCase()},
        updated_at = now()
      WHERE payment_id = ${paymentId}::uuid
        AND route_id = 'stellar_to_base'
        AND status IN ('authorized', 'source_confirmed', 'awaiting_attestation')
        AND (source_transaction_hash IS NULL OR source_transaction_hash = ${input.stellarSourceTransactionHash.trim().toLowerCase()})
    `;
    return {
      status: "pending",
      sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
    };
  }
  const parsed = parseCctpMessage(circle.message);
  const expectedRecipient = `0x${requireEvmAddress(payment.recipient_address, "recipient").slice(2).padStart(64, "0")}`;
  const burnAmount = BigInt(operation.burn_amount);
  const maxFee = BigInt(operation.max_fee);
  if (typeof payment.source_address !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Stellar source wallet is missing");
  }
  let expectedSender: string;
  let expectedBurnToken: string;
  let expectedMessageSender: string;
  try {
    expectedSender = stellarContractAsBytes32(config.tokenMessenger);
    expectedBurnToken = stellarContractAsBytes32(config.usdcContract);
    expectedMessageSender = stellarContractAsBytes32(payment.source_address);
  } catch {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Stellar CCTP source contracts or wallet are invalid");
  }
  const expectedRecipientAmount = normalizeBaseUsdcAmount(String(payment.expected_amount));
  const netStellarAtomic = parsed.amount - parsed.feeExecuted;
  if (
    parsed.sourceDomain !== CCTP_STELLAR_DOMAIN ||
    parsed.destinationDomain !== CCTP_BASE_DOMAIN ||
    parsed.sender.toLowerCase() !== expectedSender ||
    parsed.recipient.toLowerCase() !== baseAddressAsBytes32(BASE_SEPOLIA_TOKEN_MESSENGER) ||
    parsed.burnToken.toLowerCase() !== expectedBurnToken ||
    parsed.messageSender.toLowerCase() !== expectedMessageSender ||
    parsed.nonce === CCTP_V2_EMPTY_NONCE ||
    parsed.minFinalityThreshold !== CCTP_STANDARD_FINALITY_THRESHOLD ||
    parsed.finalityThresholdExecuted < CCTP_STANDARD_FINALITY_THRESHOLD ||
    parsed.mintRecipient.toLowerCase() !== expectedRecipient ||
    parsed.amount !== burnAmount ||
    parsed.maxFee !== maxFee ||
    parsed.feeExecuted > maxFee ||
    netStellarAtomic <= 0n ||
    netStellarAtomic % 10n !== 0n ||
    netStellarAtomic / 10n !== expectedRecipientAmount ||
    parsed.destinationCaller !== `0x${"0".repeat(64)}` ||
    parsed.hookData !== `0x${"636374702d666f72776172640000000000000000000000000000000000000000"}`
  ) {
    throw new BaseCctpPersistenceError(
      "DESTINATION_MISMATCH",
      "Circle attestation does not match the persisted Stellar burn intent",
    );
  }
  // Circle can attest the source before its forwarding worker broadcasts the
  // Base mint. Keep the same burn pending; do not request a user-submitted mint.
  if (!circle.forwardTransactionHash) {
    return {
      status: "pending",
      sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
    };
  }
  const leaseId = randomUUID();
  const reserved = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id FROM payments p
      JOIN base_cctp_operations o ON o.payment_id = p.id
      WHERE p.id = ${paymentId}::uuid AND p.route_id = 'stellar_to_base'
        AND p.status IN ('source_confirmed', 'awaiting_attestation')
        AND o.route_id = 'stellar_to_base'
        AND o.status IN ('authorized', 'source_confirmed', 'awaiting_attestation', 'destination_prepared')
        AND (o.status <> 'destination_prepared' OR o.submission_lease_expires_at IS NULL
          OR o.submission_lease_expires_at <= now())
        AND (o.source_transaction_hash IS NULL
          OR o.source_transaction_hash = ${input.stellarSourceTransactionHash.trim().toLowerCase()})
        AND (o.circle_message_hash IS NULL OR o.circle_message_hash = ${circle.messageHash})
      FOR UPDATE OF p, o
    ), operation AS (
      UPDATE base_cctp_operations SET status = 'destination_prepared',
      source_transaction_hash = ${input.stellarSourceTransactionHash.trim().toLowerCase()},
      circle_message_hash = ${circle.messageHash}, circle_attestation_hash = ${circle.attestationHash},
      circle_message = ${circle.message}, circle_attestation = ${circle.attestation},
      destination_transaction_hash = ${circle.forwardTransactionHash},
      submission_lease_id = ${leaseId}::uuid,
      submission_lease_expires_at = now() + interval '60 seconds', updated_at = now()
      WHERE payment_id IN (SELECT id FROM eligible)
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'awaiting_attestation', updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
      RETURNING id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      ) SELECT payment.id, 'stellar_cctp_attestation_ready', 'attestation',
        'awaiting_attestation', 'stellar', ${input.stellarSourceTransactionHash.trim().toLowerCase()},
        'Circle completed the Stellar burn attestation and forwarded the Base mint for verification.', now()
      FROM payment ON CONFLICT (payment_id, event_key) DO NOTHING
    )
    SELECT id FROM payment
  `;
  if (reserved.length === 0) {
    return {
      status: "in_progress",
      sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
      destinationTransactionHash: circle.forwardTransactionHash,
    };
  }
  try {
    await recordStellarToBaseDestinationSubmitted({
      paymentId,
      destinationTransactionHash: circle.forwardTransactionHash,
      rpc: input.baseRpc,
    });
  } catch (error) {
    if (error instanceof BaseCctpPersistenceError && error.code === "SUBMISSION_FAILED") {
      return {
        status: "pending",
        sourceTransactionHash: input.stellarSourceTransactionHash.trim().toLowerCase(),
        destinationTransactionHash: circle.forwardTransactionHash,
      };
    }
    throw error;
  }
  return reconcileStellarToBaseDestination({
    paymentId,
    destinationTransactionHash: circle.forwardTransactionHash,
    rpc: input.baseRpc,
  });
}

export async function recordStellarToBaseDestinationSubmitted(input: {
  readonly paymentId: string;
  readonly destinationTransactionHash: string;
  readonly rpc: BaseRpc;
}): Promise<void> {
  const paymentId = requirePaymentId(input.paymentId);
  const hash = input.destinationTransactionHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    throw new BaseCctpPersistenceError("SUBMISSION_FAILED", "Invalid Base destination transaction hash");
  }
  const { sql, payment } = await getPaymentOperation(paymentId, ["stellar_to_base"]);
  if (payment.status === "completed") {
    if (payment.destination_transaction_hash !== hash) {
      throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Payment was completed by a different Base transaction");
    }
    return;
  }
  if (!["source_confirmed", "awaiting_attestation", "destination_submitted"].includes(payment.status)) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Stellar-to-Base payment is not ready for destination submission");
  }
  if (payment.destination_transaction_hash && payment.destination_transaction_hash !== hash) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "A different Base destination transaction is already recorded");
  }
  const evidence = await sql`
    SELECT circle_message, circle_attestation
    FROM base_cctp_operations
    WHERE payment_id = ${paymentId}::uuid AND route_id = 'stellar_to_base'
      AND status IN ('destination_prepared', 'destination_submitted')
  `;
  const operationEvidence = evidence[0] as Record<string, unknown> | undefined;
  if (typeof operationEvidence?.circle_message !== "string" ||
      typeof operationEvidence.circle_attestation !== "string") {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base destination has no reserved Circle attestation");
  }
  const transaction = await input.rpc.request<BaseTransaction | null>("eth_getTransactionByHash", [hash]);
  if (!transaction) {
    throw new BaseCctpPersistenceError("SUBMISSION_FAILED", "Base destination transaction is not yet visible on the network");
  }
  if (transaction.hash.toLowerCase() !== hash ||
      transaction.to?.toLowerCase() !== BASE_SEPOLIA_MESSAGE_TRANSMITTER.toLowerCase() ||
      transaction.input.toLowerCase() !== encodeCctpReceiveMessage(
        operationEvidence.circle_message,
        operationEvidence.circle_attestation,
      ).toLowerCase()) {
    throw new BaseCctpPersistenceError("DESTINATION_MISMATCH", "Base destination transaction does not submit the reserved Circle mint");
  }
  const reserved = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id FROM payments p
      JOIN base_cctp_operations o ON o.payment_id = p.id
      WHERE p.id = ${paymentId}::uuid AND p.route_id = 'stellar_to_base'
        AND p.status IN ('source_confirmed', 'awaiting_attestation', 'destination_submitted')
        AND (p.destination_transaction_hash IS NULL OR p.destination_transaction_hash = ${hash})
        AND o.route_id = 'stellar_to_base'
        AND o.status IN ('destination_prepared', 'destination_submitted')
        AND (o.destination_transaction_hash IS NULL OR o.destination_transaction_hash = ${hash})
        AND o.circle_message IS NOT NULL AND o.circle_attestation IS NOT NULL
      FOR UPDATE OF p, o
    ), operation AS (
      UPDATE base_cctp_operations SET status = 'destination_submitted',
      destination_transaction_hash = ${hash}, submission_lease_id = NULL,
      submission_lease_expires_at = NULL, updated_at = now()
      WHERE payment_id IN (SELECT id FROM eligible)
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'destination_submitted',
        destination_transaction_hash = ${hash}, updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
      RETURNING id
    ), event AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      ) SELECT payment.id, 'base_cctp_destination_submitted', 'destination_submission',
        'destination_submitted', 'base', ${hash},
        'The Base wallet submitted the Circle CCTP mint transaction.', now()
      FROM payment ON CONFLICT (payment_id, event_key) DO NOTHING
    )
    SELECT id FROM payment
  `;
  if (reserved.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base destination has no matching attestation reservation");
  }
}

/** Destination receipt is the only path that completes Stellar -> Base. */
export async function reconcileStellarToBaseDestination(input: {
  readonly paymentId: string;
  readonly destinationTransactionHash: string;
  readonly rpc: BaseRpc;
}): Promise<{ readonly status: "pending" | "completed"; readonly destinationTransactionHash: string }> {
  const paymentId = requirePaymentId(input.paymentId);
  const { sql, payment } = await getPaymentOperation(paymentId, ["stellar_to_base"]);
  if (!["source_confirmed", "awaiting_attestation", "destination_submitted", "completed"].includes(payment.status)) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Stellar-to-Base payment is not awaiting destination verification");
  }
  const hash = input.destinationTransactionHash.trim().toLowerCase();
  const rows = await sql`
    SELECT status, source_transaction_hash, circle_message, circle_attestation,
      destination_transaction_hash
    FROM base_cctp_operations WHERE payment_id = ${paymentId}::uuid
  `;
  const operation = rows[0] as Record<string, unknown> | undefined;
  if (!operation || typeof operation.circle_message !== "string" ||
      typeof operation.circle_attestation !== "string" ||
      !["destination_submitted", "destination_confirmed", "recipient_verified", "completed"].includes(String(operation.status))) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base destination mint has no persisted Circle attestation reservation");
  }
  if (typeof operation.destination_transaction_hash !== "string" || operation.destination_transaction_hash !== hash) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "A different Base destination transaction is already reserved");
  }
  if (payment.status === "completed") {
    if (payment.destination_transaction_hash !== hash) {
      throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Payment was completed by a different Base transaction");
    }
    return { status: "completed", destinationTransactionHash: hash };
  }
  const verification = await verifyBaseCctpMint({
    rpc: input.rpc,
    txHash: hash,
    message: operation.circle_message,
    attestation: operation.circle_attestation,
    expectedRecipient: payment.recipient_address,
    expectedAmount: String(payment.expected_amount),
  });
  if (verification.status === "pending") return { status: "pending", destinationTransactionHash: hash };
  if (verification.status !== "verified") {
    await recordStellarToBaseDestinationVerificationFailure({
      paymentId,
      transactionHash: hash,
      reason: "The finalized Base mint did not deliver the exact expected USDC recipient and amount.",
    });
    throw new BaseCctpPersistenceError(
      "DESTINATION_MISMATCH",
      "Base did not finalize the exact CCTP USDC mint to the expected recipient",
    );
  }
  const amountAtomic = decimalToBaseAtomic(verification.amount!);
  const completed = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id
      FROM payments p
      JOIN base_cctp_operations o ON o.payment_id = p.id
      WHERE p.id = ${paymentId}::uuid AND p.route_id = 'stellar_to_base'
        AND p.status IN ('source_confirmed', 'awaiting_attestation', 'destination_submitted',
          'destination_confirmed', 'recipient_verified', 'completed')
        AND lower(p.recipient_address) = lower(${verification.recipient})
        AND p.expected_recipient_amount = ${verification.amount}::numeric
        AND (p.destination_transaction_hash IS NULL OR p.destination_transaction_hash = ${hash})
        AND o.route_id = 'stellar_to_base'
        AND o.status IN ('destination_prepared', 'destination_submitted', 'destination_confirmed', 'recipient_verified', 'completed')
        AND o.destination_transaction_hash = ${hash}
        AND lower(o.expected_recipient_address) = lower(${verification.recipient})
        AND o.expected_amount_atomic = ${amountAtomic}::numeric
      FOR UPDATE OF p, o
    ), operation AS (
      UPDATE base_cctp_operations SET status = 'completed',
        destination_transaction_hash = ${hash},
        verified_recipient_address = ${verification.recipient},
        verified_amount_atomic = ${amountAtomic}::numeric, verified_at = now(),
        submission_lease_id = NULL, submission_lease_expires_at = NULL, updated_at = now()
      WHERE payment_id IN (SELECT id FROM eligible)
        AND route_id = 'stellar_to_base'
        AND status IN ('destination_prepared', 'destination_submitted', 'destination_confirmed', 'recipient_verified', 'completed')
        AND destination_transaction_hash = ${hash}
      RETURNING payment_id
    ), payment AS (
      UPDATE payments SET status = 'completed',
        destination_transaction_hash = ${hash},
        verified_recipient_address = ${verification.recipient},
        verified_recipient_amount = ${verification.amount}::numeric,
        recipient_verified_at = COALESCE(recipient_verified_at, now()), updated_at = now()
      WHERE id IN (SELECT payment_id FROM operation)
        AND route_id = 'stellar_to_base'
        AND lower(recipient_address) = lower(${verification.recipient})
        AND expected_recipient_amount = ${verification.amount}::numeric
        AND status IN ('source_confirmed', 'awaiting_attestation', 'destination_submitted',
          'destination_confirmed', 'recipient_verified', 'completed')
        AND (destination_transaction_hash IS NULL OR destination_transaction_hash = ${hash})
      RETURNING id
    ), events AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      )
      SELECT payment.id, event.event_key, event.stage, event.status, 'base', ${hash},
        event.public_message, now()
      FROM payment
      CROSS JOIN (VALUES
        ('base_cctp_destination_confirmed', 'destination_confirmation', 'destination_confirmed', 'Base finalized the CCTP destination transaction.'),
        ('base_cctp_recipient_verified', 'recipient_verification', 'recipient_verified', 'The finalized Base mint matches the exact recipient and USDC amount.'),
        ('base_cctp_completed', 'completion', 'completed', 'The recipient received the verified USDC amount on Base.')
      ) AS event(event_key, stage, status, public_message)
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT payment.id FROM payment JOIN operation ON operation.payment_id = payment.id
  `;
  if (completed.length === 0) {
    throw new BaseCctpPersistenceError("INVALID_PAYMENT_STATE", "Base CCTP payment changed while destination verification was being recorded");
  }
  return { status: "completed", destinationTransactionHash: hash };
}
