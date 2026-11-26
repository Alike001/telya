"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { parseNaturalLanguageIntent } from "../../domain/intent-parser";
import {
  createBrowserSmartAccountKit,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { VoiceComposer } from "./voice-composer";

interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "telya";
  readonly text: string;
  readonly timestamp: string;
}

export function ConversationalHome() {
  const [smartAccount, setSmartAccount] = useState<ConnectedSmartAccount | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome-1",
    sender: "telya",
    text: "Tell Telya who you want to pay and how much. A payment review appears only after the recipient, balances and fees are verified.",
    timestamp: "Just now",
  }]);
  const [isProcessing, setIsProcessing] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) return;
        const config = (await response.json()) as SmartAccountPublicConfig;
        const account = await restoreSmartAccount(createBrowserSmartAccountKit(config));
        if (active && account) setSmartAccount(account);
      } catch {
        // A missing wallet or network connection is shown as unavailable below.
      }
    }
    void restore();
    return () => { active = false; };
  }, []);

  async function handleSendMessage(text: string, inputMode: "text" | "voice") {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, sender: "user", text, timestamp: "Just now" }]);
    setIsProcessing(true);
    try {
      const parsed = parseNaturalLanguageIntent(text, inputMode);
      let response: string;
      if (parsed.kind === "balance_check") {
        response = "Balances are unavailable in this session until authenticated wallet balance verification is connected.";
      } else if (parsed.kind === "agent_pass_check") {
        response = "Agent Pass details are unavailable here until the live on-chain status is connected.";
      } else if (parsed.kind === "clarification") {
        response = parsed.clarificationQuestion ?? "Please clarify the payment details.";
      } else if (parsed.kind === "payment") {
        response = `I understood a request to send ${parsed.amount} USDC to ${parsed.recipientInput}. Payment review is unavailable until I can verify the recipient address, your balance and the route fees. No payment has been submitted.`;
      } else {
        response = "Enter an amount and recipient, such as ‘Send 5 USDC to @alice’.";
      }
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), sender: "telya", text: response, timestamp: "Just now",
      }]);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="conversational-home-wrapper shell">
      <div className="home-balances-header">
        <div className="balance-pill stellar">
          <span className="chain-dot stellar" />
          <span className="chain-name">Stellar USDC</span>
          <span className="chain-amount tabular">Unavailable</span>
        </div>
        <div className="balance-pill base">
          <span className="chain-dot base" />
          <span className="chain-name">Base USDC</span>
          <span className="chain-amount tabular">Unavailable</span>
        </div>
        <div className="balance-pill total">
          <span className="chain-name">Stellar account</span>
          {smartAccount ? (
            <span className="chain-amount tabular proof-text">
              <CheckCircle2 className="inline-check" /> Connected
            </span>
          ) : (
            <a href="/onboarding" className="chain-connect-link">Connect Passkey</a>
          )}
        </div>
      </div>
      <div className="conversation-stream" role="log" aria-label="Conversation stream">
        {messages.map((message) => (
          <div key={message.id} className={`stream-item ${message.sender}`}>
            <div className="stream-bubble"><p className="bubble-text">{message.text}</p></div>
            <span className="stream-time">{message.timestamp}</span>
          </div>
        ))}
        <div ref={streamEndRef} />
      </div>
      <div className="docked-composer-area">
        <VoiceComposer onSend={(text, mode) => { void handleSendMessage(text, mode); }} isProcessing={isProcessing} />
      </div>
    </div>
  );
}
