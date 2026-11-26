"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import type { PaymentExecutionResult, PaymentReview } from "./conversation-payment";
import { runPaymentActionOnce } from "./payment-action-guard";

export function PaymentReviewCard({
  review,
  recipientLabel,
  canAuthorize,
  onConfirm,
  onRefresh,
  onCancel,
}: {
  readonly review: PaymentReview;
  readonly recipientLabel: string;
  readonly canAuthorize: boolean;
  readonly onConfirm: () => Promise<PaymentExecutionResult>;
  readonly onRefresh: (transactionHash: string) => Promise<PaymentExecutionResult>;
  readonly onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "authorizing" | "refreshing" | "error">("idle");
  const [execution, setExecution] = useState<PaymentExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const actionGuard = useRef<Promise<PaymentExecutionResult> | null>(null);
  const routeLabel = review.routeId === "stellar_to_stellar"
    ? "Stellar Direct USDC"
    : review.routeId.replaceAll("_", " ");

  async function confirm() {
    setPhase("authorizing");
    setErrorMessage(null);
    try {
      setExecution(await runPaymentActionOnce(actionGuard, onConfirm));
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error
        ? error.message
        : "Passkey authorization could not be verified. Check payment status before retrying.");
    }
  }

  async function refresh() {
    if (!execution?.transactionHash) return;
    const transactionHash = execution.transactionHash;
    setPhase("refreshing");
    setErrorMessage(null);
    try {
      setExecution(await runPaymentActionOnce(
        actionGuard,
        () => onRefresh(transactionHash),
      ));
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error
        ? error.message
        : "The persisted payment status is temporarily unavailable.");
    }
  }

  return (
    <div className="payment-review-card" role="region" aria-label="Payment review">
      <div className="review-card-header">
        <div className="recipient-pill">
          <div className="recipient-avatar">{recipientLabel.replace(/^@/, "").slice(0, 2).toUpperCase()}</div>
          <div className="recipient-meta">
            <strong>{recipientLabel}</strong>
            <span className="destination-network-tag">
              {review.destinationNetwork === "stellar" ? "Stellar Testnet" : "Base Sepolia"}
            </span>
          </div>
        </div>
        <span className="review-ready-pill">
          <ShieldCheck className="mini-shield" />
          {execution?.status === "completed" ? "Verified" : "Review"}
        </span>
      </div>
      <div className="breakdown-table">
        <div className="breakdown-row">
          <span className="breakdown-label">Recipient gets</span>
          <span className="breakdown-value tabular">{review.expectedRecipientAmount} USDC</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Chosen route</span>
          <span className="route-name-pill">{routeLabel}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Verified destination</span>
          <span className="breakdown-value tabular" title={review.recipientAddress}>
            {review.recipientAddress.slice(0, 8)}…{review.recipientAddress.slice(-6)}
          </span>
        </div>
        {review.fees.map((fee, index) => (
          <div className="breakdown-row" key={`${fee.kind}:${fee.label}:${index}`}>
            <span className="breakdown-label">{fee.label}</span>
            <span className="breakdown-value tabular">{fee.amount} {fee.asset} · {fee.payer}</span>
          </div>
        ))}
      </div>

      {!execution && !errorMessage && (
        <div className="review-error-banner" role="status">
          Review the exact recipient, amount, route and fees. Nothing is submitted until your device passkey authorizes this payment.
        </div>
      )}
      {execution?.status === "pending" && (
        <div className="review-error-banner" role="status">
          {execution.message} Do not submit again; refresh the persisted status.
        </div>
      )}
      {execution?.status === "unverified" && (
        <div className="review-error-banner" role="alert">
          {execution.message} The hash alone is not proof of submission or completion.
        </div>
      )}
      {execution?.status === "failed" && (
        <div className="review-error-banner" role="alert">
          {execution.message}
        </div>
      )}
      {errorMessage && <div className="review-error-banner" role="alert">{errorMessage}</div>}
      {execution?.status === "completed" && (
        <div className="review-success-banner" role="status">
          <CheckCircle2 className="success-icon" />
          <div>
            <strong>Payment completed and recipient verified</strong>
            <p>{execution.verifiedAmount} USDC reached the exact saved Stellar recipient.</p>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${execution.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="tx-hash-link"
            >
              {execution.transactionHash.slice(0, 8)}…{execution.transactionHash.slice(-6)} <ExternalLink className="inline-check" />
            </a>
          </div>
        </div>
      )}

      <div className="review-card-actions">
        {!execution && canAuthorize && (
          <button
            type="button"
            className="cta-button primary review-submit-btn"
            onClick={() => { void confirm(); }}
            disabled={phase === "authorizing"}
          >
            {phase === "authorizing" ? (
              <><Loader2 className="btn-icon spinner" /><span>Authorizing passkey…</span></>
            ) : (
              <><Fingerprint className="btn-icon" /><span>Confirm exact payment</span></>
            )}
          </button>
        )}
        {!execution && !canAuthorize && (
          <a href="/onboarding" className="cta-button primary review-submit-btn">
            <Fingerprint className="btn-icon" /> Connect verified passkey
          </a>
        )}
        {(execution?.status === "pending" || execution?.status === "unverified") && (
          <button
            type="button"
            className="cta-button primary review-submit-btn"
            onClick={() => { void refresh(); }}
            disabled={phase === "refreshing"}
          >
            <RefreshCw className={`btn-icon ${phase === "refreshing" ? "spinner" : ""}`} />
            {phase === "refreshing" ? "Checking verified status…" : "Refresh verified status"}
          </button>
        )}
        <button type="button" className="cancel-btn" onClick={onCancel} disabled={phase === "authorizing"}>
          <X className="btn-icon" /> Dismiss
        </button>
      </div>
    </div>
  );
}
