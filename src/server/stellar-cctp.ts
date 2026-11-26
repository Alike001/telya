import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  BASE_FEE,
  Keypair,
  TransactionBuilder,
  rpc,
} from "@stellar/stellar-sdk";

import { getSqlClient } from "../../server/db/client.ts";
import {
  buildMintAndForwardTransaction,
  stellarCctpConfigFromEnvironment,
  verifyBaseToStellarDestination,
  verifyStellarCctpBurn,
  type StellarCctpConfig,
} from "../stellar/cctp.ts";
import { normalizeStellarUsdcAmount } from "../stellar/usdc.ts";

const DEFAULT_MAX_RESOURCE_FEE_STROOPS = 1_000_000n;

export class StellarCctpPersistenceError extends Error {
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
    this.name = "StellarCctpPersistenceError";
  }
}

function sha256HexBytes(value: string, label: string): string {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      `${label} must be non-empty hexadecimal bytes`,
    );
  }
  return createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}

function requirePaymentId(paymentId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    throw new StellarCctpPersistenceError("PAYMENT_NOT_FOUND", "Invalid payment ID");
  }
  return paymentId.toLowerCase();
}

function maxResourceFee(environment: NodeJS.ProcessEnv): bigint {
  try {
    const value = environment.STELLAR_RELAYER_MAX_RESOURCE_FEE_STROOPS
      ? BigInt(environment.STELLAR_RELAYER_MAX_RESOURCE_FEE_STROOPS)
      : DEFAULT_MAX_RESOURCE_FEE_STROOPS;
    if (value < 0n) throw new Error("negative");
    return value;
  } catch {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "The Stellar CCTP fee ceiling is invalid",
    );
  }
}

export interface PreparedStellarCctpDestination {
  readonly transactionHash: string;
  readonly envelopeXdr: string;
}

export async function prepareStellarCctpMintAndForward(input: {
  readonly message: string;
  readonly attestation: string;
  readonly config?: StellarCctpConfig;
  readonly environment?: NodeJS.ProcessEnv;
}): Promise<PreparedStellarCctpDestination> {
  const environment = input.environment ?? process.env;
  const config = input.config ?? stellarCctpConfigFromEnvironment(environment);
  const sponsorSecret = environment.STELLAR_FEE_SPONSOR_SECRET?.trim();
  if (!sponsorSecret) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "The Stellar destination submitter is not configured",
    );
  }
  let sponsor: Keypair;
  try {
    sponsor = Keypair.fromSecret(sponsorSecret);
  } catch (error) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "The Stellar destination submitter is invalid",
      { cause: error },
    );
  }
  const server = new rpc.Server(config.rpcUrl);
  const source = await server.getAccount(sponsor.publicKey());
  const transaction = buildMintAndForwardTransaction({
    config,
    source,
    message: input.message,
    attestation: input.attestation,
    fee: BASE_FEE,
  });
  const simulation = await server.simulateTransaction(transaction);
  if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation)) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "Stellar rejected the CCTP mint-and-forward simulation",
    );
  }
  if (BigInt(simulation.minResourceFee) > maxResourceFee(environment)) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "The CCTP destination operation exceeds the fee ceiling",
    );
  }
  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  prepared.sign(sponsor);
  return {
    transactionHash: prepared.hash().toString("hex"),
    envelopeXdr: prepared.toXDR(),
  };
}

export async function submitPreparedStellarCctpMintAndForward(input: {
  readonly prepared: PreparedStellarCctpDestination;
  readonly config?: StellarCctpConfig;
}): Promise<{ readonly transactionHash: string; readonly ledger: number }> {
  const config = input.config ?? stellarCctpConfigFromEnvironment();
  const transaction = TransactionBuilder.fromXDR(
    input.prepared.envelopeXdr,
    config.networkPassphrase,
  );
  const transactionHash = transaction.hash().toString("hex");
  if (transactionHash !== input.prepared.transactionHash) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "The stored Stellar destination transaction hash does not match its envelope",
    );
  }
  const server = new rpc.Server(config.rpcUrl);
  const sent = await server.sendTransaction(transaction);
  if (sent.status === "ERROR") {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "Stellar rejected the CCTP destination operation",
    );
  }
  if (sent.hash.toLowerCase() !== transactionHash) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      "Stellar returned an unexpected destination transaction hash",
    );
  }
  const result = await server.pollTransaction(transactionHash, { attempts: 20 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new StellarCctpPersistenceError(
      "SUBMISSION_FAILED",
      result.status === rpc.Api.GetTransactionStatus.FAILED
        ? "The CCTP destination operation failed on Stellar"
        : "The CCTP destination operation confirmation timed out",
    );
  }
  return { transactionHash, ledger: result.ledger };
}

/** Persist a verified Stellar burn only when the Payment can move with it. */
export async function recordStellarCctpSource(input: {
  readonly paymentId: string;
  readonly transactionHash: string;
  readonly sourceLedger: number;
  readonly recipientAddress: string;
  readonly expectedRecipientAmount: string;
  readonly expectedAmountAtomic: string;
}): Promise<void> {
  const sql = getSqlClient();
  const rows = await sql`
    WITH eligible AS MATERIALIZED (
      SELECT p.id
      FROM payments p
      WHERE p.id = ${input.paymentId}::uuid
        AND p.route_id = 'stellar_to_base'
        AND p.status IN ('authorized', 'submitted', 'source_confirmed')
        AND lower(p.recipient_address) = lower(${input.recipientAddress})
        AND p.expected_recipient_amount = ${input.expectedRecipientAmount}::numeric
        AND (p.source_transaction_hash IS NULL
          OR p.source_transaction_hash = ${input.transactionHash})
      FOR UPDATE OF p
    ), operation AS (
      INSERT INTO stellar_cctp_operations (
        payment_id, route_id, status, source_transaction_hash, source_ledger,
        expected_recipient_address, expected_amount_atomic
      )
      SELECT e.id, 'stellar_to_base', 'source_confirmed',
        ${input.transactionHash}, ${input.sourceLedger}, ${input.recipientAddress},
        ${input.expectedAmountAtomic}::numeric
      FROM eligible e WHERE true
      ON CONFLICT (payment_id) DO UPDATE SET
        source_transaction_hash = EXCLUDED.source_transaction_hash,
        source_ledger = EXCLUDED.source_ledger,
        status = CASE
          WHEN stellar_cctp_operations.status = 'source_confirmed'
            THEN 'source_confirmed'
          ELSE stellar_cctp_operations.status
        END,
        updated_at = now()
      WHERE stellar_cctp_operations.route_id = 'stellar_to_base'
        AND lower(stellar_cctp_operations.expected_recipient_address) =
          lower(EXCLUDED.expected_recipient_address)
        AND stellar_cctp_operations.expected_amount_atomic = EXCLUDED.expected_amount_atomic
        AND (stellar_cctp_operations.source_transaction_hash IS NULL
          OR stellar_cctp_operations.source_transaction_hash = EXCLUDED.source_transaction_hash)
        AND (stellar_cctp_operations.source_ledger IS NULL
          OR stellar_cctp_operations.source_ledger = EXCLUDED.source_ledger)
      RETURNING payment_id
    ), payment AS (
      UPDATE payments p SET status = 'source_confirmed',
        source_transaction_hash = ${input.transactionHash}, updated_at = now()
      WHERE p.id IN (SELECT payment_id FROM operation)
      RETURNING p.id
    ), events AS (
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      )
      SELECT p.id, 'stellar_cctp_source_confirmed', 'source_confirmation',
        'source_confirmed', 'stellar', ${input.transactionHash},
        'Stellar finalized the USDC burn. The funds are waiting for Circle attestation.',
        now()
      FROM payment p JOIN operation o ON o.payment_id = p.id
      ON CONFLICT (payment_id, event_key) DO NOTHING
      RETURNING payment_id
    )
    SELECT p.id FROM payment p JOIN operation o ON o.payment_id = p.id
  `;
  if (rows.length === 0) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Stellar CCTP payment changed while source evidence was being recorded",
    );
  }
}

/**
 * Reconciles a Stellar->Base source burn into canonical PaymentEvents. The
 * resulting state is source_confirmed only; Circle/Base must still attest,
 * mint, and verify the destination before completion.
 */
export async function reconcileStellarCctpSource(input: {
  readonly paymentId: string;
  readonly transactionHash: string;
  readonly burnAmount: string;
  readonly maxFee: string;
  readonly rpc: Pick<rpc.Server, "getTransaction">;
  readonly config?: StellarCctpConfig;
}): Promise<{ readonly status: "pending" | "source_confirmed" }> {
  const paymentId = requirePaymentId(input.paymentId);
  const sql = getSqlClient();
  const rows = await sql`
    SELECT p.id, p.route_id, p.recipient_address,
      p.expected_recipient_amount::text AS expected_amount,
      w.address AS source_address
    FROM payments p
    LEFT JOIN messages m ON m.id = p.intent_message_id
    LEFT JOIN wallets w ON w.id::text =
      m.structured_intent->'selectedSourceWallet'->>'id'
    WHERE p.id = ${paymentId}::uuid
    LIMIT 1
  `;
  const payment = rows[0] as Record<string, unknown> | undefined;
  if (!payment) {
    throw new StellarCctpPersistenceError("PAYMENT_NOT_FOUND", "Payment not found");
  }
  if (
    payment.route_id !== "stellar_to_base" ||
    typeof payment.source_address !== "string" ||
    typeof payment.recipient_address !== "string"
  ) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Payment is not a reconcilable Stellar-to-Base CCTP route",
    );
  }
  const config = input.config ?? stellarCctpConfigFromEnvironment();
  const expectedAmount = String(payment.expected_amount);
  const verification = await verifyStellarCctpBurn({
    rpc: input.rpc,
    txHash: input.transactionHash,
    config,
    intent: {
      smartAccount: payment.source_address,
      recipient: payment.recipient_address,
      burnAmount: input.burnAmount,
      maxFee: input.maxFee,
    },
  });
  if (verification.status === "pending") return { status: "pending" };
  if (verification.status !== "verified") {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "The finalized Stellar burn does not match the payment",
    );
  }
  const expectedAtomic = normalizeStellarUsdcAmount(expectedAmount).raw.toString();
  await recordStellarCctpSource({
    paymentId,
    transactionHash: verification.txHash,
    sourceLedger: verification.ledger,
    recipientAddress: verification.recipient,
    expectedRecipientAmount: expectedAmount,
    expectedAmountAtomic: expectedAtomic,
  });
  return { status: "source_confirmed" };
}

type DestinationPreparer = (input: {
  readonly message: string;
  readonly attestation: string;
}) => Promise<PreparedStellarCctpDestination>;

type DestinationSubmitter = (
  prepared: PreparedStellarCctpDestination,
) => Promise<{ readonly transactionHash: string; readonly ledger: number }>;

/**
 * Consumes Issue #16's completed Circle attestation, submits the Stellar
 * mint-and-forward exactly once, and completes only after exact transfer proof.
 */
export async function settleBaseToStellarCctp(input: {
  readonly paymentId: string;
  readonly sourceTransactionHash: string;
  readonly message: string;
  readonly attestation: string;
  readonly rpc: Pick<rpc.Server, "getTransaction">;
  readonly config?: StellarCctpConfig;
  readonly prepare?: DestinationPreparer;
  readonly submit?: DestinationSubmitter;
}): Promise<{
  readonly status: "in_progress" | "completed";
  readonly destinationTransactionHash?: string;
}> {
  const paymentId = requirePaymentId(input.paymentId);
  const sourceTransactionHash = input.sourceTransactionHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceTransactionHash)) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Invalid Base source transaction hash",
    );
  }
  const messageHash = sha256HexBytes(input.message, "message");
  const attestationHash = sha256HexBytes(input.attestation, "attestation");
  const submissionLeaseId = randomUUID();
  const sql = getSqlClient();
  const paymentRows = await sql`
    SELECT id, recipient_address,
      expected_recipient_amount::text AS expected_amount
    FROM payments
    WHERE id = ${paymentId}::uuid AND route_id = 'base_to_stellar'
  `;
  const payment = paymentRows[0] as Record<string, unknown> | undefined;
  if (!payment) {
    throw new StellarCctpPersistenceError(
      "PAYMENT_NOT_FOUND",
      "Base-to-Stellar payment not found",
    );
  }
  const expectedRecipient = String(payment.recipient_address);
  let expectedAmountAtomic: string;
  try {
    expectedAmountAtomic = normalizeStellarUsdcAmount(
      String(payment.expected_amount),
    ).raw.toString();
  } catch (error) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "Payment amount cannot be represented exactly as Stellar USDC",
      { cause: error },
    );
  }
  const rows = await sql`
    WITH reserved AS (
      INSERT INTO stellar_cctp_operations (
        payment_id, route_id, status, source_transaction_hash,
        circle_message_hash, circle_attestation_hash,
        expected_recipient_address, expected_amount_atomic,
        submission_lease_id, submission_lease_expires_at
      ) VALUES (
        ${paymentId}::uuid, 'base_to_stellar', 'destination_submitting',
        ${sourceTransactionHash}, ${messageHash}, ${attestationHash},
        ${expectedRecipient}, ${expectedAmountAtomic}::numeric,
        ${submissionLeaseId}::uuid, now() + interval '30 seconds'
      )
      ON CONFLICT (payment_id) DO NOTHING
      RETURNING status, source_transaction_hash, circle_message_hash,
        circle_attestation_hash, destination_transaction_hash,
        destination_envelope_xdr, submission_lease_id,
        submission_lease_expires_at, true AS reserved
    ), existing AS (
      SELECT o.status, o.source_transaction_hash, o.circle_message_hash,
        o.circle_attestation_hash, o.destination_transaction_hash,
        o.destination_envelope_xdr, o.submission_lease_id,
        o.submission_lease_expires_at, false AS reserved
      FROM stellar_cctp_operations o
      WHERE o.payment_id = ${paymentId}::uuid
        AND NOT EXISTS (SELECT 1 FROM reserved)
    )
    SELECT * FROM reserved
    UNION ALL
    SELECT * FROM existing
  `;
  const operation = rows[0] as Record<string, unknown> | undefined;
  if (!operation) throw new StellarCctpPersistenceError(
    "INVALID_PAYMENT_STATE",
    "CCTP destination reservation failed",
  );
  if (
    operation.source_transaction_hash !== sourceTransactionHash ||
    operation.circle_message_hash !== messageHash ||
    operation.circle_attestation_hash !== attestationHash
  ) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "CCTP evidence conflicts with the reserved payment operation",
    );
  }
  if (operation.status === "failed") {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "The Stellar destination operation failed and requires reconciliation",
    );
  }
  const config = input.config ?? stellarCctpConfigFromEnvironment();
  let destinationTransactionHash =
    typeof operation.destination_transaction_hash === "string"
      ? operation.destination_transaction_hash
      : null;
  let destinationEnvelopeXdr =
    typeof operation.destination_envelope_xdr === "string"
      ? operation.destination_envelope_xdr
      : null;
  let destinationLedger: number | null = null;
  if (!destinationTransactionHash) {
    let ownsLease = operation.reserved === true;
    if (!ownsLease) {
      const claimed = await sql`
        UPDATE stellar_cctp_operations
        SET submission_lease_id = ${submissionLeaseId}::uuid,
          submission_lease_expires_at = now() + interval '30 seconds',
          updated_at = now()
        WHERE payment_id = ${paymentId}::uuid
          AND status = 'destination_submitting'
          AND destination_transaction_hash IS NULL
          AND (
            submission_lease_expires_at IS NULL
            OR submission_lease_expires_at <= now()
          )
        RETURNING payment_id
      `;
      ownsLease = claimed.length > 0;
    }
    if (!ownsLease) return { status: "in_progress" };
    const prepare = input.prepare ?? ((request) =>
      prepareStellarCctpMintAndForward({ ...request, config }));
    const prepared = await prepare({
      message: input.message,
      attestation: input.attestation,
    });
    destinationTransactionHash = prepared.transactionHash.toLowerCase();
    destinationEnvelopeXdr = prepared.envelopeXdr;
    const persisted = await sql`
      UPDATE stellar_cctp_operations
      SET status = 'destination_prepared',
        destination_transaction_hash = ${destinationTransactionHash},
        destination_envelope_xdr = ${destinationEnvelopeXdr}, updated_at = now()
      WHERE payment_id = ${paymentId}::uuid
        AND status = 'destination_submitting'
        AND submission_lease_id = ${submissionLeaseId}::uuid
        AND destination_transaction_hash IS NULL
      RETURNING payment_id
    `;
    if (persisted.length === 0) return { status: "in_progress" };
  }

  if (!destinationEnvelopeXdr) {
    throw new StellarCctpPersistenceError(
      "INVALID_PAYMENT_STATE",
      "The reserved Stellar destination transaction is missing its recoverable envelope",
    );
  }

  if (operation.status === "destination_prepared" && operation.reserved !== true) {
    const claimed = await sql`
      UPDATE stellar_cctp_operations
      SET submission_lease_id = ${submissionLeaseId}::uuid,
        submission_lease_expires_at = now() + interval '30 seconds',
        updated_at = now()
      WHERE payment_id = ${paymentId}::uuid
        AND status = 'destination_prepared'
        AND destination_transaction_hash = ${destinationTransactionHash}
        AND submission_lease_expires_at <= now()
      RETURNING payment_id
    `;
    if (claimed.length === 0) return { status: "in_progress" };
  }

  if (
    operation.status === "destination_submitting" ||
    operation.status === "destination_prepared"
  ) {
    const submit = input.submit ?? ((prepared) =>
      submitPreparedStellarCctpMintAndForward({ prepared, config }));
    const submitted = await submit({
      transactionHash: destinationTransactionHash,
      envelopeXdr: destinationEnvelopeXdr,
    });
    if (submitted.transactionHash.toLowerCase() !== destinationTransactionHash) {
      throw new StellarCctpPersistenceError(
        "SUBMISSION_FAILED",
        "The Stellar destination submitter returned a different transaction hash",
      );
    }
    destinationLedger = submitted.ledger;
    await sql.transaction([
      sql`
        UPDATE stellar_cctp_operations
        SET status = 'destination_submitted',
          destination_ledger = ${destinationLedger},
          submission_lease_id = NULL, submission_lease_expires_at = NULL,
          updated_at = now()
        WHERE payment_id = ${paymentId}::uuid
          AND status IN ('destination_prepared', 'destination_submitting')
          AND destination_transaction_hash = ${destinationTransactionHash}
      `,
      sql`
        UPDATE payments
        SET status = 'destination_submitted',
          source_transaction_hash = ${sourceTransactionHash},
          destination_transaction_hash = ${destinationTransactionHash},
          updated_at = now()
        WHERE id = ${paymentId}::uuid AND route_id = 'base_to_stellar'
          AND status IN (
            'authorized', 'submitted', 'source_confirmed',
            'awaiting_attestation', 'destination_submitted'
          )
      `,
      sql`
        INSERT INTO payment_events (
          payment_id, event_key, stage, status, network, transaction_hash,
          public_message, completed_at
        ) VALUES (
          ${paymentId}::uuid, 'stellar_cctp_destination_submitted',
          'destination_submission', 'destination_submitted', 'stellar',
          ${destinationTransactionHash},
          'Circle attestation was accepted and the Stellar delivery was submitted.',
          now()
        ) ON CONFLICT (payment_id, event_key) DO NOTHING
      `,
    ]);
  }

  const expectedAmount = String(payment.expected_amount);
  const verification = await verifyBaseToStellarDestination({
    rpc: input.rpc,
    txHash: destinationTransactionHash,
    config,
    expectedRecipient,
    expectedAmount,
  });
  if (verification.status !== "verified") {
    if (verification.status === "pending") return { status: "in_progress" };
    await sql.transaction([
      sql`
        UPDATE stellar_cctp_operations
        SET status = 'failed', failure_code = 'DESTINATION_MISMATCH', updated_at = now()
        WHERE payment_id = ${paymentId}::uuid
      `,
      sql`
        UPDATE payments
        SET status = 'failed', failure_code = 'DESTINATION_MISMATCH',
          failure_message = 'Stellar finalized without exact recipient and amount proof.',
          updated_at = now()
        WHERE id = ${paymentId}::uuid
      `,
      sql`
        INSERT INTO payment_events (
          payment_id, event_key, stage, status, network, transaction_hash,
          public_message, debug_message, error_code, completed_at
        ) VALUES (
          ${paymentId}::uuid, 'stellar_cctp_destination_mismatch', 'failure',
          'failed', 'stellar', ${destinationTransactionHash},
          'The Stellar delivery could not be verified. The payment is not complete.',
          ${verification.status === "mismatch" ? verification.reason : "transaction_failed"},
          'DESTINATION_MISMATCH', now()
        ) ON CONFLICT (payment_id, event_key) DO NOTHING
      `,
    ]);
    throw new StellarCctpPersistenceError(
      "DESTINATION_MISMATCH",
      "Stellar destination recipient or amount verification failed",
    );
  }
  const verifiedAtomic = normalizeStellarUsdcAmount(verification.amount).raw.toString();
  await sql.transaction([
    sql`
      UPDATE stellar_cctp_operations
      SET status = 'completed', destination_ledger = ${verification.ledger},
        verified_recipient_address = ${verification.recipient},
        verified_amount_atomic = ${verifiedAtomic}::numeric,
        verified_at = now(), failure_code = NULL, updated_at = now()
      WHERE payment_id = ${paymentId}::uuid
        AND destination_transaction_hash = ${destinationTransactionHash}
        AND expected_recipient_address = ${verification.recipient}
        AND expected_amount_atomic = ${verifiedAtomic}::numeric
    `,
    sql`
      UPDATE payments
      SET status = 'completed', destination_transaction_hash = ${destinationTransactionHash},
        verified_recipient_address = ${verification.recipient},
        verified_recipient_amount = ${verification.amount}::numeric,
        recipient_verified_at = now(), failure_code = NULL,
        failure_message = NULL, updated_at = now()
      WHERE id = ${paymentId}::uuid AND route_id = 'base_to_stellar'
        AND recipient_address = ${verification.recipient}
        AND expected_recipient_amount = ${verification.amount}::numeric
    `,
    ...[
      ["stellar_cctp_destination_confirmed", "destination_confirmation", "destination_confirmed", "Stellar finalized the destination transaction."],
      ["stellar_cctp_recipient_verified", "recipient_verification", "recipient_verified", "The finalized transfer matches the exact recipient and USDC amount."],
      ["stellar_cctp_completed", "completion", "completed", "The recipient received the verified USDC amount."],
    ].map(([eventKey, stage, status, publicMessage]) => sql`
      INSERT INTO payment_events (
        payment_id, event_key, stage, status, network, transaction_hash,
        public_message, completed_at
      ) VALUES (
        ${paymentId}::uuid, ${eventKey}, ${stage}, ${status}, 'stellar',
        ${destinationTransactionHash}, ${publicMessage}, now()
      ) ON CONFLICT (payment_id, event_key) DO NOTHING
    `),
  ]);
  return { status: "completed", destinationTransactionHash };
}
