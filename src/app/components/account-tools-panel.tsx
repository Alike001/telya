"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { SmartAccountKit } from "smart-account-kit";

import {
  createBrowserSmartAccountKit,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { AgentPassPanel } from "./agent-pass-panel";
import { ContactsDirectory } from "./contacts-directory";
import { JudgeTestnetDrawer } from "./judge-testnet-drawer";
import { MoneyGramRampModal } from "./moneygram-ramp-modal";
import { authenticatedFetch } from "../authenticated-fetch";
import { verifyRestoredAccountOwnership } from "../restored-account-ownership";

function prefill(text: string) {
  window.location.hash = "composer";
  window.dispatchEvent(new CustomEvent("telya:prefill-payment", { detail: text }));
}

export function AccountToolsPanel() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <AccountToolsContent account={null} kit={null} onKitChange={() => undefined} />;
  }
  return <AuthenticatedAccountToolsPanel />;
}

function AuthenticatedAccountToolsPanel() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [account, setAccount] = useState<ConnectedSmartAccount | null>(null);
  const [kit, setKit] = useState<SmartAccountKit | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) {
      setKit(null);
      setAccount(null);
      return;
    }
    let active = true;
    async function restore() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) return;
        const config = await response.json() as SmartAccountPublicConfig;
        const kit = createBrowserSmartAccountKit(config);
        const restored = await restoreSmartAccount(kit);
        const owned = restored && await verifyRestoredAccountOwnership(
          restored,
          (input, init) => authenticatedFetch(input, init, getAccessToken),
        );
        if (active) {
          setKit(owned ? kit : null);
          setAccount(owned ? restored : null);
        }
      } catch {
        if (active) {
          setKit(null);
          setAccount(null);
        }
      }
    }
    void restore();
    return () => { active = false; };
  }, [authenticated, getAccessToken, ready]);

  return <AccountToolsContent account={account} kit={kit} onKitChange={setKit} />;
}

function AccountToolsContent({
  account,
  kit,
  onKitChange,
}: {
  readonly account: ConnectedSmartAccount | null;
  readonly kit: SmartAccountKit | null;
  readonly onKitChange: (kit: SmartAccountKit) => void;
}) {
  const [showRamp, setShowRamp] = useState(false);
  const [showJudge, setShowJudge] = useState(false);

  return (
    <section className="account-tools-section shell" aria-label="Contacts and account controls">
      <div id="contacts">
        <ContactsDirectory
          onSelectPayContact={(handle, network) => prefill(
            `Send USDC to ${handle}${network ? ` on ${network === "stellar" ? "Stellar" : "Base"}` : ""}`,
          )}
        />
      </div>
      <div id="agent-pass">
        <AgentPassPanel
          smartAccountAddress={account?.contractId ?? null}
          {...(kit ? { kit } : {})}
          onKitChange={onKitChange}
        />
      </div>
      <div className="account-tools-actions">
        <button type="button" className="timeline-done-btn" onClick={() => setShowRamp(true)}>
          Add or withdraw with MoneyGram
        </button>
        <button type="button" className="timeline-done-btn" onClick={() => setShowJudge(true)}>
          Open Testnet guide
        </button>
      </div>
      {showRamp && (
        <MoneyGramRampModal
          stellarAddress={account?.contractId ?? null}
          onClose={() => setShowRamp(false)}
        />
      )}
      <JudgeTestnetDrawer
        isOpen={showJudge}
        onClose={() => setShowJudge(false)}
        onQuickPrompt={(prompt) => prefill(prompt)}
      />
    </section>
  );
}
