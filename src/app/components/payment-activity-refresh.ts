import type { PersistedPayment } from "../../domain/payment-activity";

type Request = (input: string, init?: RequestInit) => Promise<Response>;

export async function reconcileSubmittedActivityPayment(
  payment: Pick<PersistedPayment, "id" | "route" | "status">,
  request: Request,
): Promise<void> {
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
