"use client";

import { useState } from "react";
import type { RampDirection, RampTransaction } from "../../domain/contracts";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

interface MoneyGramRampModalProps {
  readonly stellarAddress: string | null;
  readonly initialDirection?: RampDirection;
  readonly onClose: () => void;
  readonly onDepositSuccess?: (amount: string) => void;
}

export function MoneyGramRampModal({
  stellarAddress,
  initialDirection = "cash_in",
  onClose,
  onDepositSuccess,
}: MoneyGramRampModalProps) {
  const [direction, setDirection] = useState<RampDirection>(initialDirection);
  const [amountInput, setAmountInput] = useState("100.00");
  const [fiatCurrency, setFiatCurrency] = useState("USD");

  // Ramp state progression: 'quote' | 'review' | 'action_instructions' | 'processing' | 'completed'
  const [step, setStep] = useState<
    "quote" | "action_instructions" | "processing" | "completed"
  >("quote");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [simulatedRefNumber] = useState(
    () => `MG-${Math.floor(10000000 + Math.random() * 90000000)}`,
  );

  const numAmount = parseFloat(amountInput) || 0;
  const fee = direction === "cash_in" ? 1.5 : 2.0;
  const netUsdc = Math.max(0, numAmount - fee);

  function handleCopy(text: string, field: string) {
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleStartCashierFlow() {
    setStep("action_instructions");
  }

  function handleSimulateCashierPayment() {
    setStep("processing");
    setTimeout(() => {
      setStep("completed");
      if (direction === "cash_in" && onDepositSuccess) {
        onDepositSuccess(netUsdc.toFixed(2));
      }
    }, 2000);
  }

  return (
    <div
      className="ramp-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="MoneyGram Cash Ramp"
    >
      <div className="ramp-card">
        {/* Header */}
        <div className="ramp-header">
          <div className="ramp-title-group">
            <div className="sandbox-badge">
              <span className="sandbox-dot" />
              <span>MoneyGram Access · Sandbox Environment</span>
            </div>
            <h2 className="ramp-title">
              {direction === "cash_in" ? "Add Digital Dollars" : "Withdraw Cash"}
            </h2>
          </div>

          <button
            type="button"
            className="close-ramp-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="close-icon" />
          </button>
        </div>

        {/* Direction Tabs */}
        {step === "quote" && (
          <div className="ramp-direction-tabs">
            <button
              type="button"
              className={`direction-tab ${direction === "cash_in" ? "active" : ""}`}
              onClick={() => setDirection("cash_in")}
            >
              <ArrowDownLeft className="tab-mini-icon" />
              <span>Deposit Cash (In-Store)</span>
            </button>
            <button
              type="button"
              className={`direction-tab ${direction === "cash_out" ? "active" : ""}`}
              onClick={() => setDirection("cash_out")}
            >
              <ArrowUpRight className="tab-mini-icon" />
              <span>Withdraw Cash (Pickup)</span>
            </button>
          </div>
        )}

        {/* Sandbox Guarantee Notice */}
        <div className="sandbox-notice-banner">
          <Info className="mini-info" />
          <p>
            <strong>Sandbox Mode Active:</strong> Simulates retail cash deposit & withdrawal across
            400,000+ MoneyGram physical locations. No real bank accounts or physical cash debited.
          </p>
        </div>

        {/* Content based on Step */}
        {step === "quote" && (
          <div className="ramp-quote-view">
            <div className="form-field">
              <label htmlFor="fiatAmount">
                {direction === "cash_in"
                  ? "Cash you hand to the cashier"
                  : "Cash to receive at pickup counter"}
              </label>
              <div className="input-with-affix">
                <span className="affix">$</span>
                <input
                  id="fiatAmount"
                  type="number"
                  min="10.00"
                  max="2500.00"
                  step="5.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="ramp-amount-input"
                />
                <span className="affix">{fiatCurrency}</span>
              </div>
            </div>

            {/* Fee Breakdown */}
            <div className="ramp-breakdown-box">
              <div className="breakdown-row">
                <span className="label">Retail Base Amount</span>
                <span className="value tabular">${numAmount.toFixed(2)} USD</span>
              </div>
              <div className="breakdown-row">
                <span className="label">MoneyGram Retail Fee</span>
                <span className="value tabular">${fee.toFixed(2)} USD</span>
              </div>
              <div className="breakdown-divider" />
              <div className="breakdown-row total">
                <span className="label strong">
                  {direction === "cash_in"
                    ? "Digital Dollars Credited"
                    : "Digital Dollars Deducted"}
                </span>
                <span className="value highlight-amount tabular">
                  {netUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div className="breakdown-row sub">
                <span className="label">Destination Account</span>
                <span className="value">
                  {stellarAddress
                    ? `${stellarAddress.slice(0, 8)}...${stellarAddress.slice(-6)} (Stellar)`
                    : "Connected Passkey Account"}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="cta-button primary submit-ramp-btn"
              onClick={handleStartCashierFlow}
              disabled={numAmount <= fee}
            >
              <span>Continue to Cashier Instructions</span>
            </button>
          </div>
        )}

        {step === "action_instructions" && (
          <div className="ramp-instructions-view">
            <div className="cashier-step-card">
              <div className="step-card-header">
                <MapPin className="step-pin" />
                <div>
                  <h4>Visit any participating MoneyGram location</h4>
                  <p>Present your government-issued ID and the reference code below to the retail cashier.</p>
                </div>
              </div>

              <div className="reference-box">
                <span className="ref-label">Cashier Reference Number</span>
                <div className="ref-value-row">
                  <strong className="ref-code">{simulatedRefNumber}</strong>
                  <button
                    type="button"
                    className="copy-ref-btn"
                    onClick={() => handleCopy(simulatedRefNumber, "ref")}
                  >
                    <Copy className="btn-icon-sm" />
                    <span>{copiedField === "ref" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <div className="cashier-instructions-list">
                <div className="instruction-item">
                  <span className="step-num">1</span>
                  <p>Tell the cashier you are making a <strong>MoneyGram Stellar Digital Dollars</strong> deposit.</p>
                </div>
                <div className="instruction-item">
                  <span className="step-num">2</span>
                  <p>Hand the cashier <strong>${numAmount.toFixed(2)} USD</strong> cash.</p>
                </div>
                <div className="instruction-item">
                  <span className="step-num">3</span>
                  <p>USDC is credited natively to your passkey smart account within seconds of cashier confirmation.</p>
                </div>
              </div>
            </div>

            <div className="instructions-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setStep("quote")}
              >
                Back
              </button>
              <button
                type="button"
                className="cta-button primary"
                onClick={handleSimulateCashierPayment}
              >
                <span>Simulate Cashier Confirmation</span>
              </button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="ramp-processing-view">
            <Loader2 className="ramp-spinner" />
            <h3>Processing Retail Settlement</h3>
            <p>Waiting for MoneyGram sandbox webhook and Stellar USDC mint finality...</p>
          </div>
        )}

        {step === "completed" && (
          <div className="ramp-completed-view">
            <div className="success-icon-bubble">
              <CheckCircle2 className="check-icon-lg" />
            </div>
            <h3>
              {direction === "cash_in" ? "Digital Dollars Credited!" : "Cash Ready for Pickup!"}
            </h3>
            <p className="completed-desc">
              {direction === "cash_in"
                ? `Successfully credited ${netUsdc.toFixed(2)} USDC to your Stellar Smart Account.`
                : `Your cash of $${numAmount.toFixed(2)} USD is ready for pickup with reference #${simulatedRefNumber}.`}
            </p>

            <div className="receipt-summary-box">
              <div className="receipt-row">
                <span>Reference</span>
                <code>{simulatedRefNumber}</code>
              </div>
              <div className="receipt-row">
                <span>Retail Network</span>
                <span>MoneyGram Global</span>
              </div>
              <div className="receipt-row">
                <span>Status</span>
                <span className="proof-text">Settled & Verified</span>
              </div>
            </div>

            <button
              type="button"
              className="cta-button primary full-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
