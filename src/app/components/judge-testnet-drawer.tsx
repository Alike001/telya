"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Coins,
  Copy,
  ExternalLink,
  Flame,
  HelpCircle,
  KeyRound,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

interface JudgeTestnetDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onQuickPrompt: (promptText: string) => void;
}

export function JudgeTestnetDrawer({
  isOpen,
  onClose,
  onQuickPrompt,
}: JudgeTestnetDrawerProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  function handleCopy(text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div
      className="judge-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Judge & Testnet Guide"
    >
      <div className="judge-drawer-panel">
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="judge-badge">
              <Sparkles className="mini-icon" /> Hackathon Judge & Evaluator Guide
            </span>
            <h3 className="drawer-title">Testnet Verification Mode</h3>
          </div>

          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close guide"
          >
            <X className="close-icon" />
          </button>
        </div>

        {/* Live Testnet Status Bar */}
        <div className="testnet-status-strip">
          <div className="status-item">
            <span className="status-dot green" />
            <span>Stellar Testnet</span>
          </div>
          <div className="status-item">
            <span className="status-dot green" />
            <span>Base Sepolia</span>
          </div>
          <div className="status-item">
            <span className="status-dot green" />
            <span>Circle CCTP</span>
          </div>
          <div className="status-item">
            <span className="status-dot green" />
            <span>Relayer Sponsored</span>
          </div>
        </div>

        {/* Quick Tour Checklist */}
        <div className="tour-section">
          <h4 className="section-title">
            <BookOpen className="title-icon" /> How to Test Telya in 2 Minutes
          </h4>

          <div className="tour-steps">
            <div className="tour-step">
              <span className="step-badge">1</span>
              <div>
                <strong>Claim Unique Handle & Passkey</strong>
                <p>Click &quot;Connect Passkey&quot; in the header or visit <code>/onboarding</code>. Zero seed phrases.</p>
              </div>
            </div>

            <div className="tour-step">
              <span className="step-badge">2</span>
              <div>
                <strong>Speak or Type a Payment Intent</strong>
                <p>Say &quot;Send 5 USDC to @alice&quot; or click one of the quick test chips below.</p>
              </div>
            </div>

            <div className="tour-step">
              <span className="step-badge">3</span>
              <div>
                <strong>Wise-Style Fee Breakdown</strong>
                <p>Inspect &quot;Why this route?&quot; explaining sponsored Stellar routing vs Circle CCTP cross-chain.</p>
              </div>
            </div>

            <div className="tour-step">
              <span className="step-badge">4</span>
              <div>
                <strong>Live &quot;Where is my money right now?&quot; Timeline</strong>
                <p>Track real state progression from passkey authorization to on-chain destination finality.</p>
              </div>
            </div>

            <div className="tour-step">
              <span className="step-badge">5</span>
              <div>
                <strong>Agent Pass & MoneyGram Sandbox</strong>
                <p>Test scoped autonomous spending limits and simulated retail fiat on/off-ramps.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions for Judges */}
        <div className="quick-fill-section">
          <h4 className="section-title">
            <Play className="title-icon" /> 1-Click Test Scenarios
          </h4>

          <div className="scenario-buttons">
            <button
              type="button"
              className="scenario-btn"
              onClick={() => {
                onQuickPrompt("Send 5 USDC to @alice");
                onClose();
              }}
            >
              <div className="scenario-info">
                <strong>Direct Stellar USDC Transfer</strong>
                <span>&quot;Send 5 USDC to @alice&quot; · Instant & sponsored</span>
              </div>
              <ChevronRight className="arrow-icon" />
            </button>

            <button
              type="button"
              className="scenario-btn"
              onClick={() => {
                onQuickPrompt("Send 10 USDC to @bob from Base");
                onClose();
              }}
            >
              <div className="scenario-info">
                <strong>Circle CCTP Cross-Chain (Base → Stellar)</strong>
                <span>&quot;Send 10 USDC to @bob from Base&quot; · Cryptographic attestation</span>
              </div>
              <ChevronRight className="arrow-icon" />
            </button>

            <button
              type="button"
              className="scenario-btn"
              onClick={() => {
                onQuickPrompt("Where is my money right now?");
                onClose();
              }}
            >
              <div className="scenario-info">
                <strong>Live Settlement Status</strong>
                <span>&quot;Where is my money right now?&quot; · Real progress timeline</span>
              </div>
              <ChevronRight className="arrow-icon" />
            </button>

            <button
              type="button"
              className="scenario-btn"
              onClick={() => {
                onQuickPrompt("View active Agent Passes");
                onClose();
              }}
            >
              <div className="scenario-info">
                <strong>Autonomous Agent Spending Controls</strong>
                <span>&quot;View active Agent Passes&quot; · Allowance & revocation</span>
              </div>
              <ChevronRight className="arrow-icon" />
            </button>
          </div>
        </div>

        {/* Testnet Faucets & Documentation Links */}
        <div className="resources-section">
          <h4 className="section-title">
            <Coins className="title-icon" /> Testnet Faucets & Explorers
          </h4>

          <div className="resource-links">
            <a
              href="https://laboratory.stellar.org/#account-creator?network=testnet"
              target="_blank"
              rel="noreferrer"
              className="resource-pill"
            >
              <span>Stellar Testnet Friendbot</span>
              <ExternalLink className="ext-icon" />
            </a>

            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noreferrer"
              className="resource-pill"
            >
              <span>Circle USDC Faucet</span>
              <ExternalLink className="ext-icon" />
            </a>

            <a
              href="https://stellar.expert/explorer/testnet"
              target="_blank"
              rel="noreferrer"
              className="resource-pill"
            >
              <span>Stellar Expert Explorer</span>
              <ExternalLink className="ext-icon" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <p>
            Built for the Stellar Buildathon · Non-custodial, deterministic financial execution.
          </p>
        </div>
      </div>
    </div>
  );
}
