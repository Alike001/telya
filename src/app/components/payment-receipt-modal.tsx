"use client";

import { useState } from "react";
import type { PersistedPayment, PersistedPaymentEvent } from "../../domain/payment-activity";
import {
  buildPaymentReceipt,
  type PaymentReceipt,
} from "../../domain/payment-timeline";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Printer,
  ShieldCheck,
  X,
} from "lucide-react";

interface PaymentReceiptModalProps {
  readonly payment: PersistedPayment;
  readonly events: readonly PersistedPaymentEvent[];
  readonly onClose: () => void;
}

export function PaymentReceiptModal({
  payment,
  events,
  onClose,
}: PaymentReceiptModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const receipt: PaymentReceipt | null = buildPaymentReceipt(payment, events);
  if (!receipt) return null;

  function handleCopy(text: string, fieldName: string) {
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handlePrint() {
    window.print();
  }

  const routeLabel =
    receipt.routeId === "stellar_to_stellar"
      ? "Stellar Direct USDC"
      : receipt.routeId === "base_to_stellar_cctp"
        ? "Circle CCTP (Base → Stellar)"
        : receipt.routeId === "stellar_to_base_cctp"
          ? "Circle CCTP (Stellar → Base)"
          : "Base Direct USDC";

  return (
    <div
      className="receipt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Payment Receipt"
    >
      <div className="receipt-card">
        {/* Receipt Header */}
        <div className="receipt-header">
          <div className="receipt-title-box">
            <span className="receipt-verified-badge">
              <ShieldCheck className="mini-shield" /> Verified Payment Receipt
            </span>
            <h2 className="receipt-amount-display">
              {receipt.expectedAmount} <span className="receipt-asset">{receipt.asset}</span>
            </h2>
            <p className="receipt-date-text">
              {receipt.completedAt
                ? new Date(receipt.completedAt).toLocaleString()
                : new Date(receipt.createdAt).toLocaleString()}
            </p>
          </div>

          <button
            type="button"
            className="receipt-close-btn"
            onClick={onClose}
            aria-label="Close receipt"
          >
            <X className="close-icon" />
          </button>
        </div>

        {/* Status Highlight */}
        <div className={`receipt-status-callout ${receipt.status}`}>
          {receipt.isFullySettled ? (
            <>
              <CheckCircle2 className="callout-icon" />
              <span>Settlement Finalized & Destination Recipient Verified</span>
            </>
          ) : (
            <span>Status: {receipt.status}</span>
          )}
        </div>

        {/* Wise-Style Financial Breakdown Table */}
        <div className="receipt-breakdown">
          <div className="receipt-row">
            <span className="row-label">Sent Amount</span>
            <span className="row-value tabular">{receipt.expectedAmount} USDC</span>
          </div>

          {receipt.fees.map((fee, index) => (
            <div className="receipt-row" key={`${fee.kind}-${index}`}>
              <span className="row-label">{fee.label}</span>
              <span className="row-value proof-text">
                {fee.amount} {fee.asset} · {fee.payer === "sponsor" ? "Sponsor paid" : `${fee.payer} paid`}
              </span>
            </div>
          ))}

          <div className="receipt-row highlight">
            <span className="row-label strong">Recipient Gets</span>
            <span className="row-value highlight-amount tabular">
              {receipt.verifiedAmount} USDC
            </span>
          </div>

          <div className="receipt-divider" />

          <div className="receipt-row">
            <span className="row-label">Recipient</span>
            <div className="row-value-with-copy">
              <span>{receipt.recipient}</span>
              <button
                type="button"
                className="mini-copy-btn"
                onClick={() => handleCopy(receipt.recipient, "recipient")}
                title="Copy recipient"
              >
                <Copy className="copy-icon-sm" />
                {copiedField === "recipient" && <span className="copied-pill">Copied</span>}
              </button>
            </div>
          </div>

          {receipt.verifiedRecipient && receipt.verifiedRecipient !== receipt.recipient && (
            <div className="receipt-row">
              <span className="row-label">Verified Address</span>
              <div className="row-value-with-copy">
                <code className="monospace-sm">
                  {receipt.verifiedRecipient.slice(0, 10)}...{receipt.verifiedRecipient.slice(-8)}
                </code>
                <button
                  type="button"
                  className="mini-copy-btn"
                  onClick={() => handleCopy(receipt.verifiedRecipient!, "verifiedAddress")}
                >
                  <Copy className="copy-icon-sm" />
                  {copiedField === "verifiedAddress" && (
                    <span className="copied-pill">Copied</span>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="receipt-row">
            <span className="row-label">Routing Rail</span>
            <span className="row-value">{routeLabel}</span>
          </div>

          <div className="receipt-row">
            <span className="row-label">Settlement Duration</span>
            <span className="row-value">{receipt.durationFormatted}</span>
          </div>

          {/* On-Chain Evidence References */}
          {receipt.sourceTransaction && (
            <div className="receipt-row evidence">
              <span className="row-label">Source Transaction</span>
              <a
                href={receipt.sourceTransaction.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="explorer-link-pill"
              >
                <code>
                  {receipt.sourceTransaction.txHash.slice(0, 8)}...
                  {receipt.sourceTransaction.txHash.slice(-6)}
                </code>
                <ArrowUpRight className="link-arrow" />
              </a>
            </div>
          )}

          {receipt.destinationTransaction && (
            <div className="receipt-row evidence">
              <span className="row-label">Destination Settlement</span>
              <a
                href={receipt.destinationTransaction.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="explorer-link-pill"
              >
                <code>
                  {receipt.destinationTransaction.txHash.slice(0, 8)}...
                  {receipt.destinationTransaction.txHash.slice(-6)}
                </code>
                <ArrowUpRight className="link-arrow" />
              </a>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="receipt-actions">
          <button
            type="button"
            className="receipt-action-btn secondary"
            onClick={handlePrint}
          >
            <Printer className="btn-icon" />
            <span>Print Receipt</span>
          </button>

          <button
            type="button"
            className="cta-button primary receipt-action-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
