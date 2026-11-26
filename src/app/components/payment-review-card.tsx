"use client";

import { ShieldCheck, X } from "lucide-react";

import type { PaymentReview } from "./conversation-payment";

export function PaymentReviewCard({
  review,
  recipientLabel,
  onCancel,
}: {
  readonly review: PaymentReview;
  readonly recipientLabel: string;
  readonly onCancel: () => void;
}) {
  const routeLabel = review.routeId === "stellar_to_stellar"
    ? "Stellar Direct USDC"
    : review.routeId.replaceAll("_", " ");
  return (
    <div className="payment-review-card" role="region" aria-label="Payment review">
      <div className="review-card-header">
        <div className="recipient-pill">
          <div className="recipient-avatar">{recipientLabel.replace(/^@/, "").slice(0, 2).toUpperCase()}</div>
          <div className="recipient-meta">
            <strong>{recipientLabel}</strong>
            <span className="destination-network-tag">{review.destinationNetwork} Testnet</span>
          </div>
        </div>
        <span className="review-ready-pill"><ShieldCheck className="mini-shield" /> Review only</span>
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
      <div className="review-error-banner" role="status">
        This is a persisted review. No transaction has been authorized or submitted. Conversation signing remains unavailable until the passkey relayer can carry the authenticated payment ID.
      </div>
      <div className="review-card-actions">
        <button type="button" className="cancel-btn" onClick={onCancel}>
          <X className="btn-icon" /> Dismiss review
        </button>
      </div>
    </div>
  );
}
