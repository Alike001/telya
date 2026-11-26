"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CheckCircle2, History, KeyRound, MessageSquare, Sparkles, Users } from "lucide-react";
import type { SmartAccountKit } from "smart-account-kit";
import { parseNaturalLanguageIntent } from "../../domain/intent-parser";
import {
  createBrowserSmartAccountKit,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { VoiceComposer } from "./voice-composer";
import { AgentPassPanel } from "./agent-pass-panel";
import { ContactsDirectory } from "./contacts-directory";
import { JudgeTestnetDrawer } from "./judge-testnet-drawer";
import { MoneyGramRampModal } from "./moneygram-ramp-modal";

interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "telya";
  readonly text: string;
  readonly timestamp: string;
}

export function ConversationalHome() {
  const [smartAccount, setSmartAccount] = useState<ConnectedSmartAccount | null>(null);
  const kitRef = useRef<SmartAccountKit | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "activity" | "contacts" | "agent_pass">("chat");
  const [showRampModal, setShowRampModal] = useState(false);
  const [showJudgeDrawer, setShowJudgeDrawer] = useState(false);
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
  }, [messages, activeTab]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) return;
        const config = (await response.json()) as SmartAccountPublicConfig;
        const kit = createBrowserSmartAccountKit(config);
        kitRef.current = kit;
        const account = await restoreSmartAccount(kit);
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
      } else if (parsed.kind === "activity_check") {
        setActiveTab("activity");
        response = "Payment history is unavailable in this session until authenticated server records are connected. No browser-stored payment is treated as settlement evidence.";
      } else if (parsed.kind === "agent_pass_check") {
        setActiveTab("agent_pass");
        response = "Opening Stellar Agent Pass. Its state must come from the Testnet account and on-chain status.";
      } else if (parsed.kind === "contacts_check") {
        setActiveTab("contacts");
        response = "Contacts require authenticated, verified recipient records.";
      } else if (parsed.kind === "ramp_check") {
        setShowRampModal(true);
        response = "MoneyGram Ramps are pending partner access and wallet compatibility confirmation.";
      } else if (parsed.kind === "judge_check") {
        setShowJudgeDrawer(true);
        response = "Opening the Testnet guide. Each route must be verified before use.";
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
      <nav className="view-switcher-tabs" aria-label="Telya sections">
        <button type="button" className={`tab-btn ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}><MessageSquare className="tab-icon" />Chat</button>
        <button type="button" className={`tab-btn ${activeTab === "activity" ? "active" : ""}`} onClick={() => setActiveTab("activity")}><History className="tab-icon" />Activity</button>
        <button type="button" className={`tab-btn ${activeTab === "contacts" ? "active" : ""}`} onClick={() => setActiveTab("contacts")}><Users className="tab-icon" />Contacts</button>
        <button type="button" className={`tab-btn ${activeTab === "agent_pass" ? "active" : ""}`} onClick={() => setActiveTab("agent_pass")}><KeyRound className="tab-icon" />Agent Pass</button>
      </nav>
      <div className="home-quick-actions">
        <button type="button" className="quick-action-btn ramp" onClick={() => setShowRampModal(true)}><Banknote className="btn-icon" />Cash in/out status</button>
        <button type="button" className="quick-action-btn judge" onClick={() => setShowJudgeDrawer(true)}><Sparkles className="btn-icon" />Testnet guide</button>
      </div>
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
      {activeTab === "activity" ? (
        <section className="activity-view-panel" role="status">
          <h2>Payment activity unavailable</h2>
          <p>Authenticated server payment records are not connected in this session. No browser-stored payment is shown as settled.</p>
        </section>
      ) : activeTab === "contacts" ? (
        <ContactsDirectory onSelectPayContact={() => setActiveTab("chat")} />
      ) : activeTab === "agent_pass" ? (
        <AgentPassPanel smartAccountAddress={smartAccount?.contractId ?? null} kit={kitRef.current} onOpenPayment={(prompt) => {
          setActiveTab("chat");
          void handleSendMessage(prompt, "text");
        }} />
      ) : <div className="conversation-stream" role="log" aria-label="Conversation stream">
        {messages.map((message) => (
          <div key={message.id} className={`stream-item ${message.sender}`}>
            <div className="stream-bubble"><p className="bubble-text">{message.text}</p></div>
            <span className="stream-time">{message.timestamp}</span>
          </div>
        ))}
        <div ref={streamEndRef} />
      </div>}
      {activeTab === "chat" && (
        <div className="docked-composer-area">
          <VoiceComposer onSend={(text, mode) => { void handleSendMessage(text, mode); }} isProcessing={isProcessing} />
        </div>
      )}
      {showRampModal && <MoneyGramRampModal stellarAddress={smartAccount?.contractId ?? null} onClose={() => setShowRampModal(false)} />}
      <JudgeTestnetDrawer isOpen={showJudgeDrawer} onClose={() => setShowJudgeDrawer(false)} onQuickPrompt={(prompt) => {
        setActiveTab("chat");
        void handleSendMessage(prompt, "text");
      }} />
    </div>
  );
}
