"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { CheckCircle2 } from "lucide-react";

import { authenticatedFetch } from "../authenticated-fetch";
import {
  captureSessionAccessToken,
  createSessionRequestGuard,
  type SessionRequestGuard,
} from "../session-request-guard";
import {
  createBrowserSmartAccountKit,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { submitStellarUsdcTransfer } from "../../stellar/usdc";
import { submitStellarCctpApproval, submitStellarCctpBurn } from "../../stellar/cctp";
import {
  submitBaseCctpBurn,
  submitBaseUsdcTransfer,
  type Eip1193Provider,
} from "../../base/evm";
import {
  apiMessage,
  mergeVerifiedBalanceSnapshots,
  parsePaymentReview,
  parseResumableBaseCctpReview,
  parseResumableStellarCctpReview,
  parsePersistedPaymentHashes,
  parseVerifiedBalances,
} from "./conversation-payment";
import type {
  PaymentExecutionResult,
  PaymentReview,
  VerifiedBalance,
} from "./conversation-payment";
import {
  executeConversationPayment,
  approveConversationCctpAllowance,
  reconcileConversationBaseDirectPayment,
  reconcileConversationBaseToStellarPayment,
  reconcileConversationCctpPayment,
  reconcileConversationPayment,
  type AuthenticatedRequest,
} from "./conversation-payment-execution";
import { resolveConversationIntent } from "./conversation-intent";
import { verifyRestoredAccountOwnership } from "../restored-account-ownership";
import { PaymentReviewCard } from "./payment-review-card";
import { VoiceComposer } from "./voice-composer";
import {
  resetConversationSession,
  type ChatMessage,
} from "./conversation-session";

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
  const { wallets } = useWallets();
  const [smartAccount, setSmartAccount] = useState<ConnectedSmartAccount | null>(null);
  const [balances, setBalances] = useState<readonly VerifiedBalance[]>([]);
  const [messages, setMessages] = useState<readonly ChatMessage[]>(
    () => resetConversationSession().messages,
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<SmartAccountPublicConfig | null>(null);
  const sessionGuardRef = useRef<SessionRequestGuard | null>(null);
  const resumedPaymentRef = useRef<string | null>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    sessionGuardRef.current?.cancel();
    sessionGuardRef.current = null;
    if (!authReady || !authenticated) {
      resumedPaymentRef.current = null;
      const reset = resetConversationSession();
      setSmartAccount(null);
      setBalances([]);
      setMessages(reset.messages);
      setConversationId(reset.conversationId);
      setIsProcessing(false);
      configRef.current = null;
      return;
    }
    setSmartAccount(null);
    setBalances([]);
    configRef.current = null;
    const guard = createSessionRequestGuard();
    sessionGuardRef.current = guard;
    async function restore() {
      let request: AuthenticatedRequest;
      try {
        request = await captureOperationRequest(guard);
      } catch {
        if (guard.isActive()) {
          setSmartAccount(null);
          setBalances([]);
        }
        return;
      }
      try {
        const configResponse = await fetch("/api/stellar/config", { cache: "no-store" });
        if (configResponse.ok) {
          const config = await configResponse.json() as SmartAccountPublicConfig;
          if (!guard.isActive()) return;
          configRef.current = config;
          const account = await restoreSmartAccount(createBrowserSmartAccountKit(config));
          if (account) {
            const owned = await verifyRestoredAccountOwnership(
              account,
              request,
            );
            if (guard.isActive()) setSmartAccount(owned ? account : null);
          } else if (guard.isActive()) {
            setSmartAccount(null);
          }
        }
      } catch {
        if (guard.isActive()) setSmartAccount(null);
      }
      if (!guard.isActive()) return;
      let verifiedBalances: readonly VerifiedBalance[] = [];
      try {
        const stellarBalanceResponse = await request(
          "/api/balances",
          { cache: "no-store" },
        );
        if (stellarBalanceResponse.ok) {
          verifiedBalances = parseVerifiedBalances(await stellarBalanceResponse.json());
        }
      } catch {
        verifiedBalances = [];
      }
      try {
        const baseBalanceResponse = await request(
          "/api/base/balances",
          { cache: "no-store" },
        );
        if (baseBalanceResponse.ok) {
          verifiedBalances = mergeVerifiedBalanceSnapshots(
            verifiedBalances,
            parseVerifiedBalances(await baseBalanceResponse.json()),
          );
        }
      } catch {
        // Keep the independently verified Stellar snapshot and the explicit
        // unavailable Base entries returned by /api/balances.
      }
      if (guard.isActive()) setBalances(verifiedBalances);
      const resumeId = new URLSearchParams(window.location.search).get("resumePayment");
      if (resumeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resumeId) &&
          resumedPaymentRef.current !== resumeId) {
        resumedPaymentRef.current = resumeId;
        try {
          const response = await request(`/api/payments?id=${encodeURIComponent(resumeId)}`, { cache: "no-store" });
          const payload: unknown = await response.json();
          if (!guard.isActive()) return;
          const review = response.ok
            ? parseResumableBaseCctpReview(payload, resumeId) ?? parseResumableStellarCctpReview(payload, resumeId)
            : null;
          if (review) {
            appendTelya(review.explanation, review, review.recipientAddress, guard);
          } else {
            appendTelya("This existing payment cannot be authorized again from its current recorded state. Check Activity before taking another action.", undefined, undefined, guard);
          }
        } catch {
          appendTelya("The existing payment could not be restored right now. Check Activity before taking another action.", undefined, undefined, guard);
        }
      }
    }
    void restore();
    return () => {
      guard.cancel();
      if (sessionGuardRef.current === guard) sessionGuardRef.current = null;
    };
  }, [authReady, authenticated, getAccessToken]);

  async function captureOperationRequest(
    guard: SessionRequestGuard,
  ): Promise<AuthenticatedRequest> {
    const tokenProvider = await captureSessionAccessToken(getAccessToken, guard);
    return (input, init) => authenticatedFetch(input, init, tokenProvider);
  }

  function appendTelya(
    text: string,
    review?: PaymentReview,
    recipientLabel?: string,
    guard?: SessionRequestGuard,
  ) {
    if (guard && !guard.isActive()) return;
    setMessages((previous) => [...previous, {
      id: crypto.randomUUID(), sender: "telya", text, timestamp: "Just now",
      ...(review ? { review } : {}),
      ...(recipientLabel ? { recipientLabel } : {}),
    }]);
  }

  async function persistUserMessage(
    text: string,
    guard: SessionRequestGuard,
    request: AuthenticatedRequest,
  ): Promise<{ conversationId: string; messageId: string } | null> {
    const response = await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, ...(conversationId ? { conversationId } : {}) }),
    });
    const payload = await response.json() as {
      conversation?: { id?: unknown };
      message?: { id?: unknown };
    };
    if (!guard.isActive()) return null;
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
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) throw new Error("Authenticated session changed.");
    const request = await captureOperationRequest(guard);
    let transactionHash = submittedTransactionHash;
    if (!transactionHash && review.sourceNetwork === "base") {
      const response = await request(
        `/api/payments?id=${encodeURIComponent(review.id)}`,
        { cache: "no-store" },
      );
      const hashes = response.ok
        ? parsePersistedPaymentHashes(await response.json(), review.id)
        : null;
      transactionHash = review.routeId === "base_to_base"
        ? hashes?.destinationTransactionHash
        : hashes?.sourceTransactionHash;
      if (!transactionHash) {
        throw new Error("No persisted Base transaction hash is available. Check the connected wallet before creating another payment.");
      }
    }
    if (review.routeId === "base_to_base" && transactionHash) {
      return reconcileConversationBaseDirectPayment(
        review,
        transactionHash,
        request,
      );
    }
    if (review.routeId === "base_to_stellar" && transactionHash) {
      return reconcileConversationBaseToStellarPayment(
        review,
        transactionHash,
        request,
      );
    }
    if (review.routeId === "stellar_to_base") {
      return reconcileConversationCctpPayment(
        review,
        transactionHash,
        request,
      );
    }
    return reconcileConversationPayment(
      review,
      transactionHash,
      request,
    );
  }

  async function confirmPayment(review: PaymentReview): Promise<PaymentExecutionResult> {
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) throw new Error("Authenticated session changed.");
    const request = await captureOperationRequest(guard);
    const config = configRef.current;
    if (review.sourceNetwork === "stellar" && (!smartAccount || !config)) {
      throw new Error("Connect and verify the same Stellar passkey account before authorizing.");
    }
    const getBaseProvider = async (sender: string): Promise<Eip1193Provider> => {
      const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === sender.toLowerCase());
      if (!wallet) throw new Error("The server-authorized Base wallet is not connected to this Privy session.");
      await wallet.loginOrLink();
      await wallet.switchChain(84_532);
      const provider = await wallet.getEthereumProvider();
      const accounts = await provider.request({ method: "eth_accounts" });
      if (!Array.isArray(accounts) || !accounts.some((address) =>
        typeof address === "string" && address.toLowerCase() === sender.toLowerCase())) {
        throw new Error("The active Base wallet does not match the server-authorized source address.");
      }
      return {
        request: ({ method, params }) => provider.request({
          method,
          ...(params ? { params: [...params] } : {}),
        }),
      };
    };
    return executeConversationPayment(review, {
      config,
      smartAccount,
      request,
      createKit: createBrowserSmartAccountKit,
      restoreAccount: restoreSmartAccount,
      submitTransfer: submitStellarUsdcTransfer,
      submitCctpBurn: submitStellarCctpBurn,
      getBaseProvider,
      submitBaseTransfer: submitBaseUsdcTransfer,
      submitBaseCctpBurn,
    });
  }

  async function approveCctpAllowance(review: PaymentReview) {
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) throw new Error("Authenticated session changed.");
    const request = await captureOperationRequest(guard);
    return approveConversationCctpAllowance(review, {
      config: configRef.current,
      smartAccount,
      request,
      createKit: createBrowserSmartAccountKit,
      restoreAccount: restoreSmartAccount,
      submitApproval: submitStellarCctpApproval,
      confirmReview: (details) => window.confirm(details),
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
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) return;
    setIsProcessing(true);
    try {
      const request = await captureOperationRequest(guard);
      const saved = await persistUserMessage(text, guard, request);
      if (!saved || !guard.isActive()) return;
      const parsed = await resolveConversationIntent(
        text,
        inputMode,
        request,
      );
      if (!guard.isActive()) return;
      if (parsed.kind === "balance_check") {
        const stellar = balances.find((balance) => balance.network === "stellar" && balance.status === "verified");
        const base = balances.find((balance) => balance.network === "base" && balance.status === "verified");
        const stellarMessage = stellar?.amount != null
          ? `Your server-verified Stellar Testnet balance is ${stellar.amount} USDC.`
          : "Your Stellar USDC balance is unavailable; no zero balance is being assumed.";
        const baseMessage = base?.amount != null
          ? `Your server-verified Base Sepolia balance is ${base.amount} USDC.`
          : "Your Base USDC balance is unavailable; no zero balance is being assumed.";
        appendTelya(`${stellarMessage} ${baseMessage}`, undefined, undefined, guard);
        return;
      }
      if (parsed.kind === "activity_check") {
        appendTelya("Your authenticated payment history and persisted event timelines are available in Activity below. Refresh there to reconcile a submitted Stellar payment without resubmitting it.", undefined, undefined, guard);
        return;
      }
      if (parsed.kind === "contacts_check") {
        appendTelya("Your authenticated, owner-scoped contacts are available below. Selecting one only prefills a payment request; passkey confirmation is still required.", undefined, undefined, guard);
        return;
      }
      if (parsed.kind === "ramp_check") {
        appendTelya("MoneyGram Ramps is unavailable while partner access and Stellar smart-account compatibility remain unconfirmed. No quote, reference or cash transaction has been created.", undefined, undefined, guard);
        return;
      }
      if (parsed.kind === "judge_check") {
        appendTelya("Use the Testnet guide below to inspect current evidence and known unavailable routes. It does not mark a provider or payment successful.", undefined, undefined, guard);
        return;
      }
      if (parsed.kind === "agent_pass_check") {
        appendTelya("Agent Pass management is available below from persisted Stellar Testnet rule evidence. Creating or revoking a rule still requires the owner passkey.", undefined, undefined, guard);
        return;
      }
      if (parsed.kind === "clarification") {
        appendTelya(parsed.clarificationQuestion ?? "Please clarify the payment details.", undefined, undefined, guard);
        return;
      }
      if (parsed.kind !== "payment" || !parsed.amount || !parsed.recipientInput) {
        appendTelya("Enter an amount and recipient, such as ‘Send 5 USDC to @alice’.", undefined, undefined, guard);
        return;
      }

      const selectedWallet = parsed.requestedSourceNetwork
        ? balances.find((balance) => balance.network === parsed.requestedSourceNetwork && balance.status === "verified")
        : undefined;
      const response = await request("/api/payments", {
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
      });
      const payload: unknown = await response.json();
      if (!guard.isActive()) return;
      const review = response.ok ? parsePaymentReview(payload) : null;
      if (review) {
        appendTelya(review.explanation, review, parsed.recipientInput, guard);
        return;
      }
      appendTelya(apiMessage(
        payload,
        response.status === 503
          ? "Payment review is temporarily unavailable because a required provider could not be verified. No payment has been submitted."
          : "Telya could not create a verified payment review. No payment has been submitted.",
      ), undefined, undefined, guard);
    } catch (error) {
      appendTelya(error instanceof Error
        ? `${error.message} No payment has been submitted.`
        : "The request could not be verified. No payment has been submitted.", undefined, undefined, guard);
    } finally {
      if (guard.isActive()) setIsProcessing(false);
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
                canAuthorize={Boolean(authenticated && (
                  message.review.sourceNetwork === "base" ? wallets.length > 0 : smartAccount
                ))}
                onConfirm={() => confirmPayment(message.review!)}
                {...(message.review.routeId === "stellar_to_base"
                  ? { onApprove: () => approveCctpAllowance(message.review!) }
                  : {})}
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

