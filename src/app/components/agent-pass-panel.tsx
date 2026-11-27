"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { SmartAccountKit } from "smart-account-kit";
import {
  formatStellarAtomicAmount,
  parseAgentPassAuthorization,
  parsePersistedAgentPass,
  type PersistedAgentPass,
} from "../../domain/agent-pass-status";
import { getExplorerUrl } from "../../domain/payment-timeline";
import {
  createStellarAgentPass,
  revokeStellarAgentPass,
  type ActiveAgentPass,
} from "../../stellar/agent-pass";
import type { SmartAccountPublicConfig } from "../../stellar/smart-account";
import { createBrowserSmartAccountKit, restoreSmartAccount } from "../../stellar/smart-account";
import { authenticatedFetch } from "../authenticated-fetch";
import {
  captureSessionAccessToken,
  createSessionRequestGuard,
  type SessionRequestGuard,
} from "../session-request-guard";
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
import { AgentPassSpendPanel } from "./agent-pass-spend-panel";

interface AgentPassPanelProps {
  readonly smartAccountAddress: string | null;
  readonly kit?: SmartAccountKit;
  readonly onKitChange?: (kit: SmartAccountKit) => void;
  readonly onClose?: () => void;
}

export function AgentPassPanel(props: AgentPassPanelProps) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <div className="agent-pass-panel" role="region" aria-label="Agent Pass Management">
        <div className="pass-empty-state">
          <Lock className="empty-icon" />
          <h3>Agent Passes Unavailable</h3>
          <p>Authenticated sign-in is not configured. Telya will not sponsor or report Agent Pass operations without it.</p>
        </div>
      </div>
    );
  }
  return <AuthenticatedAgentPassPanel {...props} />;
}

function AuthenticatedAgentPassPanel(props: AgentPassPanelProps) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  if (!ready || !authenticated) {
    return (
      <div className="agent-pass-panel" role="region" aria-label="Agent Pass Management">
        <div className="pass-empty-state">
          <Lock className="empty-icon" />
          <h3>{ready ? "Sign In to Manage Agent Passes" : "Checking Sign-In"}</h3>
          <p>Agent Pass sponsorship requires both the authenticated Telya owner and the smart-account passkey.</p>
          {ready && <button type="button" className="cta-button primary" onClick={login}>Sign in</button>}
        </div>
      </div>
    );
  }
  return <AgentPassManagement {...props} getAccessToken={getAccessToken} />;
}

function AgentPassManagement({
  smartAccountAddress,
  kit,
  onKitChange,
  onClose,
  getAccessToken,
}: AgentPassPanelProps & {
  readonly getAccessToken: () => Promise<string | null>;
}) {
  const [pass, setPass] = useState<PersistedAgentPass | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [agentSpendSession, setAgentSpendSession] = useState<{
    readonly kit: SmartAccountKit;
    readonly pass: ActiveAgentPass;
    readonly tokenContract: string;
  } | null>(null);

  // Creation form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [spendingLimitInput, setSpendingLimitInput] = useState("25.00");
  const [durationHours, setDurationHours] = useState(24);
  const sessionGuardRef = useRef<SessionRequestGuard | null>(null);

  async function captureOperationRequest(guard: SessionRequestGuard) {
    const tokenProvider = await captureSessionAccessToken(getAccessToken, guard);
    return (input: string, init: RequestInit = {}) =>
      authenticatedFetch(input, init, tokenProvider);
  }

  // Fetch active Agent Pass from API
  useEffect(() => {
    sessionGuardRef.current?.cancel();
    sessionGuardRef.current = null;
    setPass(null);
    setAgentSpendSession(null);
    setError(null);
    setSuccessNotice(null);
    setShowCreateModal(false);
    setIsLoading(false);
    setIsSubmitting(false);
    if (!smartAccountAddress) return;
    const guard = createSessionRequestGuard();
    sessionGuardRef.current = guard;
    void fetchPass(guard, smartAccountAddress);
    return () => {
      guard.cancel();
      if (sessionGuardRef.current === guard) sessionGuardRef.current = null;
    };
  }, [smartAccountAddress]);

  async function fetchPass(
    guard: SessionRequestGuard | null = sessionGuardRef.current,
    accountAddress: string | null = smartAccountAddress,
    operationRequest?: (input: string, init?: RequestInit) => Promise<Response>,
  ) {
    if (!accountAddress || !guard?.isActive()) return;
    setIsLoading(true);
    setError(null);
    try {
      const request = operationRequest ?? await captureOperationRequest(guard);
      const res = await request(`/api/stellar/agent-passes/${accountAddress}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data: unknown = await res.json();
        const parsed = parsePersistedAgentPass(data);
        if (!parsed || parsed.smartAccount !== accountAddress) {
          throw new Error("Agent Pass status evidence could not be verified.");
        }
        if (!guard.isActive()) return;
        setPass(parsed);
        if (parsed.status !== "active") setAgentSpendSession(null);
      } else if (res.status === 404) {
        if (!guard.isActive()) return;
        setPass(null);
        setAgentSpendSession(null);
      } else {
        throw new Error("Agent Pass status is unavailable. Please retry.");
      }
    } catch {
      if (!guard.isActive()) return;
      setPass(null);
      setError("Agent Pass status could not be verified. Please retry.");
    } finally {
      if (guard.isActive()) setIsLoading(false);
    }
  }

  async function handleCreateAgentPass(e: React.FormEvent) {
    e.preventDefault();
    if (!kit || !smartAccountAddress) {
      setError("Please connect your passkey account to create an Agent Pass.");
      return;
    }
    const guard = sessionGuardRef.current;
    const accountAddress = smartAccountAddress;
    if (!guard?.isActive()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const request = await captureOperationRequest(guard);
      const configRes = await fetch("/api/stellar/config", { cache: "no-store" });
      if (!configRes.ok) throw new Error("Could not load Stellar configuration.");
      const config: SmartAccountPublicConfig = await configRes.json();
      const authorizationRes = await request("/api/stellar/agent-passes/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "create", smartAccount: accountAddress }),
      });
      const authorizationPayload: unknown = await authorizationRes.json();
      const authorization = authorizationRes.ok
        ? parseAgentPassAuthorization(authorizationPayload)
        : null;
      if (!authorization) throw new Error("Authenticated Agent Pass authorization is unavailable.");
      const authorizedKit = createBrowserSmartAccountKit({
        ...config,
        relayerUrl: authorization.relayerUrl,
      });
      const restored = await restoreSmartAccount(authorizedKit);
      if (restored?.contractId !== accountAddress) {
        throw new Error("The authenticated Agent Pass account does not match the restored passkey account.");
      }
      if (!guard.isActive()) return;

      // Convert hours to ledgers (~5 seconds per ledger on Stellar)
      // 1 hour = ~720 ledgers
      const durationLedgers = durationHours * 720;

      const created: ActiveAgentPass = await createStellarAgentPass({
        kit: authorizedKit,
        tokenContract: config.usdcContract,
        ed25519VerifierAddress: config.ed25519VerifierAddress,
        spendingLimitPolicyAddress: config.spendingLimitPolicyAddress,
        spendingLimit: spendingLimitInput,
        durationLedgers,
      });

      if (!guard.isActive()) return;
      onKitChange?.(authorizedKit);
      setAgentSpendSession({
        kit: authorizedKit,
        pass: created,
        tokenContract: config.usdcContract,
      });
      setSuccessNotice(`Agent Pass creation submitted for Rule #${created.ruleId}. Checking its recorded status.`);
      setShowCreateModal(false);
      await fetchPass(guard, accountAddress, request);
    } catch (err) {
      if (!guard.isActive()) return;
      setError(err instanceof Error ? err.message : "Failed to create Agent Pass.");
    } finally {
      if (guard.isActive()) setIsSubmitting(false);
    }
  }

  async function handleRevokeAgentPass() {
    if (!kit || !pass) return;
    const guard = sessionGuardRef.current;
    const accountAddress = smartAccountAddress;
    if (!accountAddress || !guard?.isActive() || pass.smartAccount !== accountAddress) return;
    const confirmRevoke = window.confirm(
      "Are you sure you want to revoke this Agent Pass? The AI agent will immediately lose spending access.",
    );
    if (!confirmRevoke) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const request = await captureOperationRequest(guard);
      const configRes = await fetch("/api/stellar/config", { cache: "no-store" });
      if (!configRes.ok) throw new Error("Could not load Stellar configuration.");
      const config: SmartAccountPublicConfig = await configRes.json();
      const authorizationRes = await request("/api/stellar/agent-passes/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "revoke",
          smartAccount: pass.smartAccount,
          contextRuleId: pass.ruleId,
        }),
      });
      const authorizationPayload: unknown = await authorizationRes.json();
      const authorization = authorizationRes.ok
        ? parseAgentPassAuthorization(authorizationPayload)
        : null;
      if (!authorization) throw new Error("Authenticated Agent Pass authorization is unavailable.");
      const authorizedKit = createBrowserSmartAccountKit({
        ...config,
        relayerUrl: authorization.relayerUrl,
      });
      const restored = await restoreSmartAccount(authorizedKit);
      if (restored?.contractId !== pass.smartAccount) {
        throw new Error("The authenticated Agent Pass account does not match the restored passkey account.");
      }
      if (!guard.isActive()) return;
      const result = await revokeStellarAgentPass({
        kit: authorizedKit,
        pass: { ruleId: pass.ruleId },
      });

      if (!guard.isActive()) return;
      onKitChange?.(authorizedKit);
      setAgentSpendSession(null);
      setSuccessNotice(`Revocation submitted. Check the recorded status before assuming the pass is inactive. Transaction: ${result.transactionHash.slice(0, 10)}...`);
      await fetchPass(guard, accountAddress, request);
    } catch (err) {
      if (!guard.isActive()) return;
      setError(err instanceof Error ? err.message : "Failed to revoke Agent Pass.");
    } finally {
      if (guard.isActive()) setIsSubmitting(false);
    }
  }

  const isPassActive = pass?.status === "active";
  const progressPercent = pass
    ? Number((pass.spentAmountAtomic * 100n) / pass.spendingLimitAtomic)
    : 0;
  const remainingAmount = pass
    ? formatStellarAtomicAmount(pass.spendingLimitAtomic - pass.spentAmountAtomic)
    : "0";

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
            Authorize an ephemeral agent key within an on-chain USDC spending limit and expiry.
            Owner passkey authorization is required to create or revoke the rule.
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
                <strong>{pass.spentAmount}</strong> / {pass.spendingLimit} USDC
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
              <span className="proof-text">{remainingAmount} USDC remaining</span>
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

          <AgentPassSpendPanel
            session={agentSpendSession}
            captureRequest={async () => {
              const guard = sessionGuardRef.current;
              if (!guard?.isActive()) throw new Error("Authenticated session changed.");
              return captureOperationRequest(guard);
            }}
            onStatusChanged={fetchPass}
          />

          {/* Action Row */}
          <div className="pass-card-actions">
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
      ) : pass?.status === "expired" ? (
        <div className="no-pass-card">
          <div className="no-pass-icon-box">
            <ShieldAlert className="shield-icon-lg" />
          </div>
          <h3>Agent Pass Expired</h3>
          <p>
            Rule #{pass.ruleId} expired at Stellar ledger #{pass.validUntilLedger}.
            The latest verified ledger was #{pass.observedLedger}, so this pass can no longer authorize payments.
          </p>
          <button
            type="button"
            className="cta-button primary create-pass-trigger-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="btn-icon" />
            <span>Create New Agent Pass</span>
          </button>
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
                  <span className="affix">USDC</span>
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
                      {val} USDC
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
                  agent transaction exceeding <strong>{spendingLimitInput} USDC</strong> or submitted after expiration.
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
