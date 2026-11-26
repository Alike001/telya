"use client";

import { useEffect, useState } from "react";
import type { AgentPass } from "../../domain/contracts";
import { getExplorerUrl } from "../../domain/payment-timeline";
import {
  createStellarAgentPass,
  revokeStellarAgentPass,
  type ActiveAgentPass,
} from "../../stellar/agent-pass";
import type { SmartAccountPublicConfig } from "../../stellar/smart-account";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

interface AgentPassPanelProps {
  readonly smartAccountAddress: string | null;
  readonly kit?: any;
  readonly onClose?: () => void;
  readonly onOpenPayment?: (prompt: string) => void;
}

export function AgentPassPanel({
  smartAccountAddress,
  kit,
  onClose,
  onOpenPayment,
}: AgentPassPanelProps) {
  const [pass, setPass] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Creation form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [spendingLimitInput, setSpendingLimitInput] = useState("25.00");
  const [durationHours, setDurationHours] = useState(24);

  // Fetch active Agent Pass from API
  useEffect(() => {
    if (!smartAccountAddress) return;
    void fetchPass();
  }, [smartAccountAddress]);

  async function fetchPass() {
    if (!smartAccountAddress) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stellar/agent-passes/${smartAccountAddress}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setPass(data);
      } else if (res.status === 404) {
        setPass(null);
      } else {
        throw new Error("Agent Pass status is unavailable. Please retry.");
      }
    } catch {
      setPass(null);
      setError("Agent Pass status could not be verified. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateAgentPass(e: React.FormEvent) {
    e.preventDefault();
    if (!kit || !smartAccountAddress) {
      setError("Please connect your passkey account to create an Agent Pass.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const configRes = await fetch("/api/stellar/config", { cache: "no-store" });
      if (!configRes.ok) throw new Error("Could not load Stellar configuration.");
      const config: SmartAccountPublicConfig = await configRes.json();

      // Convert hours to ledgers (~5 seconds per ledger on Stellar)
      // 1 hour = ~720 ledgers
      const durationLedgers = durationHours * 720;

      const created: ActiveAgentPass = await createStellarAgentPass({
        kit,
        tokenContract: config.usdcContract,
        ed25519VerifierAddress: config.ed25519VerifierAddress,
        spendingLimitPolicyAddress: config.spendingLimitPolicyAddress,
        spendingLimit: spendingLimitInput,
        durationLedgers,
      });

      setSuccessNotice(`Agent Pass creation submitted for Rule #${created.ruleId}. Checking its recorded status.`);
      setShowCreateModal(false);
      await fetchPass();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Agent Pass.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevokeAgentPass() {
    if (!kit || !pass) return;
    const confirmRevoke = window.confirm(
      "Are you sure you want to revoke this Agent Pass? The AI agent will immediately lose spending access.",
    );
    if (!confirmRevoke) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const result = await revokeStellarAgentPass({
        kit,
        pass: { ruleId: pass.ruleId },
      });

      setSuccessNotice(`Revocation submitted. Check the recorded status before assuming the pass is inactive. Transaction: ${result.transactionHash.slice(0, 10)}...`);
      await fetchPass();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke Agent Pass.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPassActive = pass && pass.status === "active";
  const limitNum = pass ? parseFloat(pass.spendingLimit) : 0;
  const spentNum = pass ? parseFloat(pass.spentAmount) : 0;
  const progressPercent = limitNum > 0 ? Math.min(100, Math.round((spentNum / limitNum) * 100)) : 0;
  const remainingNum = Math.max(0, limitNum - spentNum);

  return (
    <div className="agent-pass-panel" role="region" aria-label="Agent Pass Management">
      {/* Header */}
      <div className="pass-panel-header">
        <div className="panel-title-group">
          <div className="pass-kicker">
            <KeyRound className="mini-icon" />
            <span>Autonomous Spending Controls</span>
          </div>
          <h2 className="panel-title">Stellar Agent Pass</h2>
          <p className="panel-sub">
            Empower AI agents to execute payments within strict spending allowances. You remain in
            complete control with 1-tap instant revocation.
          </p>
        </div>

        {onClose && (
          <button type="button" className="close-panel-btn" onClick={onClose} aria-label="Close">
            <X className="close-icon" />
          </button>
        )}
      </div>

      {/* Notices */}
      {error && (
        <div className="pass-banner error">
          <AlertTriangle className="banner-icon" />
          <span>{error}</span>
        </div>
      )}

      {successNotice && (
        <div className="pass-banner success">
          <CheckCircle2 className="banner-icon" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Pass Status Content */}
      {!smartAccountAddress ? (
        <div className="pass-empty-state">
          <Lock className="empty-icon" />
          <h3>Connect Your Account</h3>
          <p>You must connect with a passkey before creating or managing Agent Passes.</p>
          <a href="/onboarding" className="cta-button primary">
            Connect Passkey
          </a>
        </div>
      ) : isLoading ? (
        <div className="pass-loading-state">
          <Loader2 className="spinner" />
          <span>Loading Agent Pass status from Stellar Testnet...</span>
        </div>
      ) : isPassActive ? (
        <div className="active-pass-card">
          {/* Card Top */}
          <div className="active-pass-top">
            <div className="pass-badge active">
              <ShieldCheck className="badge-icon" />
              <span>Active Agent Pass</span>
            </div>
            <span className="rule-tag">Rule #{pass.ruleId}</span>
          </div>

          {/* Spending Progress Bar */}
          <div className="spending-metric-box">
            <div className="metric-labels">
              <span className="metric-label">Allowance Spent</span>
              <span className="metric-values">
                <strong>${spentNum.toFixed(2)}</strong> / ${limitNum.toFixed(2)} USDC
              </span>
            </div>
            <div className="allowance-progress-track">
              <div
                className="allowance-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="metric-footer">
              <span>{progressPercent}% consumed</span>
              <span className="proof-text">${remainingNum.toFixed(2)} USDC remaining</span>
            </div>
          </div>

          {/* Parameters & Verification */}
          <div className="pass-details-table">
            <div className="detail-row">
              <span className="detail-label">Agent Public Key</span>
              <code className="monospace-sm">
                {pass.agentAddress.slice(0, 8)}...{pass.agentAddress.slice(-6)}
              </code>
            </div>

            <div className="detail-row">
              <span className="detail-label">Context Policy</span>
              <span className="detail-value">USDC Spending Limit Contract</span>
            </div>

            {pass.validUntilLedger && (
              <div className="detail-row">
                <span className="detail-label">Expires At Ledger</span>
                <span className="detail-value tabular">#{pass.validUntilLedger}</span>
              </div>
            )}

            {pass.createTransactionHash && (
              <div className="detail-row">
                <span className="detail-label">Creation Evidence</span>
                <a
                  href={getExplorerUrl("stellar", pass.createTransactionHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="explorer-link-pill"
                >
                  <code>
                    {pass.createTransactionHash.slice(0, 8)}...
                    {pass.createTransactionHash.slice(-6)}
                  </code>
                  <ArrowUpRight className="link-arrow" />
                </a>
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="pass-card-actions">
            {onOpenPayment && (
              <button
                type="button"
                className="cta-button secondary test-agent-btn"
                onClick={() =>
                  onOpenPayment("Pay @alice 1 USDC using my active Agent Pass")
                }
              >
                Test Agent Spend
              </button>
            )}

            <button
              type="button"
              className="revoke-btn"
              onClick={handleRevokeAgentPass}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="btn-icon spinner" />
                  <span>Revoking on Stellar...</span>
                </>
              ) : (
                <>
                  <Trash2 className="btn-icon" />
                  <span>Revoke Agent Pass</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* No Active Pass State */
        <div className="no-pass-card">
          <div className="no-pass-icon-box">
            <Shield className="shield-icon-lg" />
          </div>
          <h3>No Active Agent Pass</h3>
          <p>
            You currently have no delegated agents authorized. Create a scoped Agent Pass to let
            autonomous agents pay subscriptions, invoices, or team members on your behalf.
          </p>

          <button
            type="button"
            className="cta-button primary create-pass-trigger-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="btn-icon" />
            <span>Create Agent Pass</span>
          </button>
        </div>
      )}

      {/* Create Modal Dialog */}
      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="create-pass-modal">
            <div className="modal-header">
              <h3>Create Stellar Agent Pass</h3>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="close-icon" />
              </button>
            </div>

            <form onSubmit={handleCreateAgentPass} className="create-pass-form">
              <div className="form-field">
                <label htmlFor="limitInput">Spending Allowance (USDC)</label>
                <div className="input-with-affix">
                  <span className="affix">$</span>
                  <input
                    id="limitInput"
                    type="number"
                    step="0.01"
                    min="1.00"
                    max="1000.00"
                    value={spendingLimitInput}
                    onChange={(e) => setSpendingLimitInput(e.target.value)}
                    required
                  />
                  <span className="affix">USDC</span>
                </div>
                <div className="preset-buttons">
                  {["10.00", "25.00", "50.00", "100.00"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`preset-chip ${spendingLimitInput === val ? "active" : ""}`}
                      onClick={() => setSpendingLimitInput(val)}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="durationSelect">Duration Limit</label>
                <select
                  id="durationSelect"
                  value={durationHours}
                  onChange={(e) => setDurationHours(parseInt(e.target.value, 10))}
                  className="select-input"
                >
                  <option value={1}>1 Hour (~720 ledgers)</option>
                  <option value={24}>24 Hours (~17,280 ledgers)</option>
                  <option value={168}>7 Days (~120,960 ledgers)</option>
                </select>
              </div>

              <div className="security-guarantee-box">
                <ShieldCheck className="mini-shield" />
                <p>
                  <strong>Non-Custodial Enforcement:</strong> The smart account contract rejects any
                  agent transaction exceeding <strong>${spendingLimitInput} USDC</strong> or submitted after expiration.
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cta-button primary submit-create-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="btn-icon spinner" />
                      <span>Authorizing Passkey...</span>
                    </>
                  ) : (
                    <span>Authorize & Create Pass</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
