import "server-only";

import { createHash } from "node:crypto";

import { getSqlClient } from "../../server/db/client";
import type {
  ValidatedStellarAgentPassCreate,
  ValidatedStellarAgentPassRevoke,
  ValidatedStellarUsdcTransfer,
} from "../stellar/relayer";

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
  const eventKey = `${transfer.authorizationKind}_authorized`;
  const publicMessage =
    transfer.authorizationKind === "agent"
      ? "The active Agent Pass authorized this exact USDC recipient and amount."
      : "Your passkey authorized this exact USDC recipient and amount.";
  const [, eventRows] = await sql.transaction([
    sql`
      UPDATE stellar_relayer_requests
      SET operation_kind = 'usdc_transfer',
          authorization_kind = ${transfer.authorizationKind},
          context_rule_id = ${transfer.contextRuleId},
          signer_address = ${transfer.signerAddress},
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
      SELECT request_hash, ${eventKey}, 'authorization', 'authorized',
        ${publicMessage}, now()
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

export async function recordStellarAgentPassAuthorization(
  requestHash: string,
  operation: ValidatedStellarAgentPassCreate | ValidatedStellarAgentPassRevoke,
): Promise<void> {
  const sql = getSqlClient();
  if (operation.kind === "agent_pass_create") {
    const rows = await sql`
      UPDATE stellar_relayer_requests
      SET operation_kind = 'agent_pass_create',
          authorization_kind = 'owner', signer_address = ${operation.smartAccount},
          updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
      RETURNING request_hash
    `;
    if (!rows[0]) throw new Error("Agent Pass creation reservation is no longer pending");
    return;
  }

  const rows = await sql.transaction([
    sql`
      SELECT smart_account
      FROM stellar_agent_passes
      WHERE smart_account = ${operation.smartAccount}
        AND context_rule_id = ${operation.contextRuleId}
        AND status = 'active'
      FOR UPDATE
    `,
    sql`
      UPDATE stellar_relayer_requests
      SET operation_kind = 'agent_pass_revoke', authorization_kind = 'owner',
          context_rule_id = ${operation.contextRuleId},
          signer_address = ${operation.smartAccount}, updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
      RETURNING request_hash
    `,
  ]);
  if (!(rows[0] as Record<string, unknown>[])[0]) {
    throw new Error("Only an active Telya Agent Pass can be revoked");
  }
  if (!(rows[1] as Record<string, unknown>[])[0]) {
    throw new Error("Agent Pass revocation reservation is no longer pending");
  }
}

export async function assertActiveAgentPassForTransfer(
  transfer: ValidatedStellarUsdcTransfer,
): Promise<void> {
  if (transfer.authorizationKind !== "agent") return;
  const sql = getSqlClient();
  const rows = await sql`
    SELECT smart_account
    FROM stellar_agent_passes
    WHERE smart_account = ${transfer.sender}
      AND context_rule_id = ${transfer.contextRuleId}
      AND agent_address = ${transfer.signerAddress}
      AND token_contract = ${transfer.tokenContract}
      AND status = 'active'
      AND spent_amount_atomic + ${transfer.amountRaw.toString()}::numeric
        <= spending_limit_atomic
    LIMIT 1
  `;
  if (!rows[0]) {
    throw new Error("The Agent Pass is inactive or its remaining allowance is insufficient");
  }
}

export async function completeStellarAgentPassCreation(
  requestHash: string,
  operation: ValidatedStellarAgentPassCreate,
  result: { readonly transactionHash: string; readonly ruleId: number },
): Promise<void> {
  const sql = getSqlClient();
  const [, passRows, eventRows] = await sql.transaction([
    sql`
      UPDATE stellar_relayer_requests
      SET status = 'succeeded', transaction_hash = ${result.transactionHash},
          context_rule_id = ${result.ruleId}, failure_code = NULL, updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
        AND operation_kind = 'agent_pass_create'
      RETURNING request_hash
    `,
    sql`
      INSERT INTO stellar_agent_passes (
        smart_account, context_rule_id, agent_address, agent_public_key,
        token_contract, spending_limit_policy, spending_limit_atomic,
        period_ledgers, valid_until_ledger, status, create_request_hash,
        create_transaction_hash
      )
      SELECT ${operation.smartAccount}, ${result.ruleId}, ${operation.agentAddress},
        ${operation.agentPublicKey}, ${operation.tokenContract},
        ${operation.spendingLimitPolicy}, ${operation.spendingLimitRaw.toString()}::numeric,
        ${operation.periodLedgers}, ${operation.validUntilLedger}, 'active',
        request_hash, ${result.transactionHash}
      FROM stellar_relayer_requests
      WHERE request_hash = ${requestHash} AND status = 'succeeded'
      RETURNING smart_account
    `,
    sql`
      INSERT INTO stellar_agent_pass_events (
        smart_account, context_rule_id, event_key, event_type, transaction_hash
      )
      SELECT ${operation.smartAccount}, ${result.ruleId}, 'created', 'created',
        ${result.transactionHash}
      FROM stellar_relayer_requests
      WHERE request_hash = ${requestHash} AND status = 'succeeded'
      RETURNING id
    `,
  ]);
  if (
    !(passRows as Record<string, unknown>[])[0] ||
    !(eventRows as Record<string, unknown>[])[0]
  ) {
    throw new Error("Agent Pass creation evidence was not persisted");
  }
}

export async function completeStellarAgentPassRevocation(
  requestHash: string,
  operation: ValidatedStellarAgentPassRevoke,
  transactionHash: string,
): Promise<void> {
  const sql = getSqlClient();
  const [, passRows, eventRows] = await sql.transaction([
    sql`
      UPDATE stellar_relayer_requests
      SET status = 'succeeded', transaction_hash = ${transactionHash},
          failure_code = NULL, updated_at = now()
      WHERE request_hash = ${requestHash} AND status = 'pending'
        AND operation_kind = 'agent_pass_revoke'
      RETURNING request_hash
    `,
    sql`
      UPDATE stellar_agent_passes
      SET status = 'revoked', revoke_request_hash = ${requestHash},
          revoke_transaction_hash = ${transactionHash}, revoked_at = now()
      WHERE smart_account = ${operation.smartAccount}
        AND context_rule_id = ${operation.contextRuleId} AND status = 'active'
      RETURNING smart_account
    `,
    sql`
      INSERT INTO stellar_agent_pass_events (
        smart_account, context_rule_id, event_key, event_type, transaction_hash
      ) VALUES (
        ${operation.smartAccount}, ${operation.contextRuleId}, 'revoked', 'revoked',
        ${transactionHash}
      )
      ON CONFLICT (smart_account, context_rule_id, event_key) DO NOTHING
      RETURNING id
    `,
  ]);
  if (
    !(passRows as Record<string, unknown>[])[0] ||
    !(eventRows as Record<string, unknown>[])[0]
  ) {
    throw new Error("Agent Pass revocation evidence was not persisted");
  }
}

export async function recordVerifiedAgentPassSpend(
  transfer: ValidatedStellarUsdcTransfer,
  transactionHash: string,
): Promise<void> {
  if (transfer.authorizationKind !== "agent") return;
  const sql = getSqlClient();
  const [passRows, eventRows] = await sql.transaction([
    sql`
      UPDATE stellar_agent_passes
      SET spent_amount_atomic = spent_amount_atomic + ${transfer.amountRaw.toString()}::numeric
      WHERE smart_account = ${transfer.sender}
        AND context_rule_id = ${transfer.contextRuleId}
        AND agent_address = ${transfer.signerAddress}
        AND status = 'active'
        AND spent_amount_atomic + ${transfer.amountRaw.toString()}::numeric
          <= spending_limit_atomic
      RETURNING spent_amount_atomic::text
    `,
    sql`
      INSERT INTO stellar_agent_pass_events (
        smart_account, context_rule_id, event_key, event_type, amount_atomic,
        cumulative_spent_atomic, transaction_hash
      )
      SELECT ${transfer.sender}, ${transfer.contextRuleId},
        ${`spent:${transactionHash}`}, 'spent', ${transfer.amountRaw.toString()}::numeric,
        spent_amount_atomic, ${transactionHash}
      FROM stellar_agent_passes
      WHERE smart_account = ${transfer.sender}
        AND context_rule_id = ${transfer.contextRuleId}
      ON CONFLICT (smart_account, context_rule_id, event_key) DO NOTHING
      RETURNING id
    `,
  ]);
  if (
    !(passRows as Record<string, unknown>[])[0] ||
    !(eventRows as Record<string, unknown>[])[0]
  ) {
    throw new Error("Verified Agent Pass spend was not persisted");
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
      r.authorization_kind AS "authorizationKind",
      r.context_rule_id AS "contextRuleId",
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

export async function getLatestStellarAgentPass(
  smartAccount: string,
): Promise<Record<string, unknown> | null> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT smart_account AS "smartAccount", context_rule_id AS "ruleId",
      agent_address AS "agentAddress", agent_public_key AS "agentPublicKey",
      spending_limit_atomic::text AS "spendingLimitAtomic",
      spent_amount_atomic::text AS "spentAmountAtomic",
      period_ledgers AS "periodLedgers", valid_until_ledger AS "validUntilLedger",
      status, create_transaction_hash AS "createTransactionHash",
      revoke_transaction_hash AS "revokeTransactionHash", created_at AS "createdAt",
      revoked_at AS "revokedAt"
    FROM stellar_agent_passes
    WHERE smart_account = ${smartAccount}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as Record<string, unknown> | undefined) ?? null;
}
