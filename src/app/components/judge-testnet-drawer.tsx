"use client";

import { BookOpen, X } from "lucide-react";

interface JudgeTestnetDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onQuickPrompt: (promptText: string) => void;
}

export function JudgeTestnetDrawer({ isOpen, onClose }: JudgeTestnetDrawerProps) {
  if (!isOpen) return null;
  return (
    <div className="judge-drawer-backdrop" role="dialog" aria-modal="true" aria-label="Judge and Testnet guide">
      <div className="judge-drawer-panel">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="judge-badge"><BookOpen className="mini-icon" /> Testnet guide</span>
            <h2 className="drawer-title">Inspect Telya&apos;s current Testnet state</h2>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} aria-label="Close guide">
            <X className="close-icon" />
          </button>
        </div>
        <div className="tour-section">
          <p>Check the live application and database health before testing a payment.</p>
          <a href="/api/health" target="_blank" rel="noreferrer">Open system health</a>
          <p>Stellar direct transfers and Agent Pass require a real Testnet passkey account and authorization.</p>
          <p>Base, Circle CCTP and MoneyGram availability must be verified separately. This guide does not mark them ready or launch a test payment without a verified recipient, balance and fee quote.</p>
        </div>
      </div>
    </div>
  );
}
