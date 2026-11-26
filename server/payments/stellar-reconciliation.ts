import { Networks, rpc } from "@stellar/stellar-sdk";

import { getSqlClient } from "../db/client.ts";
import {
  completeStellarUsdcTransferRequest,
  failLinkedStellarPayment,
} from "../../src/server/stellar-relayer-requests.ts";
import {
  stellarUsdcAmountFromRawUnits,
  verifyStellarUsdcTransfer,
  type StellarTransactionRpc,
  type StellarUsdcVerification,
} from "../../src/stellar/usdc.ts";
import {
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentProviderUnavailableError,
} from "./service.ts";

type VerifyTransfer = typeof verifyStellarUsdcTransfer;

export type StellarPaymentReconciliation =
  | { readonly status: "pending"; readonly transactionHash: string }
  | { readonly status: "completed"; readonly transactionHash: string }
  | { readonly status: "failed"; readonly transactionHash: string; readonly reason: string };

export function stellarReconciliationRpcFromEnvironment(): StellarTransactionRpc {
  const rpcUrl = process.env.STELLAR_RPC_URL;
  if (!rpcUrl || process.env.STELLAR_NETWORK_PASSPHRASE !== Networks.TESTNET) {
    throw new PaymentProviderUnavailableError();
  }
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new PaymentProviderUnavailableError();
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new PaymentProviderUnavailableError();
  }
  return new rpc.Server(parsed.toString());
}

/** Reconcile the one already-submitted hash; this function never broadcasts. */
export async function reconcileStellarDirectPayment(
  userId: string,
  paymentId: string,
  options: {
    readonly rpc?: StellarTransactionRpc;
    readonly verifyTransfer?: VerifyTransfer;
  } = {},
): Promise<StellarPaymentReconciliation> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    throw new PaymentNotFoundError();
  }
  const sql = getSqlClient();
  const rows = await sql`
    SELECT p.status, p.destination_transaction_hash, p.failure_code,
      r.request_hash, r.submitted_transaction_hash, r.token_contract,
      r.sender_address, r.recipient_address, r.expected_amount_atomic::text AS amount_atomic
    FROM payments p
    JOIN stellar_relayer_requests r ON r.payment_id = p.id
    WHERE p.id = ${paymentId}::uuid AND p.user_id = ${userId}::uuid
      AND p.route_id = 'stellar_to_stellar'
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new PaymentNotFoundError();
  if (row.status === "completed" && typeof row.destination_transaction_hash === "string") {
    return { status: "completed", transactionHash: row.destination_transaction_hash };
  }
  if (row.status === "failed" && typeof row.submitted_transaction_hash === "string") {
    return {
      status: "failed",
      transactionHash: row.submitted_transaction_hash,
      reason: typeof row.failure_code === "string" ? row.failure_code : "VERIFICATION_FAILED",
    };
  }
  if (
    typeof row.request_hash !== "string" ||
    typeof row.submitted_transaction_hash !== "string" ||
    typeof row.token_contract !== "string" ||
    typeof row.sender_address !== "string" ||
    typeof row.recipient_address !== "string" ||
    typeof row.amount_atomic !== "string" ||
    !/^[0-9]+$/.test(row.amount_atomic)
  ) {
    throw new PaymentConflictError("The payment has no submitted Stellar transaction to reconcile");
  }
  const amountRaw = BigInt(row.amount_atomic);
  let verification: StellarUsdcVerification;
  try {
    verification = await (options.verifyTransfer ?? verifyStellarUsdcTransfer)({
      rpc: options.rpc ?? stellarReconciliationRpcFromEnvironment(),
      txHash: row.submitted_transaction_hash,
      tokenContract: row.token_contract,
      expectedSender: row.sender_address,
      expectedRecipient: row.recipient_address,
      expectedAmount: stellarUsdcAmountFromRawUnits(amountRaw),
    });
  } catch {
    throw new PaymentProviderUnavailableError();
  }
  if (verification.status === "pending") {
    return { status: "pending", transactionHash: row.submitted_transaction_hash };
  }
  if (verification.status === "verified") {
    await completeStellarUsdcTransferRequest(row.request_hash, {
      transactionHash: row.submitted_transaction_hash,
      ledger: verification.ledger,
      recipient: verification.recipient,
      amountRaw,
    });
    return { status: "completed", transactionHash: row.submitted_transaction_hash };
  }
  const failureCode = verification.status === "failed"
    ? "STELLAR_TRANSACTION_FAILED"
    : `STELLAR_${verification.reason.toUpperCase()}`;
  await failLinkedStellarPayment(
    row.request_hash,
    row.submitted_transaction_hash,
    failureCode,
  );
  return {
    status: "failed",
    transactionHash: row.submitted_transaction_hash,
    reason: failureCode,
  };
}
