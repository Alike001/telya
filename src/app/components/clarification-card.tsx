"use client";

import type { Network, RouteDecision } from "../../domain/contracts";
import { ArrowRight, HelpCircle, ShieldAlert } from "lucide-react";

interface ClarificationCardProps {
  readonly decision: RouteDecision & { status: "needs_clarification" };
  readonly onSelectSource: (sourceNetwork: Network) => void;
  readonly onCancel: () => void;
}

export function ClarificationCard({
  decision,
  onSelectSource,
  onCancel,
}: ClarificationCardProps) {
  return (
    <div className="clarification-card" role="region" aria-label="Route clarification required">
      <div className="clarification-header">
        <HelpCircle className="clarification-icon" />
        <div>
          <strong>Ambiguity Resolution</strong>
          <p className="clarification-sub">{decision.explanation}</p>
        </div>
      </div>

      <div className="clarification-options">
        <button
          type="button"
          className="option-button"
          onClick={() => onSelectSource("stellar")}
        >
          <div className="option-info">
            <strong>Send from Stellar USDC</strong>
            <span className="option-sub">Direct Stellar transfer · Sponsored network fee · Instant finality</span>
          </div>
          <span className="option-badge proof">Free / Sponsored</span>
          <ArrowRight className="option-arrow" />
        </button>

        <button
          type="button"
          className="option-button"
          onClick={() => onSelectSource("base")}
        >
          <div className="option-info">
            <strong>Send from Base USDC</strong>
            <span className="option-sub">Circle CCTP Cross-Chain · Base Sepolia to Stellar Testnet</span>
          </div>
          <span className="option-badge neutral">Circle CCTP</span>
          <ArrowRight className="option-arrow" />
        </button>
      </div>

      <div className="clarification-footer">
        <button type="button" className="cancel-text-link" onClick={onCancel}>
          Cancel intent
        </button>
      </div>
    </div>
  );
}
