"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { CheckCircle2 } from "lucide-react";

import { authenticatedFetch } from "../authenticated-fetch";
import { parseNaturalLanguageIntent } from "../../domain/intent-parser";
import {
  createBrowserSmartAccountKit,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { submitStellarUsdcTransfer } from "../../stellar/usdc";
import {
  apiMessage,
  parsePaymentReview,
  parseVerifiedBalances,
} from "./conversation-payment";
import type {
  PaymentExecutionResult,
  PaymentReview,
  VerifiedBalance,
} from "./conversation-payment";
import {
  executeConversationPayment,
  reconcileConversationPayment,
} from "./conversation-payment-execution";
import { PaymentReviewCard } from "./payment-review-card";
import { VoiceComposer } from "./voice-composer";

interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "telya";
  readonly text: string;
  readonly timestamp: string;
  readonly review?: PaymentReview;
  readonly recipientLabel?: string;
}

const welcome: ChatMessage = {
  id: "welcome-1",
  sender: "telya",
  text: "Tell Telya who you want to pay and how much. A payment review appears only after the recipient, balance, route and fees are verified.",
  timestamp: "Just now",
};

export function ConversationalHome() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <UnavailableConversation />;
  return <AuthenticatedConversation />;
}

function UnavailableConversation() {
  return (
    <div className="conversational-home-wrapper shell">
      <div className="conversation-stream" role="log" aria-label="Conversation stream">
        <div className="stream-item telya">
          <div className="stream-bubble"><p className="bubble-text">Unavailable: sign-in is not configured, so balances and payment review cannot be verified. No payment can be submitted.</p></div>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedConversation() {
  const { ready: authReady, authenticated, login, getAccessToken } = usePrivy();
  const [smartAccount, setSmartAccount] = useState<ConnectedSmartAccount | null>(null);
  const [balances, setBalances] = useState<readonly VerifiedBalance[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<SmartAccountPublicConfig | null>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!authReady || !authenticated) {
      setSmartAccount(null);
      setBalances([]);
      return;
    }
    let active = true;
    async function restore() {
      try {
        const configResponse = await fetch("/api/stellar/config", { cache: "no-store" });
        if (configResponse.ok) {
          const config = await configResponse.json() as SmartAccountPublicConfig;
          configRef.current = config;
          const account = await restoreSmartAccount(createBrowserSmartAccountKit(config));
          if (active) setSmartAccount(account);
        }
      } catch {
        if (active) setSmartAccount(null);
      }
      try {
        const balanceResponse = await authenticatedFetch(
          "/api/balances",
          { cache: "no-store" },
          getAccessToken,
        );
        if (balanceResponse.ok) {
          const parsed = parseVerifiedBalances(await balanceResponse.json());
          if (active) setBalances(parsed);
        }
      } catch {
        if (active) setBalances([]);
      }
    }
    void restore();
    return () => { active = false; };
  }, [authReady, authenticated, getAccessToken]);

  function appendTelya(text: string, review?: PaymentReview, recipientLabel?: string) {
    setMessages((previous) => [...previous, {
      id: crypto.randomUUID(), sender: "telya", text, timestamp: "Just now",
      ...(review ? { review } : {}),
      ...(recipientLabel ? { recipientLabel } : {}),
    }]);
  }

  async function persistUserMessage(text: string): Promise<{ conversationId: string; messageId: string }> {
    const response = await authenticatedFetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, ...(conversationId ? { conversationId } : {}) }),
    }, getAccessToken);
    const payload = await response.json() as {
      conversation?: { id?: unknown };
      message?: { id?: unknown };
    };
    const nextConversationId = conversationId ?? payload.conversation?.id;
    if (!response.ok || typeof nextConversationId !== "string" || typeof payload.message?.id !== "string") {
      throw new Error("The authenticated conversation could not be saved.");
    }
    if (!conversationId) setConversationId(nextConversationId);
    return { conversationId: nextConversationId, messageId: payload.message.id };
  }

  async function reconcilePayment(
    review: PaymentReview,
    submittedTransactionHash?: string,
  ): Promise<PaymentExecutionResult> {
    return reconcileConversationPayment(
      review,
      submittedTransactionHash,
      (input, init) => authenticatedFetch(input, init, getAccessToken),
    );
  }

  async function confirmPayment(review: PaymentReview): Promise<PaymentExecutionResult> {
    const config = configRef.current;
    if (!smartAccount || !config) {
      throw new Error("Connect and verify the same Stellar passkey account before authorizing.");
    }
    return executeConversationPayment(review, {
      config,
      smartAccount,
      request: (input, init) => authenticatedFetch(input, init, getAccessToken),
      createKit: createBrowserSmartAccountKit,
      restoreAccount: restoreSmartAccount,
      submitTransfer: submitStellarUsdcTransfer,
    });
  }

  async function handleSendMessage(text: string, inputMode: "text" | "voice") {
    setMessages((previous) => [...previous, {
      id: crypto.randomUUID(), sender: "user", text, timestamp: "Just now",
    }]);
    if (!authReady || !authenticated) {
      appendTelya("Sign in before Telya can save this request or verify any financial state. No payment has been submitted.");
      if (authReady) login();
      return;
    }
    setIsProcessing(true);
    try {
      const saved = await persistUserMessage(text);
      const parsed = parseNaturalLanguageIntent(text, inputMode);
      if (parsed.kind === "balance_check") {
        const stellar = balances.find((balance) => balance.network === "stellar" && balance.status === "verified");
        appendTelya(stellar?.amount
          ? `Your server-verified Stellar Testnet balance is ${stellar.amount} USDC. Base balance is unavailable.`
          : "A verified USDC balance is unavailable right now. No zero balance is being assumed.");
        return;
      }
      if (parsed.kind === "activity_check") {
        appendTelya("Your authenticated payment history and persisted event timelines are available in Activity below. Refresh there to reconcile a submitted Stellar payment without resubmitting it.");
        return;
      }
      if (parsed.kind === "agent_pass_check") {
        appendTelya("Agent Pass details are not connected to this conversation yet.");
        return;
      }
      if (parsed.kind === "clarification") {
        appendTelya(parsed.clarificationQuestion ?? "Please clarify the payment details.");
        return;
      }
      if (parsed.kind !== "payment" || !parsed.amount || !parsed.recipientInput) {
        appendTelya("Enter an amount and recipient, such as ‘Send 5 USDC to @alice’.");
        return;
      }

      const selectedWallet = parsed.requestedSourceNetwork
        ? balances.find((balance) => balance.network === parsed.requestedSourceNetwork && balance.status === "verified")
        : undefined;
      const response = await authenticatedFetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `conversation:${saved.messageId}`,
        },
        body: JSON.stringify({
          conversationId: saved.conversationId,
          intentMessageId: saved.messageId,
          inputMode,
          selectedSourceWalletId: selectedWallet?.walletId ?? null,
          intent: {
            amount: parsed.amount,
            asset: "USDC",
            recipientInput: parsed.recipientInput,
            requestedSourceNetwork: parsed.requestedSourceNetwork ?? null,
            requestedDestinationNetwork: parsed.requestedDestinationNetwork ?? null,
          },
        }),
      }, getAccessToken);
      const payload: unknown = await response.json();
      const review = response.ok ? parsePaymentReview(payload) : null;
      if (review) {
        appendTelya(review.explanation, review, parsed.recipientInput);
        return;
      }
      appendTelya(apiMessage(
        payload,
        response.status === 503
          ? "Payment review is temporarily unavailable because a required provider could not be verified. No payment has been submitted."
          : "Telya could not create a verified payment review. No payment has been submitted.",
      ));
    } catch (error) {
      appendTelya(error instanceof Error
        ? `${error.message} No payment has been submitted.`
        : "The request could not be verified. No payment has been submitted.");
    } finally {
      setIsProcessing(false);
    }
  }

  const stellarBalance = balances.find((balance) => balance.network === "stellar" && balance.status === "verified");
  const baseBalance = balances.find((balance) => balance.network === "base" && balance.status === "verified");
  return (
    <div className="conversational-home-wrapper shell">
      <div className="home-balances-header">
        <div className="balance-pill stellar">
          <span className="chain-dot stellar" /><span className="chain-name">Stellar USDC</span>
          <span className="chain-amount tabular">{stellarBalance?.amount ?? "Unavailable"}</span>
        </div>
        <div className="balance-pill base">
          <span className="chain-dot base" /><span className="chain-name">Base USDC</span>
          <span className="chain-amount tabular">{baseBalance?.amount ?? "Unavailable"}</span>
        </div>
        <div className="balance-pill total">
          <span className="chain-name">Stellar account</span>
          {smartAccount ? (
            <span className="chain-amount tabular proof-text"><CheckCircle2 className="inline-check" /> Connected</span>
          ) : authenticated ? (
            <a href="/onboarding" className="chain-connect-link">Connect Passkey</a>
          ) : (
            <button type="button" className="chain-connect-link" onClick={login}>Sign in</button>
          )}
        </div>
      </div>
      <div className="conversation-stream" role="log" aria-label="Conversation stream">
        {messages.map((message) => (
          <div key={message.id} className={`stream-item ${message.sender}`}>
            <div className="stream-bubble"><p className="bubble-text">{message.text}</p></div>
            {message.review && message.recipientLabel && (
              <PaymentReviewCard
                review={message.review}
                recipientLabel={message.recipientLabel}
                canAuthorize={Boolean(smartAccount && authenticated)}
                onConfirm={() => confirmPayment(message.review!)}
                onRefresh={(transactionHash) => reconcilePayment(message.review!, transactionHash)}
                onCancel={() => setMessages((previous) => previous.filter((item) => item.id !== message.id))}
              />
            )}
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
