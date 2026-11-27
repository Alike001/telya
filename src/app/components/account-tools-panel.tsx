"use client";

import { useEffect, useState } from "react";
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

function prefill(text: string) {
  window.location.hash = "composer";
  window.dispatchEvent(new CustomEvent("telya:prefill-payment", { detail: text }));
}

export function AccountToolsPanel() {
  const [account, setAccount] = useState<ConnectedSmartAccount | null>(null);
  const [showRamp, setShowRamp] = useState(false);
  const [showJudge, setShowJudge] = useState(false);
  const [kit, setKit] = useState<SmartAccountKit | null>(null);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) return;
        const config = await response.json() as SmartAccountPublicConfig;
        const kit = createBrowserSmartAccountKit(config);
        const restored = await restoreSmartAccount(kit);
        if (active) {
          setKit(kit);
          setAccount(restored);
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
  }, []);

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
          onKitChange={setKit}
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
