import "server-only";

import { createHash } from "node:crypto";

import { getSqlClient } from "../../server/db/client";
import type { ValidatedStellarUsdcTransfer } from "../stellar/relayer";

export type RelayerReservation =
  | { decision: "reserved" }
  | { decision: "succeeded"; transactionHash: string }
  | { decision: "in_progress" | "limit_reached" };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stellarRelayerRequestIdentity(
  func: string,
  auth: readonly string[],
  clientAddress: string,
): { requestHash: string; clientKeyHash: string } {
  return {
    requestHash: sha256(JSON.stringify({ func, auth })),
    clientKeyHash: sha256(`telya-stellar-relayer:${clientAddress}`),
  };
}

export async function reserveStellarRelayerRequest(
  requestHash: string,
  clientKeyHash: string,
): Promise<RelayerReservation> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT decision, existing_transaction_hash
    FROM reserve_stellar_relayer_request(${requestHash}, ${clientKeyHash})
  `;
  const decision = String(rows[0]?.decision ?? "");
  if (decision === "succeeded") {
    const transactionHash = String(rows[0]?.existing_transaction_hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(transactionHash)) {
      throw new Error("Stored Stellar relayer transaction hash is invalid");
    }
    return { decision, transactionHash };
  }
  if (decision === "reserved" || decision === "in_progress" || decision === "limit_reached") {
    return { decision };
  }
  throw new Error("Stellar relayer reservation returned an invalid decision");
}

export async function completeStellarRelayerRequest(
  requestHash: string,
  result:
    | { status: "succeeded"; transactionHash: string }
    | { status: "failed"; failureCode: string },
): Promise<void> {
  const sql = getSqlClient();
  if (result.status === "succeeded") {
    await sql`
      UPDATE stellar_relayer_requests
      SET status = 'succeeded', transaction_hash = ${result.transactionHash},
          failure_code = NULL, updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
    `;
    return;
  }
  await sql.transaction([
    sql`
      UPDATE stellar_relayer_requests
      SET status = CASE
            WHEN submitted_transaction_hash IS NOT NULL THEN 'succeeded'
            ELSE 'failed'
          END,
          transaction_hash = submitted_transaction_hash,
          transaction_ledger = submitted_ledger,
          failure_code = ${result.failureCode}, updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
    `,
    sql`
      INSERT INTO stellar_direct_payment_events (
        request_hash, event_key, stage, status, transaction_hash, public_message,
        error_code, completed_at
      )
      SELECT request_hash, 'failed', 'failure', 'failed', submitted_transaction_hash,
        'The Stellar payment did not complete. No successful payment is being claimed.',
        ${result.failureCode}, now()
      FROM stellar_relayer_requests
      WHERE request_hash = ${requestHash} AND operation_kind = 'usdc_transfer'
      ON CONFLICT (request_hash, event_key) DO NOTHING
    `,
  ]);
}

export async function recordStellarUsdcTransferAuthorization(
  requestHash: string,
  transfer: ValidatedStellarUsdcTransfer,
): Promise<void> {
  const sql = getSqlClient();
  const [, eventRows] = await sql.transaction([
    sql`
      UPDATE stellar_relayer_requests
      SET operation_kind = 'usdc_transfer',
          token_contract = ${transfer.tokenContract},
          sender_address = ${transfer.sender},
          recipient_address = ${transfer.recipient},
          expected_amount_atomic = ${transfer.amountRaw.toString()}::numeric,
          updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
      RETURNING request_hash
    `,
    sql`
      INSERT INTO stellar_direct_payment_events (
        request_hash, event_key, stage, status, public_message, completed_at
      )
      SELECT request_hash, 'passkey_authorized', 'authorization', 'authorized',
        'Your passkey authorized this exact USDC recipient and amount.', now()
      FROM stellar_relayer_requests
      WHERE request_hash = ${requestHash}
        AND status = 'pending'
        AND operation_kind = 'usdc_transfer'
      ON CONFLICT (request_hash, event_key) DO NOTHING
      RETURNING id
    `,
  ]);
  if (!(eventRows as Record<string, unknown>[])[0]) {
    throw new Error("Stellar transfer reservation is no longer pending");
  }
}

export async function completeStellarUsdcTransferRequest(
  requestHash: string,
  result: {
    readonly transactionHash: string;
    readonly ledger: number;
    readonly recipient: string;
    readonly amountRaw: bigint;
  },
): Promise<void> {
  const sql = getSqlClient();
  const [, confirmationRows, verificationRows, completionRows] =
    await sql.transaction([
      sql`
        UPDATE stellar_relayer_requests
        SET status = 'succeeded',
            transaction_hash = ${result.transactionHash},
            transaction_ledger = ${result.ledger},
            verified_recipient_address = ${result.recipient},
            verified_amount_atomic = ${result.amountRaw.toString()}::numeric,
            verified_at = now(), failure_code = NULL, updated_at = now()
        WHERE request_hash = ${requestHash}
          AND status = 'pending'
          AND operation_kind = 'usdc_transfer'
          AND recipient_address = ${result.recipient}
          AND expected_amount_atomic = ${result.amountRaw.toString()}::numeric
        RETURNING request_hash
      `,
      sql`
        INSERT INTO stellar_direct_payment_events (
          request_hash, event_key, stage, status, transaction_hash,
          public_message, completed_at
        )
        SELECT request_hash, 'destination_confirmed', 'destination_confirmation',
          'destination_confirmed', ${result.transactionHash},
          'Stellar finalized the destination transaction.', now()
        FROM stellar_relayer_requests
        WHERE request_hash = ${requestHash} AND verified_at IS NOT NULL
        ON CONFLICT (request_hash, event_key) DO NOTHING
        RETURNING id
      `,
      sql`
        INSERT INTO stellar_direct_payment_events (
          request_hash, event_key, stage, status, transaction_hash,
          public_message, completed_at
        )
        SELECT request_hash, 'recipient_verified', 'recipient_verification',
          'recipient_verified', ${result.transactionHash},
          'The finalized event matches the intended recipient and exact USDC amount.', now()
        FROM stellar_relayer_requests
        WHERE request_hash = ${requestHash} AND verified_at IS NOT NULL
        ON CONFLICT (request_hash, event_key) DO NOTHING
        RETURNING id
      `,
      sql`
        INSERT INTO stellar_direct_payment_events (
          request_hash, event_key, stage, status, transaction_hash,
          public_message, completed_at
        )
        SELECT request_hash, 'completed', 'completion', 'completed',
          ${result.transactionHash}, 'The recipient received the verified USDC amount.', now()
        FROM stellar_relayer_requests
        WHERE request_hash = ${requestHash} AND verified_at IS NOT NULL
        ON CONFLICT (request_hash, event_key) DO NOTHING
        RETURNING id
      `,
    ]);
  if (
    !(confirmationRows as Record<string, unknown>[])[0] ||
    !(verificationRows as Record<string, unknown>[])[0] ||
    !(completionRows as Record<string, unknown>[])[0]
  ) {
    throw new Error("Stellar transfer completion evidence was not persisted");
  }
}

export async function recordStellarUsdcTransferSubmission(
  requestHash: string,
  result: { readonly transactionHash: string; readonly ledger: number },
): Promise<void> {
  const sql = getSqlClient();
  const [, eventRows] = await sql.transaction([
    sql`
      UPDATE stellar_relayer_requests
      SET submitted_transaction_hash = ${result.transactionHash},
          submitted_ledger = ${result.ledger}, updated_at = now()
      WHERE request_hash = ${requestHash}
        AND status = 'pending'
        AND operation_kind = 'usdc_transfer'
      RETURNING request_hash
    `,
    sql`
      INSERT INTO stellar_direct_payment_events (
        request_hash, event_key, stage, status, transaction_hash,
        public_message, completed_at
      )
      SELECT request_hash, 'submitted', 'submission', 'submitted',
        ${result.transactionHash}, 'The sponsored USDC transfer was submitted to Stellar Testnet.', now()
      FROM stellar_relayer_requests
      WHERE request_hash = ${requestHash}
        AND submitted_transaction_hash = ${result.transactionHash}
      ON CONFLICT (request_hash, event_key) DO NOTHING
      RETURNING id
    `,
  ]);
  if (!(eventRows as Record<string, unknown>[])[0]) {
    throw new Error("Stellar transfer submission evidence was not persisted");
  }
}

export async function getStellarUsdcTransferReceipt(
  transactionHash: string,
): Promise<Record<string, unknown> | null> {
  if (!/^[0-9a-f]{64}$/i.test(transactionHash)) return null;
  const sql = getSqlClient();
  const rows = await sql`
    SELECT
      COALESCE(r.transaction_hash, r.submitted_transaction_hash) AS "transactionHash",
      COALESCE(r.transaction_ledger, r.submitted_ledger) AS ledger,
      r.sender_address AS sender,
      r.recipient_address AS recipient,
      r.expected_amount_atomic::text AS "expectedAmountAtomic",
      r.verified_recipient_address AS "verifiedRecipient",
      r.verified_amount_atomic::text AS "verifiedAmountAtomic",
      r.verified_at AS "verifiedAt",
      CASE
        WHEN r.status = 'succeeded' AND r.verified_at IS NOT NULL
          AND r.failure_code IS NULL THEN 'completed'
        WHEN r.status = 'failed' OR r.failure_code IS NOT NULL THEN 'failed'
        ELSE 'pending'
      END AS status,
      r.failure_code AS "failureCode",
      COALESCE(
        json_agg(jsonb_build_object(
          'stage', e.stage,
          'status', e.status,
          'txHash', e.transaction_hash,
          'publicMessage', e.public_message,
          'errorCode', e.error_code,
          'occurredAt', e.occurred_at,
          'completedAt', e.completed_at
        ) ORDER BY CASE e.stage
          WHEN 'authorization' THEN 1
          WHEN 'submission' THEN 2
          WHEN 'destination_confirmation' THEN 3
          WHEN 'recipient_verification' THEN 4
          WHEN 'completion' THEN 5
          ELSE 6
        END) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS events
    FROM stellar_relayer_requests r
    LEFT JOIN stellar_direct_payment_events e ON e.request_hash = r.request_hash
    WHERE (r.transaction_hash = ${transactionHash.toLowerCase()}
        OR r.submitted_transaction_hash = ${transactionHash.toLowerCase()})
      AND r.operation_kind = 'usdc_transfer'
    GROUP BY r.request_hash
    LIMIT 1
  `;
  return (rows[0] as Record<string, unknown> | undefined) ?? null;
}
