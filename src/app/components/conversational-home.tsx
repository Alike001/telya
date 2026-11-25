"use client";

import { useEffect, useRef, useState } from "react";
import type { DecimalAmount, Network, RouteDecision } from "../../domain/contracts";
import {
  parseNaturalLanguageIntent,
  resolvePaymentRouteDecision,
  type UserBalances,
} from "../../domain/intent-parser";
import { ClarificationCard } from "./clarification-card";
import { PaymentReviewCard } from "./payment-review-card";
import { VoiceComposer } from "./voice-composer";
import {
  ArrowLeftRight,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";

interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "telya";
  readonly text?: string | undefined;
  readonly timestamp: string;
  readonly balanceWidget?: boolean | undefined;
  readonly agentPassWidget?: boolean | undefined;
  readonly reviewDecision?: (RouteDecision & { status: "resolved" }) | undefined;
  readonly clarificationDecision?: (RouteDecision & { status: "needs_clarification" }) | undefined;
  readonly amount?: string | undefined;
  readonly recipient?: string | undefined;
}

export function ConversationalHome() {
  const [balances, setBalances] = useState<UserBalances>({
    stellarUsdc: "150.00",
    baseUsdc: "50.00",
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "telya",
      text: "Hello! Tell Telya who you want to pay and how much. You can type or use your voice. Deterministic code selects the route and you authorize with your passkey.",
      timestamp: "Just now",
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle incoming prompt from text input or press-to-talk voice
  function handleSendMessage(text: string, inputMode: "text" | "voice") {
    const userMsgId = `user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text,
      timestamp: "Just now",
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    setTimeout(() => {
      processUserIntent(text, inputMode);
      setIsProcessing(false);
    }, 400);
  }

  function processUserIntent(input: string, inputMode: "text" | "voice") {
    const parsed = parseNaturalLanguageIntent(input, inputMode);
    const now = "Just now";

    if (parsed.kind === "balance_check") {
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Here are your verified USDC balances across connected networks:",
          balanceWidget: true,
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "agent_pass_check") {
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Here is your active Stellar Agent Pass allowance:",
          agentPassWidget: true,
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "clarification") {
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: parsed.clarificationQuestion ?? "Could you please clarify your request?",
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "payment" && parsed.amount && parsed.recipientInput) {
      const decision = resolvePaymentRouteDecision({
        paymentIntentId: `intent_${Date.now()}`,
        amount: parsed.amount,
        recipientInput: parsed.recipientInput,
        requestedSourceNetwork: parsed.requestedSourceNetwork,
        requestedDestinationNetwork: parsed.requestedDestinationNetwork,
        userBalances: balances,
      });

      if (decision.status === "needs_clarification") {
        setMessages((prev) => [
          ...prev,
          {
            id: `telya_${Date.now()}`,
            sender: "telya",
            clarificationDecision: decision,
            amount: parsed.amount,
            recipient: parsed.recipientInput,
            timestamp: now,
          },
        ]);
        return;
      }

      if (decision.status === "resolved") {
        setMessages((prev) => [
          ...prev,
          {
            id: `telya_${Date.now()}`,
            sender: "telya",
            reviewDecision: decision,
            amount: parsed.amount,
            recipient: parsed.recipientInput,
            timestamp: now,
          },
        ]);
        return;
      }
    }

    // Fallback response for unparsed text
    setMessages((prev) => [
      ...prev,
      {
        id: `telya_${Date.now()}`,
        sender: "telya",
        text: `I understood: "${input}". To send money, try saying "Send 5 USDC to @alice" or click one of the quick prompts below.`,
        timestamp: now,
      },
    ]);
  }

  // Handle source network selection from clarification card
  function handleSelectClarificationSource(
    sourceNetwork: Network,
    amount?: string,
    recipient?: string,
  ) {
    if (!amount || !recipient) return;
    const decision = resolvePaymentRouteDecision({
      paymentIntentId: `intent_${Date.now()}`,
      amount,
      recipientInput: recipient,
      requestedSourceNetwork: sourceNetwork,
      userBalances: balances,
    });

    if (decision.status === "resolved") {
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          reviewDecision: decision,
          amount,
          recipient,
          timestamp: "Just now",
        },
      ]);
    }
  }

  async function handleConfirmPayment(amount: string) {
    // Deduct balance locally for instant responsive feel
    const num = Number(amount);
    setBalances((prev: UserBalances) => ({
      ...prev,
      stellarUsdc: Math.max(0, Number(prev.stellarUsdc) - num).toFixed(2),
    }));

    // In a real passkey session, SmartAccountKit.sign / createWallet is called.
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 800);
    });
  }

  return (
    <div className="conversational-home-wrapper shell">
      {/* Balance Summary Header Bar */}
      <div className="home-balances-header">
        <div className="balance-pill stellar">
          <span className="chain-dot stellar" />
          <span className="chain-name">Stellar USDC</span>
          <span className="chain-amount tabular">${balances.stellarUsdc}</span>
        </div>
        <div className="balance-pill base">
          <span className="chain-dot base" />
          <span className="chain-name">Base USDC</span>
          <span className="chain-amount tabular">${balances.baseUsdc}</span>
        </div>
        <div className="balance-pill total">
          <span className="chain-name">Total Available</span>
          <span className="chain-amount tabular bold">
            ${(Number(balances.stellarUsdc) + Number(balances.baseUsdc)).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="conversation-stream" role="log" aria-label="Conversation stream">
        {messages.map((msg) => (
          <div key={msg.id} className={`stream-item ${msg.sender}`}>
            <div className="stream-bubble">
              {msg.text && <p className="bubble-text">{msg.text}</p>}

              {/* Balance Widget */}
              {msg.balanceWidget && (
                <div className="embedded-balance-widget">
                  <div className="widget-row">
                    <span>Stellar Smart Account</span>
                    <strong className="tabular">${balances.stellarUsdc} USDC</strong>
                  </div>
                  <div className="widget-row">
                    <span>Base Cross-Chain Wallet</span>
                    <strong className="tabular">${balances.baseUsdc} USDC</strong>
                  </div>
                </div>
              )}

              {/* Agent Pass Widget */}
              {msg.agentPassWidget && (
                <div className="embedded-agent-pass-widget">
                  <div className="agent-pass-pill-header">
                    <KeyRound className="pass-icon" />
                    <strong>Active Agent Spending Pass</strong>
                  </div>
                  <div className="agent-pass-limits">
                    <div>
                      <span>Daily Cap</span>
                      <strong>$25.00 USDC</strong>
                    </div>
                    <div>
                      <span>Max Per Tx</span>
                      <strong>$5.00 USDC</strong>
                    </div>
                    <div>
                      <span>Killswitch</span>
                      <strong className="proof-text">1-Tap Revocation Ready</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Clarification Card */}
              {msg.clarificationDecision && (
                <ClarificationCard
                  decision={msg.clarificationDecision}
                  onSelectSource={(source) =>
                    handleSelectClarificationSource(source, msg.amount, msg.recipient)
                  }
                  onCancel={() => {
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `cancel_${Date.now()}`,
                        sender: "telya",
                        text: "Payment instruction cancelled.",
                        timestamp: "Just now",
                      },
                    ]);
                  }}
                />
              )}

              {/* Payment Review Card */}
              {msg.reviewDecision && msg.amount && msg.recipient && (
                <PaymentReviewCard
                  decision={msg.reviewDecision}
                  amount={msg.amount}
                  recipient={msg.recipient}
                  onConfirm={() => handleConfirmPayment(msg.amount!)}
                  onCancel={() => {
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `cancel_${Date.now()}`,
                        sender: "telya",
                        text: `Transfer to ${msg.recipient} was cancelled.`,
                        timestamp: "Just now",
                      },
                    ]);
                  }}
                />
              )}
            </div>
            <span className="stream-time">{msg.timestamp}</span>
          </div>
        ))}
        <div ref={streamEndRef} />
      </div>

      {/* Docked Composer */}
      <div className="docked-composer-area">
        <VoiceComposer
          onSend={handleSendMessage}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  );
}
