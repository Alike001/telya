import type { PersistedPayment } from "../../domain/payment-activity";

type Request = (input: string, init?: RequestInit) => Promise<Response>;

export async function reconcileSubmittedActivityPayment(
  payment: Pick<PersistedPayment, "id" | "route" | "status" | "sourceTransaction">,
  request: Request,
): Promise<void> {
  if (payment.route.id === "base_to_stellar_cctp" || payment.route.id === "stellar_to_base_cctp") {
    if (!["submitted", "source_confirmed", "awaiting_attestation", "destination_submitted"].includes(payment.status)) return;
    const sourceHash = payment.sourceTransaction?.txHash;
    const validSourceHash = payment.sourceTransaction?.network === payment.route.sourceNetwork &&
      (payment.route.sourceNetwork === "base"
        ? /^0x[0-9a-f]{64}$/i.test(sourceHash ?? "")
        : /^[0-9a-f]{64}$/i.test(sourceHash ?? ""));
    if (!validSourceHash || !sourceHash) {
      throw new Error("The recorded source transaction is unavailable. The payment was not resubmitted; check Activity before retrying verification.");
    }
    const response = await request(
      `/api/payments/base/cctp/source?id=${encodeURIComponent(payment.id)}`,
      { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceTransactionHash: sourceHash }) },
    );
    if (response.ok) return;
    throw new Error(response.status === 503
      ? "Cross-chain verification is temporarily unavailable. The recorded burn was not resubmitted; retry Refresh when service returns."
      : "The recorded cross-chain payment could not be verified. The burn was not resubmitted; retry Refresh or sign in again.");
  }
  if (payment.route.id !== "stellar_to_stellar" || payment.status !== "submitted") return;

  const response = await request(
    `/api/payments/stellar/direct/reconcile?id=${encodeURIComponent(payment.id)}`,
    { method: "POST", credentials: "same-origin" },
  );
  if (response.ok) return;

  throw new Error(response.status === 503
    ? "Stellar payment verification is temporarily unavailable. The recorded payment was not resubmitted; retry Refresh when service returns."
    : "The recorded Stellar payment could not be verified. The payment was not resubmitted; retry Refresh or sign in again.");
}
