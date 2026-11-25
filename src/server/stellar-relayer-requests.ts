import "server-only";

import { createHash } from "node:crypto";

import { getSqlClient } from "../../server/db/client";

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
  await sql`
    UPDATE stellar_relayer_requests
    SET status = 'failed', failure_code = ${result.failureCode}, updated_at = now()
    WHERE request_hash = ${requestHash} AND status = 'pending'
  `;
}
