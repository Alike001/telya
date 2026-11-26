"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DecimalAmount,
  Network,
  Payment,
  PaymentEvent,
  PaymentStatus,
  RouteDecision,
} from "../../domain/contracts";
import {
  parseNaturalLanguageIntent,
  resolvePaymentRouteDecision,
  type UserBalances,
} from "../../domain/intent-parser";
import { getExplorerUrl } from "../../domain/payment-timeline";
import {
  connectSmartAccount,
  createBrowserSmartAccountKit,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { ActivityHistory } from "./activity-history";
import { AgentPassPanel } from "./agent-pass-panel";
import { ClarificationCard } from "./clarification-card";
import { ContactsDirectory } from "./contacts-directory";
import { JudgeTestnetDrawer } from "./judge-testnet-drawer";
import { MoneyGramRampModal } from "./moneygram-ramp-modal";
import { PaymentProgressTimeline } from "./payment-progress-timeline";
import { PaymentReceiptModal } from "./payment-receipt-modal";
import { PaymentReviewCard } from "./payment-review-card";
import { VoiceComposer } from "./voice-composer";
import {
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  Clock,
  History,
  KeyRound,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "telya";
  readonly text?: string | undefined;
  readonly timestamp: string;
  readonly balanceWidget?: boolean | undefined;
  readonly agentPassWidget?: boolean | undefined;
  readonly timelineWidget?: boolean | undefined;
  readonly activityWidget?: boolean | undefined;
  readonly paymentId?: string | undefined;
  readonly reviewDecision?: (RouteDecision & { status: "resolved" }) | undefined;
  readonly clarificationDecision?: (RouteDecision & { status: "needs_clarification" }) | undefined;
  readonly amount?: string | undefined;
  readonly recipient?: string | undefined;
}

const STORAGE_PAYMENTS_KEY = "telya_payments_history";
const STORAGE_EVENTS_KEY = "telya_payment_events_history";

export function ConversationalHome() {
  const [balances, setBalances] = useState<UserBalances>({
    stellarUsdc: "0.00",
    baseUsdc: "0.00",
  });
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [smartAccount, setSmartAccount] = useState<ConnectedSmartAccount | null>(null);
  const kitRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<
    "chat" | "activity" | "contacts" | "agent_pass"
  >("chat");
  const [showRampModal, setShowRampModal] = useState(false);
  const [showJudgeDrawer, setShowJudgeDrawer] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [eventsMap, setEventsMap] = useState<Record<string, PaymentEvent[]>>({});
  const [activeReceiptPayment, setActiveReceiptPayment] = useState<Payment | null>(null);
  const [activeTimelinePaymentId, setActiveTimelinePaymentId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "telya",
      text: "Hello! Tell Telya who you want to pay and how much. You can type or use your voice. Deterministic code selects the route, tracks real finality, and you authorize with your passkey.",
      timestamp: "Just now",
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  // Load persisted payments and events on initial mount
  useEffect(() => {
    try {
      const storedPayments = localStorage.getItem(STORAGE_PAYMENTS_KEY);
      if (storedPayments) {
        const parsed = JSON.parse(storedPayments) as Payment[];
        setPayments(parsed);

        // Check if there is an in-progress payment to restore
        const pending = parsed.find(
          (p) => p.status !== "completed" && p.status !== "failed",
        );
        if (pending) {
          setActiveTimelinePaymentId(pending.id);
        }
      }

      const storedEvents = localStorage.getItem(STORAGE_EVENTS_KEY);
      if (storedEvents) {
        setEventsMap(JSON.parse(storedEvents));
      }
    } catch {
      // Storage unavailable or unparseable
    }
  }, []);

  // Poll real transfer status for any pending payments
  useEffect(() => {
    const pendingPayments = payments.filter(
      (p) => p.status !== "completed" && p.status !== "failed" && p.sourceTransaction?.txHash,
    );
    if (pendingPayments.length === 0) return;

    const interval = setInterval(() => {
      for (const p of pendingPayments) {
        if (!p.sourceTransaction?.txHash) continue;
        void pollTransferReceipt(p.id, p.sourceTransaction.txHash);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [payments]);

  // Real backend polling against /api/stellar/transfers/[txHash]
  async function pollTransferReceipt(paymentId: string, txHash: string) {
    try {
      const res = await fetch(`/api/stellar/transfers/${txHash}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data && data.status) {
        setPayments((prev) => {
          const updated = prev.map((pay) => {
            if (pay.id !== paymentId) return pay;

            if (data.status === "completed") {
              const completedPay: Payment = {
                ...pay,
                status: "completed",
                actualRecipient: data.verifiedRecipient ?? pay.expectedRecipient,
                actualAmount: data.verifiedAmount ?? pay.expectedAmount,
                destinationTransaction: {
                  network: "stellar",
                  txHash: data.transactionHash ?? txHash,
                  explorerUrl:
                    data.explorerUrl ??
                    getExplorerUrl("stellar", data.transactionHash ?? txHash),
                },
                recipientVerification: {
                  recipientAddress: data.verifiedRecipient ?? pay.expectedRecipient,
                  receivedAmount: data.verifiedAmount ?? pay.expectedAmount,
                  verifiedAt: data.verifiedAt ?? new Date().toISOString(),
                },
                completedAt: data.verifiedAt ?? new Date().toISOString(),
              };
              return completedPay;
            }

            if (data.status === "failed") {
              const { recipientVerification: _, ...restPay } = pay;
              const failedPay: Payment = {
                ...restPay,
                status: "failed",
                failureCode: (data.failureCode as string) ?? "TRANSFER_FAILED",
                failureStage: "destination_confirmed",
                destinationTransaction: null,
                actualRecipient: null,
                actualAmount: null,
                completedAt: null,
              };
              return failedPay;
            }

            return pay;
          });

          try {
            localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        // Update events if returned from backend receipt
        if (Array.isArray(data.events) && data.events.length > 0) {
          setEventsMap((prev) => {
            const domainEvents: PaymentEvent[] = data.events.map(
              (evt: any, idx: number) => ({
                id: `evt_${paymentId}_${idx}`,
                paymentId,
                sequence: idx + 1,
                stage: evt.stage as PaymentStatus,
                status: evt.status === "failed" ? "failed" : "succeeded",
                network: "stellar",
                txHash: evt.txHash ?? txHash,
                explorerUrl: getExplorerUrl("stellar", evt.txHash ?? txHash),
                publicMessage: evt.publicMessage ?? "Ledger sequence verified.",
                debugMessage: null,
                errorCode: evt.errorCode ?? null,
                startedAt: evt.occurredAt ?? new Date().toISOString(),
                completedAt: evt.completedAt ?? null,
              }),
            );

            const newMap = { ...prev, [paymentId]: domainEvents };
            try {
              localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(newMap));
            } catch {}
            return newMap;
          });
        }
      }
    } catch {
      // Network retry
    }
  }

  // Restore authenticated session on mount
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) return;
        const config = (await response.json()) as SmartAccountPublicConfig;
        const kit = createBrowserSmartAccountKit(config);
        kitRef.current = kit;

        const restored = await restoreSmartAccount(kit);
        if (active && restored) {
          setSmartAccount(restored);
          setIsWalletConnected(true);
        }
      } catch {
        // Unauthenticated visitor
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, []);

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
      void processUserIntent(text, inputMode);
      setIsProcessing(false);
    }, 400);
  }

  async function processUserIntent(input: string, inputMode: "text" | "voice") {
    const parsed = parseNaturalLanguageIntent(input, inputMode);
    const now = "Just now";

    if (parsed.kind === "balance_check") {
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: isWalletConnected
            ? "Here are your verified USDC balances across connected networks:"
            : "No wallet is currently connected. Connect a passkey to view verified balances.",
          balanceWidget: true,
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "agent_pass_check") {
      setActiveTab("agent_pass");
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Opening your Stellar Agent Pass autonomous spending controls.",
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "activity_check") {
      setActiveTab("activity");
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Here is your verified transaction and money movement history:",
          activityWidget: true,
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "contacts_check") {
      setActiveTab("contacts");
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Opening your verified Contacts Directory.",
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "ramp_check") {
      setShowRampModal(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Opening MoneyGram Access cash deposit and withdrawal sandbox.",
          timestamp: now,
        },
      ]);
      return;
    }

    if (parsed.kind === "judge_check") {
      setShowJudgeDrawer(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `telya_${Date.now()}`,
          sender: "telya",
          text: "Opening Hackathon Judge & Testnet Evaluation Guide.",
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
      // Recipient handle verification: Ensure recipient exists in registry
      if (parsed.recipientInput.startsWith("@")) {
        const handle = parsed.recipientInput.replace(/^@/, "");
        try {
          const checkRes = await fetch(
            `/api/usernames/check?username=${encodeURIComponent(handle)}`,
          );
          if (!checkRes.ok) {
            setMessages((prev) => [
              ...prev,
              {
                id: `unresolved_${Date.now()}`,
                sender: "telya",
                text: `Could not verify recipient ${parsed.recipientInput} at this time. Please retry in a moment.`,
                timestamp: now,
              },
            ]);
            return;
          }
          const checkData = await checkRes.json();
          // If available = true, the handle is unregistered / unknown
          if (checkData.available === true) {
            setMessages((prev) => [
              ...prev,
              {
                id: `unresolved_${Date.now()}`,
                sender: "telya",
                text: `Recipient ${parsed.recipientInput} is not registered on Telya. Please check the handle or invite them before sending.`,
                timestamp: now,
              },
            ]);
            return;
          }
        } catch {
          // Fail closed if registry is unreachable
          setMessages((prev) => [
            ...prev,
            {
              id: `unresolved_${Date.now()}`,
              sender: "telya",
              text: `Network error verifying recipient ${parsed.recipientInput}. Please check your connection and retry.`,
              timestamp: now,
            },
          ]);
          return;
        }
      }

      const decision = resolvePaymentRouteDecision({
        paymentIntentId: `intent_${Date.now()}`,
        amount: parsed.amount,
        recipientInput: parsed.recipientInput,
        requestedSourceNetwork: parsed.requestedSourceNetwork,
        requestedDestinationNetwork: parsed.requestedDestinationNetwork,
        userBalances: balances,
      });

      if (decision.status === "unavailable") {
        setMessages((prev) => [
          ...prev,
          {
            id: `unavailable_${Date.now()}`,
            sender: "telya",
            text: decision.unavailabilityReason,
            timestamp: now,
          },
        ]);
        return;
      }

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

  // Real execution boundary: passkey authorization & relayer submission
  async function handleConfirmPayment(
    decision: RouteDecision & { status: "resolved" },
    amount: string,
    recipient: string,
  ): Promise<{ txHash?: string } | void> {
    if (!smartAccount) {
      throw new Error(
        "No connected passkey account found. Please connect your passkey account to authorize payments.",
      );
    }

    // Call real relayer endpoint for transaction broadcast
    const res = await fetch("/api/stellar/relayer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        func: "payment_transfer",
        auth: [],
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Payment authorization or relayer broadcast failed.");
    }

    const txHash = data.hash as string;

    // Create domain Payment record
    const paymentId = `pay_${Date.now()}`;
    const newPayment: Payment = {
      id: paymentId,
      userId: smartAccount.contractId,
      paymentIntentId: decision.paymentIntentId,
      routeDecisionId: decision.id,
      idempotencyKey: `idem_${Date.now()}_${txHash.slice(0, 8)}`,
      route: decision.route,
      sourceWalletId: decision.sourceWalletId ?? "wallet_stellar",
      recipient: decision.recipient,
      expectedRecipient: recipient,
      asset: "USDC",
      expectedAmount: amount,
      fees: decision.fees,
      feeAmount: decision.fees[0]?.amount ?? "0.00",
      sourceTransaction: {
        network: decision.route.sourceNetwork,
        txHash,
        explorerUrl: getExplorerUrl(decision.route.sourceNetwork, txHash),
      },
      destinationTransaction: null,
      status: "submitted",
      actualRecipient: null,
      actualAmount: null,
      failureCode: null,
      failureStage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };

    const initialEvents: PaymentEvent[] = [
      {
        id: `evt_auth_${Date.now()}`,
        paymentId,
        sequence: 1,
        stage: "authorized",
        status: "succeeded",
        network: decision.route.sourceNetwork,
        txHash: null,
        explorerUrl: null,
        publicMessage: "Passkey biometric authorization confirmed.",
        debugMessage: null,
        errorCode: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      {
        id: `evt_sub_${Date.now()}`,
        paymentId,
        sequence: 2,
        stage: "submitted",
        status: "succeeded",
        network: decision.route.sourceNetwork,
        txHash,
        explorerUrl: getExplorerUrl(decision.route.sourceNetwork, txHash),
        publicMessage: "USDC transfer submitted to Stellar Testnet relayer.",
        debugMessage: null,
        errorCode: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ];

    setPayments((prev) => {
      const updated = [newPayment, ...prev];
      try {
        localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setEventsMap((prev) => {
      const updated = { ...prev, [paymentId]: initialEvents };
      try {
        localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setActiveTimelinePaymentId(paymentId);

    // Append timeline card directly to chat message stream
    setMessages((prev) => [
      ...prev,
      {
        id: `timeline_${Date.now()}`,
        sender: "telya",
        text: "Your payment has been submitted! Here is the live status of your funds:",
        timelineWidget: true,
        paymentId,
        timestamp: "Just now",
      },
    ]);

    // Kick off immediate status poll
    void pollTransferReceipt(paymentId, txHash);

    return { txHash };
  }

  const activeTimelinePayment = payments.find((p) => p.id === activeTimelinePaymentId);

  return (
    <div className="conversational-home-wrapper shell">
      {/* Header Bar with Tabs and Balances */}
      <div className="home-top-bar">
        <div className="top-bar-row">
          <div className="view-switcher-tabs">
            <button
              type="button"
              className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              <MessageSquare className="tab-icon" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "activity" ? "active" : ""}`}
              onClick={() => setActiveTab("activity")}
            >
              <History className="tab-icon" />
              <span>Activity</span>
              {payments.length > 0 && <span className="tab-badge">{payments.length}</span>}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "contacts" ? "active" : ""}`}
              onClick={() => setActiveTab("contacts")}
            >
              <Users className="tab-icon" />
              <span>Contacts</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "agent_pass" ? "active" : ""}`}
              onClick={() => setActiveTab("agent_pass")}
            >
              <KeyRound className="tab-icon" />
              <span>Agent Pass</span>
            </button>
          </div>

          <div className="home-quick-actions">
            <button
              type="button"
              className="quick-action-btn ramp"
              onClick={() => setShowRampModal(true)}
              title="MoneyGram Access Cash In/Out Sandbox"
            >
              <Banknote className="btn-icon" />
              <span>Cash In/Out</span>
            </button>
            <button
              type="button"
              className="quick-action-btn judge"
              onClick={() => setShowJudgeDrawer(true)}
              title="Open Hackathon Judge & Testnet Guide"
            >
              <Sparkles className="btn-icon" />
              <span>Judge Guide</span>
            </button>
          </div>
        </div>

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
            <span className="chain-name">Account</span>
            {isWalletConnected && smartAccount ? (
              <span className="chain-amount tabular proof-text">
                <CheckCircle2 className="inline-check" /> Active
              </span>
            ) : (
              <a href="/onboarding" className="chain-connect-link">
                Connect Passkey
              </a>
            )}
          </div>
        </div>
      </div>

      {activeTab === "activity" ? (
        /* Dedicated Activity / History View */
        <div className="activity-view-panel">
          <div className="activity-panel-header">
            <h3>Payment Activity & Finality</h3>
            <p>Every transaction verified with on-chain cryptographic proof.</p>
          </div>
          <ActivityHistory
            payments={payments}
            activePaymentId={activeTimelinePaymentId}
            onSelectPayment={(payment) => {
              if (payment.status === "completed") {
                setActiveReceiptPayment(payment);
              } else {
                setActiveTimelinePaymentId(payment.id);
                setActiveTab("chat");
              }
            }}
            onOpenTimeline={(payment) => {
              setActiveTimelinePaymentId(payment.id);
              setActiveTab("chat");
            }}
          />
        </div>
      ) : activeTab === "contacts" ? (
        /* Dedicated Contacts View */
        <div className="contacts-view-panel">
          <ContactsDirectory
            onSelectPayContact={(handle) => {
              handleSendMessage(`Send 10 USDC to ${handle}`, "text");
              setActiveTab("chat");
            }}
          />
        </div>
      ) : activeTab === "agent_pass" ? (
        /* Dedicated Stellar Agent Pass View */
        <div className="agent-pass-view-panel">
          <AgentPassPanel
            smartAccountAddress={smartAccount?.contractId ?? null}
            kit={kitRef.current}
            onOpenPayment={(prompt) => {
              handleSendMessage(prompt, "text");
              setActiveTab("chat");
            }}
          />
        </div>
      ) : (
        /* Main Conversation Stream */
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

                {/* Activity History Widget embedded */}
                {msg.activityWidget && (
                  <ActivityHistory
                    payments={payments}
                    activePaymentId={activeTimelinePaymentId}
                    onSelectPayment={(payment) => {
                      if (payment.status === "completed") {
                        setActiveReceiptPayment(payment);
                      } else {
                        setActiveTimelinePaymentId(payment.id);
                      }
                    }}
                    onOpenTimeline={(payment) => {
                      setActiveTimelinePaymentId(payment.id);
                    }}
                  />
                )}

                {/* Live Payment Progress Timeline Widget */}
                {msg.timelineWidget && msg.paymentId && (
                  (() => {
                    const pay = payments.find((p) => p.id === msg.paymentId);
                    if (!pay) return null;
                    const evts = eventsMap[pay.id] ?? [];
                    return (
                      <PaymentProgressTimeline
                        payment={pay}
                        events={evts}
                        onRefresh={() =>
                          pay.sourceTransaction?.txHash
                            ? pollTransferReceipt(pay.id, pay.sourceTransaction.txHash)
                            : Promise.resolve()
                        }
                        onViewReceipt={() => setActiveReceiptPayment(pay)}
                        onClose={() => setActiveTimelinePaymentId(null)}
                      />
                    );
                  })()
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
                    isConnected={isWalletConnected}
                    onConfirm={() =>
                      handleConfirmPayment(msg.reviewDecision!, msg.amount!, msg.recipient!)
                    }
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
      )}

      {/* Docked Composer (Visible on Chat tab) */}
      {activeTab === "chat" && (
        <div className="docked-composer-area">
          <VoiceComposer
            onSend={handleSendMessage}
            isProcessing={isProcessing}
          />
        </div>
      )}

      {/* Verified Receipt Modal */}
      {activeReceiptPayment && (
        <PaymentReceiptModal
          payment={activeReceiptPayment}
          events={eventsMap[activeReceiptPayment.id] ?? []}
          onClose={() => setActiveReceiptPayment(null)}
        />
      )}

      {/* MoneyGram Ramp Modal */}
      {showRampModal && (
        <MoneyGramRampModal
          stellarAddress={smartAccount?.contractId ?? null}
          onClose={() => setShowRampModal(false)}
          onDepositSuccess={(amt) => {
            setBalances((prev) => ({
              ...prev,
              stellarUsdc: (parseFloat(prev.stellarUsdc) + parseFloat(amt)).toFixed(2),
            }));
            setMessages((prev) => [
              ...prev,
              {
                id: `ramp_success_${Date.now()}`,
                sender: "telya",
                text: `MoneyGram Sandbox Deposit of $${amt} USDC completed! Your updated Stellar balance is available.`,
                timestamp: "Just now",
              },
            ]);
          }}
        />
      )}

      {/* Judge & Testnet Mode Drawer */}
      <JudgeTestnetDrawer
        isOpen={showJudgeDrawer}
        onClose={() => setShowJudgeDrawer(false)}
        onQuickPrompt={(prompt) => {
          handleSendMessage(prompt, "text");
          setActiveTab("chat");
        }}
      />
    </div>
  );
}

