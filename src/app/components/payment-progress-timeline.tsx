"use client";

import { useEffect, useState } from "react";
import type { PersistedPayment, PersistedPaymentEvent } from "../../domain/payment-activity";
import {
  computePaymentTimeline,
  type ComputedTimeline,
  formatDuration,
} from "../../domain/payment-timeline";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

interface PaymentProgressTimelineProps {
  readonly payment: PersistedPayment;
  readonly events: readonly PersistedPaymentEvent[];
  readonly onRefresh?: () => Promise<void>;
  readonly onViewReceipt?: () => void;
  readonly onClose?: () => void;
}

export function PaymentProgressTimeline({
  payment,
  events,
  onRefresh,
  onViewReceipt,
  onClose,
}: PaymentProgressTimelineProps) {
  const [nowMs, setNowMs] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEventsLog, setShowEventsLog] = useState(false);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Live timer tick without fake progress: updates elapsed time only
  useEffect(() => {
    if (payment.status === "completed" || payment.status === "failed") {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [payment.status]);

  const timeline: ComputedTimeline = computePaymentTimeline(payment, events, nowMs);
  const failedStep = timeline.steps.find((step) => step.status === "failed");

  async function handleRefreshClick() {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleCopyTx(txHash: string) {
    navigator.clipboard?.writeText(txHash);
    setCopiedTx(txHash);
    setTimeout(() => setCopiedTx(null), 2000);
  }

  const routeLabel =
    payment.route.id === "stellar_to_stellar"
      ? "Stellar Direct USDC"
      : payment.route.id === "base_to_stellar_cctp"
        ? "Circle CCTP (Base → Stellar)"
        : payment.route.id === "stellar_to_base_cctp"
          ? "Circle CCTP (Stellar → Base)"
          : "Base Direct USDC";

  return (
    <div
      className="payment-timeline-container"
      role="region"
      aria-label="Payment Progress Timeline"
    >
      {/* Header Bar */}
      <div className="timeline-header">
        <div className="timeline-title-group">
          <div className="timeline-kicker">
            <span className="live-dot" />
            <span>Where is my money right now?</span>
          </div>
          <h3 className="timeline-route-title">{routeLabel}</h3>
          <p className="timeline-amount-meta">
            Sending <strong>{payment.expectedAmount} USDC</strong> to{" "}
            <strong>{payment.recipientAddress}</strong>
          </p>
        </div>

        <div className="timeline-header-actions">
          <span className="elapsed-badge">
            <Clock className="mini-clock" />
            <span>{timeline.elapsedFormatted}</span>
          </span>

          {onRefresh && (
            <button
              type="button"
              className="refresh-btn"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label="Refresh payment status"
            >
              <RefreshCw className={`refresh-icon ${isRefreshing ? "spin" : ""}`} />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              className="close-timeline-btn"
              onClick={onClose}
              aria-label="Close timeline"
            >
              <X className="close-icon" />
            </button>
          )}
        </div>
      </div>

      {/* Live State Banner */}
      {timeline.isCompleted ? (
        <div className="timeline-status-banner success">
          <CheckCircle2 className="status-banner-icon" />
          <div className="banner-text">
            <strong>Payment Delivered & Finalized</strong>
            <p>
              Destination settlement verified on-chain. Recipient received exact amount.
            </p>
          </div>
          {onViewReceipt && (
            <button
              type="button"
              className="view-receipt-action-btn"
              onClick={onViewReceipt}
            >
              <FileText className="receipt-btn-icon" />
              <span>Receipt</span>
            </button>
          )}
        </div>
      ) : timeline.isFailed ? (
        <div className="timeline-status-banner failure">
          <AlertCircle className="status-banner-icon" />
          <div className="banner-text">
            <strong>Payment Failed</strong>
            <p>
              Failed at stage:{" "}
              <strong>{failedStep?.title ?? "Payment execution"}</strong>. {timeline.failureReason}
            </p>
          </div>
        </div>
      ) : timeline.isStalled ? (
        <div className="timeline-status-banner stalled">
          <AlertTriangle className="status-banner-icon" />
          <div className="banner-text">
            <strong>Network Confirmation Taking Longer Than Usual</strong>
            <p>
              The last recorded stage has not changed recently. Check the transaction reference before retrying.
            </p>
          </div>
        </div>
      ) : (
        <div className="timeline-status-banner in-progress">
          <Loader2 className="status-banner-icon spinner" />
          <div className="banner-text">
            <strong>In Progress</strong>
            <p>{timeline.latestMessage}</p>
          </div>
        </div>
      )}

      {/* Vertical Stepper Timeline */}
      <div className="timeline-stepper">
        {timeline.steps.map((step, idx) => {
          const isDone = step.status === "completed";
          const isCurrent = step.status === "current";
          const isFailedStep = step.status === "failed";
          const isStalledStep = step.status === "stalled";

          return (
            <div
              key={step.id}
              className={`timeline-step-row ${step.status}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Stepper Rail & Marker */}
              <div className="stepper-indicator-col">
                <div className={`step-marker ${step.status}`}>
                  {isDone ? (
                    <CheckCircle2 className="marker-icon done" />
                  ) : isCurrent ? (
                    <Loader2 className="marker-icon spinner" />
                  ) : isFailedStep ? (
                    <AlertCircle className="marker-icon failed" />
                  ) : isStalledStep ? (
                    <Clock className="marker-icon stalled" />
                  ) : (
                    <span className="marker-number">{idx + 1}</span>
                  )}
                </div>
                {idx < timeline.steps.length - 1 && (
                  <div className={`stepper-line ${isDone ? "completed-line" : ""}`} />
                )}
              </div>

              {/* Step Content */}
              <div className="step-content-col">
                <div className="step-title-line">
                  <h4 className="step-title">{step.title}</h4>
                  {step.network && (
                    <span className={`network-badge ${step.network}`}>
                      {step.network === "stellar" ? "Stellar Testnet" : "Base Sepolia"}
                    </span>
                  )}
                </div>

                <p className="step-description">{step.description}</p>

                {/* Evidence & Hash Link */}
                {step.txHash && (
                  <div className="step-evidence-link-box">
                    <span className="evidence-label">Proof:</span>
                    {step.explorerUrl ? (
                      <a
                        href={step.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="explorer-anchor"
                      >
                        <code>
                          {step.txHash.slice(0, 10)}...{step.txHash.slice(-8)}
                        </code>
                        <ArrowUpRight className="link-arrow" />
                      </a>
                    ) : (
                      <code>
                        {step.txHash.slice(0, 10)}...{step.txHash.slice(-8)}
                      </code>
                    )}

                    <button
                      type="button"
                      className="copy-tx-btn"
                      onClick={() => handleCopyTx(step.txHash!)}
                      title="Copy transaction hash"
                    >
                      <Copy className="copy-icon" />
                      {copiedTx === step.txHash && (
                        <span className="copied-tooltip">Copied!</span>
                      )}
                    </button>
                  </div>
                )}

                {/* Error message if step failed */}
                {step.errorMessage && (
                  <div className="step-error-notice">
                    <span>Error: {step.errorMessage}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Collapsible Verified Event Audit Log */}
      <div className="events-log-section">
        <button
          type="button"
          className="toggle-events-btn"
          onClick={() => setShowEventsLog((prev) => !prev)}
          aria-expanded={showEventsLog}
        >
          <ShieldCheck className="shield-icon" />
          <span>Audit Trail ({events.length} verified events)</span>
          <ChevronDown className={`chevron-icon ${showEventsLog ? "open" : ""}`} />
        </button>

        {showEventsLog && (
          <div className="events-log-container">
            {events.length === 0 ? (
              <p className="empty-log-msg">No event records persisted yet.</p>
            ) : (
              <ul className="events-list">
                {events.map((evt) => (
                  <li key={evt.id} className="event-list-item">
                    <div className="event-item-top">
                      <span className="event-stage-tag">{evt.stage}</span>
                      <span className="event-time">
                        {new Date(evt.completedAt ?? evt.occurredAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="event-msg">{evt.publicMessage}</p>
                    {evt.txHash && (
                      <span className="event-tx">
                        Hash: {evt.txHash.slice(0, 10)}...{evt.txHash.slice(-8)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="timeline-footer">
        {onViewReceipt && (
          <button
            type="button"
            className="cta-button primary view-receipt-full-btn"
            onClick={onViewReceipt}
          >
            <FileText className="btn-icon" />
            <span>View Verified Receipt</span>
          </button>
        )}

        {onClose && (
          <button type="button" className="timeline-done-btn" onClick={onClose}>
            Back to Chat
          </button>
        )}
      </div>
    </div>
  );
}
