"use client";

import { useState } from "react";
import type { RouteDecision } from "../../domain/contracts";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Fingerprint,
  Info,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";

interface PaymentReviewCardProps {
  readonly decision: RouteDecision & { status: "resolved" };
  readonly amount: string;
  readonly recipient: string;
  readonly isConnected?: boolean;
  readonly onConfirm: () => Promise<{ txHash?: string } | void>;
  readonly onCancel: () => void;
}

export function PaymentReviewCard({
  decision,
  amount,
  recipient,
  isConnected = false,
  onConfirm,
  onCancel,
}: PaymentReviewCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<
    "idle" | "authorizing" | "broadcasting" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const routeLabel =
    decision.route.id === "stellar_to_stellar"
      ? "Stellar Direct USDC"
      : decision.route.id === "base_to_stellar_cctp"
        ? "Circle CCTP (Base → Stellar)"
        : decision.route.id === "stellar_to_base_cctp"
          ? "Circle CCTP (Stellar → Base)"
          : "Base Direct USDC";

  const isCrossChain =
    decision.route.id === "base_to_stellar_cctp" ||
    decision.route.id === "stellar_to_base_cctp";

  async function handleConfirm() {
    setIsAuthorizing(true);
    setExecutionState("authorizing");
    setErrorMessage(null);
    try {
      const result = await onConfirm();
      if (result && result.txHash) {
        setTxHash(result.txHash);
        setExecutionState("success");
      }
    } catch (err) {
      setExecutionState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Payment authorization was cancelled or failed.",
      );
    } finally {
      setIsAuthorizing(false);
    }
  }

  return (
    <div className="payment-review-card" role="region" aria-label="Payment Review Card">
      {/* Card Header (Family-Inspired) */}
      <div className="review-card-header">
        <div className="recipient-pill">
          <div className="recipient-avatar">
            <span>{recipient.replace(/^@/, "").slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="recipient-meta">
            <strong>{recipient}</strong>
            <span className="destination-network-tag">
              {decision.route.destinationNetwork === "stellar"
                ? "Stellar Testnet"
                : "Base Sepolia"}
            </span>
          </div>
        </div>
        <span className="review-ready-pill">
          <ShieldCheck className="mini-shield" /> Review
        </span>
      </div>

      {/* Wise-Standard Financial Breakdown */}
      <div className="breakdown-table">
        <div className="breakdown-row">
          <span className="breakdown-label">You send</span>
          <span className="breakdown-value tabular">{amount} USDC</span>
        </div>

        <div className="breakdown-row">
          <span className="breakdown-label">Transfer fee</span>
          <span className="breakdown-value proof-text">
            {decision.fees[0]?.payer === "sponsor"
              ? "Free (Sponsored by Telya)"
              : `$${decision.fees[0]?.amount ?? "0.00"} USDC`}
          </span>
        </div>

        <div className="breakdown-row route-row">
          <span className="breakdown-label">Chosen route</span>
          <div className="route-badge-wrapper">
            <span className="route-name-pill">{routeLabel}</span>
            {isCrossChain && <span className="cctp-tag">Circle CCTP</span>}
          </div>
        </div>

        {/* "Why this route?" Accordion */}
        <div className="why-route-section">
          <button
            type="button"
            className="why-route-toggle"
            onClick={() => setWhyOpen((prev) => !prev)}
            aria-expanded={whyOpen}
          >
            <Info className="info-icon" />
            <span>Why this route?</span>
            <ChevronDown className={`chevron-icon ${whyOpen ? "open" : ""}`} />
          </button>
          {whyOpen && (
            <div className="why-route-content">
              <p>{decision.explanation}</p>
            </div>
          )}
        </div>

        <div className="breakdown-divider" />

        <div className="breakdown-row total-row">
          <span className="breakdown-label strong">Recipient gets</span>
          <span className="breakdown-value strong tabular highlight-green">
            {amount} USDC
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="review-error-banner" role="alert">
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success State with Real Transaction Evidence */}
      {executionState === "success" && txHash ? (
        <div className="review-success-banner">
          <CheckCircle2 className="success-icon" />
          <div>
            <strong>Payment authorized & submitted!</strong>
            <p>
              Transaction Hash:{" "}
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="tx-hash-link"
              >
                {txHash.slice(0, 8)}...{txHash.slice(-6)} ↗
              </a>
            </p>
          </div>
        </div>
      ) : (
        /* Action Buttons */
        <div className="review-card-actions">
          {isConnected ? (
            <button
              type="button"
              className="cta-button primary review-submit-btn"
              onClick={handleConfirm}
              disabled={isAuthorizing}
            >
              {isAuthorizing ? (
                <>
                  <Loader2 className="btn-icon spinner" />
                  <span>Authorizing Passkey...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="btn-icon" />
                  <span>Confirm with Passkey</span>
                </>
              )}
            </button>
          ) : (
            <a href="/onboarding" className="cta-button primary review-submit-btn">
              <Fingerprint className="btn-icon" />
              <span>Connect Passkey to Authorize</span>
            </a>
          )}

          <button
            type="button"
            className="cancel-btn"
            onClick={onCancel}
            disabled={isAuthorizing}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
