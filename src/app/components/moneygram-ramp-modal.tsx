"use client";

import { useState } from "react";
import type { RampDirection } from "../../domain/contracts";
import { ArrowDownLeft, ArrowUpRight, Info, X } from "lucide-react";

interface MoneyGramRampModalProps {
  readonly stellarAddress: string | null;
  readonly initialDirection?: RampDirection;
  readonly onClose: () => void;
  readonly onDepositSuccess?: (amount: string) => void;
}

/** Partner access and Smart Account Kit C-address support must be verified first. */
export function MoneyGramRampModal({
  initialDirection = "cash_in",
  onClose,
}: MoneyGramRampModalProps) {
  const [direction, setDirection] = useState<RampDirection>(initialDirection);

  return (
    <div className="ramp-modal-backdrop" role="dialog" aria-modal="true" aria-label="MoneyGram access status">
      <div className="ramp-card">
        <div className="ramp-header">
          <div className="ramp-title-group">
            <div className="sandbox-badge">MoneyGram Ramps · Partner access pending</div>
            <h2 className="ramp-title">{direction === "cash_in" ? "Add digital dollars" : "Withdraw cash"}</h2>
          </div>
          <button type="button" className="close-ramp-btn" onClick={onClose} aria-label="Close">
            <X className="close-icon" />
          </button>
        </div>

        <div className="ramp-direction-tabs" aria-label="Ramp direction">
          <button type="button" className={`direction-tab ${direction === "cash_in" ? "active" : ""}`} onClick={() => setDirection("cash_in")}>
            <ArrowDownLeft className="tab-mini-icon" /> Cash in
          </button>
          <button type="button" className={`direction-tab ${direction === "cash_out" ? "active" : ""}`} onClick={() => setDirection("cash_out")}>
            <ArrowUpRight className="tab-mini-icon" /> Cash out
          </button>
        </div>

        <div className="sandbox-notice-banner" role="status">
          <Info className="mini-info" aria-hidden="true" />
          <p>
            This flow is unavailable while MoneyGram partner access and support for Telya&apos;s Stellar
            smart account address are being confirmed. There is no provider quote, cashier reference,
            cash deposit, withdrawal, or USDC transfer to start here yet.
          </p>
        </div>
      </div>
    </div>
  );
}
