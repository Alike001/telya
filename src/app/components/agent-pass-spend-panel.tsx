"use client";

import { useRef, useState } from "react";
import type { SmartAccountKit } from "smart-account-kit";
import { ArrowUpRight, Bot, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import type { ActiveAgentPass } from "../../stellar/agent-pass";
import { getExplorerUrl } from "../../domain/payment-timeline";
import type {
  PaymentExecutionResult,
  PaymentReview,
} from "./conversation-payment";
import { reconcileConversationPayment } from "./conversation-payment-execution";
import {
  executeAgentPassPayment,
  prepareAgentPassPayment,
} from "./agent-pass-payment-execution";
import { runPaymentActionOnce } from "./payment-action-guard";

type Request = (input: string, init?: RequestInit) => Promise<Response>;

export function AgentPassSpendPanel({
  session,
  request,
  onStatusChanged,
}: {
  readonly session: {
    readonly kit: SmartAccountKit;
    readonly pass: ActiveAgentPass;
    readonly tokenContract: string;
  } | null;
  readonly request: Request;
  readonly onStatusChanged: () => Promise<void>;
}) {
  const [recipientInput, setRecipientInput] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [execution, setExecution] = useState<PaymentExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "reviewing" | "submitting" | "refreshing">("idle");
  const actionGuard = useRef<Promise<PaymentExecutionResult> | null>(null);

  function resetReview() {
    setReview(null);
    setExecution(null);
    setError(null);
  }

  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setPhase("reviewing");
    setError(null);
    setExecution(null);
    try {
      setReview(await prepareAgentPassPayment({ recipientInput, amount, request }));
    } catch (cause) {
      setReview(null);
      setError(cause instanceof Error ? cause.message : "The Agent Pass payment review is unavailable.");
    } finally {
      setPhase("idle");
    }
  }

  async function submit() {
    if (!session || !review) return;
    setPhase("submitting");
    setError(null);
    try {
      const result = await runPaymentActionOnce(actionGuard, () => executeAgentPassPayment({
        review,
        kit: session.kit,
        pass: session.pass,
        tokenContract: session.tokenContract,
        request,
      }));
      setExecution(result);
      await onStatusChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Agent Pass payment could not be authorized.");
    } finally {
      setPhase("idle");
    }
  }

  async function refresh() {
    if (!review || !execution || execution.status === "completed" || execution.status === "failed") return;
    setPhase("refreshing");
    setError(null);
    try {
      const transactionHash = execution.transactionHash ?? undefined;
      const result = await runPaymentActionOnce(
        actionGuard,
        () => reconcileConversationPayment(review, transactionHash, request),
      );
      setExecution(result);
      await onStatusChanged();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "The persisted Agent Pass payment status is unavailable.");
    } finally {
      setPhase("idle");
    }
  }

  if (!session) {
    return (
      <div className="security-guarantee-box" role="status">
        <Bot className="mini-shield" />
        <p>
          <strong>Agent key unavailable in this browser session.</strong> The private key is never
          persisted. A newly created pass can demonstrate bounded spending until this page is refreshed.
        </p>
      </div>
    );
  }

  return (
    <div className="spending-metric-box" aria-label="Agent Pass payment">
      <div className="metric-labels">
        <span className="metric-label">Run a bounded agent payment</span>
        <span className="proof-text">Direct Stellar USDC only</span>
      </div>

      <form onSubmit={prepare} className="create-pass-form">
        <div className="form-field">
          <label htmlFor="agentRecipient">Verified recipient username or Stellar address</label>
          <input
            id="agentRecipient"
            type="text"
            value={recipientInput}
            onChange={(event) => { setRecipientInput(event.target.value); resetReview(); }}
            placeholder="@recipient"
            autoComplete="off"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="agentAmount">Amount (USDC)</label>
          <input
            id="agentAmount"
            type="number"
            step="0.0000001"
            min="0.0000001"
            value={amount}
            onChange={(event) => { setAmount(event.target.value); resetReview(); }}
            required
          />
        </div>
        {!review && (
          <button type="submit" className="cta-button primary" disabled={phase !== "idle"}>
            {phase === "reviewing"
              ? <><Loader2 className="btn-icon spinner" /> Verifying payment…</>
              : <>Review exact agent payment</>}
          </button>
        )}
      </form>

      {review && !execution && (
        <div className="pass-details-table">
          <div className="detail-row">
            <span className="detail-label">Recipient gets</span>
            <strong>{review.expectedRecipientAmount} USDC</strong>
          </div>
          <div className="detail-row">
            <span className="detail-label">Verified destination</span>
            <code className="monospace-sm" title={review.recipientAddress}>
              {review.recipientAddress.slice(0, 8)}…{review.recipientAddress.slice(-6)}
            </code>
          </div>
          <div className="detail-row">
            <span className="detail-label">Route</span>
            <span className="detail-value">Stellar Direct USDC</span>
          </div>
          {review.fees.map((fee, index) => (
            <div className="detail-row" key={`${fee.kind}:${fee.label}:${index}`}>
              <span className="detail-label">{fee.label}</span>
              <span className="detail-value">{fee.amount} {fee.asset} · {fee.payer}</span>
            </div>
          ))}
          <p className="proof-text">
            Nothing has been submitted. Continue only if this exact recipient, amount, route and fee breakdown are correct.
          </p>
          <button
            type="button"
            className="cta-button primary"
            disabled={phase !== "idle"}
            onClick={() => { void submit(); }}
          >
            {phase === "submitting"
              ? <><Loader2 className="btn-icon spinner" /> Agent authorizing…</>
              : <><Bot className="btn-icon" /> Run with Agent Pass</>}
          </button>
        </div>
      )}

      {execution?.status === "completed" && (
        <div className="pass-banner success" role="status">
          <CheckCircle2 className="banner-icon" />
          <span>
            {execution.verifiedAmount} USDC reached the exact verified recipient. {" "}
            <a href={getExplorerUrl("stellar", execution.transactionHash)} target="_blank" rel="noreferrer">
              View transaction <ArrowUpRight className="inline-check" />
            </a>
          </span>
        </div>
      )}
      {execution && execution.status !== "completed" && (
        <div className="pass-banner error" role="status">
          <span>{execution.message}</span>
        </div>
      )}
      {execution && (execution.status === "pending" || execution.status === "unverified" ||
        execution.status === "status_unknown") && (
        <button type="button" className="cta-button primary" onClick={() => { void refresh(); }} disabled={phase !== "idle"}>
          <RefreshCw className={`btn-icon ${phase === "refreshing" ? "spinner" : ""}`} />
          {phase === "refreshing" ? "Checking verified status…" : "Refresh verified status"}
        </button>
      )}
      {error && <div className="pass-banner error" role="alert">{error}</div>}
    </div>
  );
}
