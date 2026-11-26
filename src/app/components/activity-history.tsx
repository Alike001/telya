"use client";

import { useState } from "react";
import type { PersistedPayment } from "../../domain/payment-activity";
import {
  CheckCircle2,
  History,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";

interface ActivityHistoryProps {
  readonly payments: readonly PersistedPayment[];
  readonly activePaymentId?: string | null;
  readonly onSelectPayment: (payment: PersistedPayment) => void;
  readonly onOpenTimeline: (payment: PersistedPayment) => void;
}

export function ActivityHistory({
  payments,
  activePaymentId,
  onSelectPayment,
  onOpenTimeline,
}: ActivityHistoryProps) {
  const [filter, setFilter] = useState<"all" | "completed" | "in_progress" | "failed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPayments = payments.filter((payment) => {
    // Filter by status category
    if (filter === "completed" && payment.status !== "completed") return false;
    if (
      filter === "in_progress" &&
      (payment.status === "completed" || payment.status === "failed")
    ) {
      return false;
    }
    if (filter === "failed" && payment.status !== "failed") return false;

    // Filter by search query (handle, amount, or id)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRecipient = payment.recipientAddress.toLowerCase().includes(q);
      const matchAmount = payment.expectedAmount.includes(q);
      const matchId = payment.id.toLowerCase().includes(q);
      return matchRecipient || matchAmount || matchId;
    }

    return true;
  });

  return (
    <div className="activity-history-container" role="region" aria-label="Transaction Activity">
      {/* Activity Controls */}
      <div className="activity-controls">
        <div className="search-bar-box">
          <Search className="search-icon" />
          <input
            type="text"
            className="activity-search-input"
            placeholder="Search by @handle or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-chips">
          <button
            type="button"
            className={`filter-chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({payments.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === "completed" ? "active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            Completed
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === "in_progress" ? "active" : ""}`}
            onClick={() => setFilter("in_progress")}
          >
            In Progress
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === "failed" ? "active" : ""}`}
            onClick={() => setFilter("failed")}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Payment List */}
      <div className="activity-list">
        {filteredPayments.length === 0 ? (
          <div className="activity-empty-state">
            <History className="empty-icon" />
            <p className="empty-title">No transactions found</p>
            <p className="empty-sub">
              {payments.length === 0
                ? "Send USDC using voice or prompt to see your live settlement history."
                : "No transactions match your current search or filter."}
            </p>
          </div>
        ) : (
          filteredPayments.map((payment) => {
            const isCompleted = payment.status === "completed";
            const isFailed = payment.status === "failed";
            const isInProgress = !isCompleted && !isFailed;
            const isSelected = payment.id === activePaymentId;

            const routeLabel =
              payment.route.id === "stellar_to_stellar"
                ? "Stellar Direct"
                : payment.route.id === "base_to_stellar_cctp"
                  ? "Base → Stellar CCTP"
                  : payment.route.id === "stellar_to_base_cctp"
                    ? "Stellar → Base CCTP"
                    : "Base Direct";

            return (
              <div
                key={payment.id}
                className={`activity-card ${isSelected ? "selected" : ""} ${payment.status}`}
                onClick={() => onSelectPayment(payment)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectPayment(payment);
                }}
              >
                {/* Left: Avatar & Info */}
                <div className="activity-card-left">
                  <div className={`activity-avatar ${isInProgress ? "pulsing" : ""}`}>
                    <span>
                      {payment.recipientAddress.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  <div className="activity-meta">
                    <div className="recipient-row">
                      <strong className="recipient-handle">
                        {payment.recipientAddress.slice(0, 10)}…{payment.recipientAddress.slice(-6)}
                      </strong>
                      <span className="route-tag">{routeLabel}</span>
                    </div>
                    <span className="activity-date">
                      {new Date(payment.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Right: Amount & Status */}
                <div className="activity-card-right">
                  <div className="activity-amount-box">
                    <span className="activity-amount tabular">
                      -{payment.expectedAmount} {payment.asset}
                    </span>
                  </div>

                  <div className="activity-status-row">
                    {isCompleted ? (
                      <span className="status-badge completed">
                        <CheckCircle2 className="status-mini-icon" /> Completed
                      </span>
                    ) : isFailed ? (
                      <span className="status-badge failed">
                        <XCircle className="status-mini-icon" /> Failed
                      </span>
                    ) : (
                      <span className="status-badge in-progress">
                        <Loader2 className="status-mini-icon spinner" /> In Progress
                      </span>
                    )}

                    {isInProgress && (
                      <button
                        type="button"
                        className="track-live-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTimeline(payment);
                        }}
                      >
                        Track
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
