"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Loader2, RefreshCw } from "lucide-react";

import {
  parsePaymentActivityDetail,
  parsePaymentActivityPage,
  type PersistedPayment,
} from "../../domain/payment-activity";
import { buildPaymentReceipt } from "../../domain/payment-timeline";
import { authenticatedFetch } from "../authenticated-fetch";
import {
  captureSessionAccessToken,
  createSessionRequestGuard,
  type SessionRequestGuard,
} from "../session-request-guard";
import { ActivityHistory } from "./activity-history";
import { reconcileAndReloadActivityPayment } from "./payment-activity-refresh";
import { PaymentProgressTimeline } from "./payment-progress-timeline";
import { PaymentReceiptModal } from "./payment-receipt-modal";

export function PaymentActivityPanel() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <ActivityUnavailable message="Sign-in is not configured, so authenticated payment history is unavailable." />;
  }
  return <AuthenticatedPaymentActivity />;
}

function ActivityUnavailable({ message }: { readonly message: string }) {
  return (
    <div className="activity-empty-state" role="status">
      <p className="empty-title">Payment activity unavailable</p>
      <p className="empty-sub">{message}</p>
    </div>
  );
}

function AuthenticatedPaymentActivity() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [payments, setPayments] = useState<readonly PersistedPayment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<PersistedPayment | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionGuardRef = useRef<SessionRequestGuard | null>(null);

  const captureRequest = useCallback(
    async (guard: SessionRequestGuard) => {
      const tokenProvider = await captureSessionAccessToken(getAccessToken, guard);
      return (input: string, init: RequestInit = {}) =>
        authenticatedFetch(input, init, tokenProvider);
    },
    [getAccessToken],
  );

  const loadPage = useCallback(async (cursor?: string, requestedGuard?: SessionRequestGuard) => {
    const guard = requestedGuard ?? sessionGuardRef.current;
    if (!guard?.isActive()) return;
    setLoading(true);
    setError(null);
    try {
      const request = await captureRequest(guard);
      const query = cursor
        ? `/api/payments?limit=20&before=${encodeURIComponent(cursor)}`
        : "/api/payments?limit=20";
      const response = await request(query, { cache: "no-store" });
      const payload: unknown = await response.json();
      const page = response.ok ? parsePaymentActivityPage(payload) : null;
      if (!page) throw new Error("The persisted payment history response could not be verified.");
      if (!guard.isActive()) return;
      setPayments((previous) => cursor ? [...previous, ...page.payments] : page.payments);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      if (!guard.isActive()) return;
      setError(reason instanceof Error ? reason.message : "Payment history is temporarily unavailable.");
    } finally {
      if (guard.isActive()) setLoading(false);
    }
  }, [captureRequest]);

  useEffect(() => {
    sessionGuardRef.current?.cancel();
    sessionGuardRef.current = null;
    if (!ready || !authenticated) {
      setPayments([]);
      setNextCursor(null);
      setSelected(null);
      setShowReceipt(false);
      setLoading(false);
      setError(null);
      return;
    }
    setPayments([]);
    setNextCursor(null);
    setSelected(null);
    setShowReceipt(false);
    setError(null);
    const guard = createSessionRequestGuard();
    sessionGuardRef.current = guard;
    void loadPage(undefined, guard);
    return () => {
      guard.cancel();
      if (sessionGuardRef.current === guard) sessionGuardRef.current = null;
    };
  }, [authenticated, loadPage, ready]);

  async function fetchDetail(
    paymentId: string,
    guard: SessionRequestGuard | null = sessionGuardRef.current,
    operationRequest?: (input: string, init?: RequestInit) => Promise<Response>,
  ): Promise<PersistedPayment | null> {
    if (!guard?.isActive()) return null;
    const request = operationRequest ?? await captureRequest(guard);
    const response = await request(`/api/payments?id=${encodeURIComponent(paymentId)}`, {
      cache: "no-store",
    });
    const payload: unknown = await response.json();
    const payment = response.ok ? parsePaymentActivityDetail(payload) : null;
    if (!payment) throw new Error("The persisted payment timeline could not be verified.");
    if (!guard.isActive()) return null;
    setSelected(payment);
    setPayments((previous) => previous.map((item) => item.id === payment.id ? payment : item));
    return payment;
  }

  async function openTimeline(payment: PersistedPayment) {
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) return;
    setError(null);
    setShowReceipt(false);
    try {
      const request = await captureRequest(guard);
      await fetchDetail(payment.id, guard, request);
    } catch (reason) {
      if (!guard.isActive()) return;
      setError(reason instanceof Error ? reason.message : "Payment details are temporarily unavailable.");
    }
  }

  async function refreshSelected() {
    if (!selected) return;
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) return;
    setError(null);
    try {
      const request = await captureRequest(guard);
      await reconcileAndReloadActivityPayment(
        selected,
        request,
        () => fetchDetail(selected.id, guard, request),
      );
    } catch (reason) {
      if (!guard.isActive()) return;
      setError(reason instanceof Error ? reason.message : "Payment refresh is temporarily unavailable.");
    }
  }

  if (!ready) return <ActivityUnavailable message="Checking the authenticated session…" />;
  if (!authenticated) {
    return (
      <div className="activity-empty-state">
        <p className="empty-title">Sign in to view persisted activity</p>
        <p className="empty-sub">Telya never restores financial history from browser storage.</p>
        <button type="button" className="cta-button primary" onClick={login}>Sign in</button>
      </div>
    );
  }

  const receipt = selected ? buildPaymentReceipt(selected, selected.events) : null;
  return (
    <div className="activity-live-surface">
      <div className="activity-live-header">
        <div>
          <p className="eyebrow">Persisted payment evidence</p>
          <h2>Activity and verified receipts</h2>
        </div>
        <button
          type="button"
          className="refresh-btn"
          onClick={() => { void loadPage(); }}
          disabled={loading}
          aria-label="Refresh payment history"
        >
          <RefreshCw className={`refresh-icon ${loading ? "spin" : ""}`} />
        </button>
      </div>

      {error && <div className="review-error-banner" role="alert">{error}</div>}
      {loading && payments.length === 0 ? (
        <div className="activity-empty-state" role="status">
          <Loader2 className="empty-icon spinner" />
          <p className="empty-title">Loading persisted activity…</p>
        </div>
      ) : selected ? (
        <>
          <PaymentProgressTimeline
            payment={selected}
            events={selected.events}
            onRefresh={refreshSelected}
            {...(receipt ? { onViewReceipt: () => setShowReceipt(true) } : {})}
            onClose={() => { setSelected(null); setShowReceipt(false); }}
          />
          {selected.status === "authorized" && selected.route.id === "base_to_stellar_cctp" &&
            selected.sourceTransaction === null && selected.destinationTransaction === null && (
              <a className="cta-button primary" href={`/?resumePayment=${encodeURIComponent(selected.id)}`}>
                Resume this authorized Base payment
              </a>
            )}
          {selected.status === "awaiting_confirmation" && selected.route.id === "stellar_to_base_cctp" &&
            selected.sourceTransaction === null && selected.destinationTransaction === null && (
              <a className="cta-button primary" href={`/?resumePayment=${encodeURIComponent(selected.id)}`}>
                Resume this Stellar payment review
              </a>
            )}
        </>
      ) : (
        <>
          <ActivityHistory
            payments={payments}
            activePaymentId={null}
            onSelectPayment={(payment) => { void openTimeline(payment); }}
            onOpenTimeline={(payment) => { void openTimeline(payment); }}
          />
          {nextCursor && (
            <button
              type="button"
              className="timeline-done-btn activity-load-more"
              onClick={() => { void loadPage(nextCursor); }}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load older payments"}
            </button>
          )}
        </>
      )}

      {showReceipt && selected && receipt && (
        <PaymentReceiptModal
          payment={selected}
          events={selected.events}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
