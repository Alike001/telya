"use client";

import { useEffect, useRef, useState } from "react";
import type { SmartAccountKit } from "smart-account-kit";

import {
  connectSmartAccount,
  createBrowserSmartAccountKit,
  createSmartAccount,
  disconnectSmartAccount,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../stellar/smart-account";

type WalletPhase =
  | "loading"
  | "disconnected"
  | "creating"
  | "connecting"
  | "connected"
  | "error";

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The Stellar account action did not complete.";
}

export function StellarWalletPanel() {
  const kitRef = useRef<SmartAccountKit | null>(null);
  const [phase, setPhase] = useState<WalletPhase>("loading");
  const [account, setAccount] = useState<ConnectedSmartAccount | null>(null);
  const [username, setUsername] = useState("");
  const [notice, setNotice] = useState("Checking this browser for a saved passkey session…");

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) throw new Error("Stellar account setup is temporarily unavailable.");
        const config = (await response.json()) as SmartAccountPublicConfig;
        const kit = createBrowserSmartAccountKit(config);
        kitRef.current = kit;
        const restored = await restoreSmartAccount(kit);
        if (!active) return;
        setAccount(restored);
        setPhase(restored ? "connected" : "disconnected");
        setNotice(
          restored
            ? "Passkey account restored from this browser. No transaction was submitted."
            : "No saved account was found in this browser. Create one or reconnect with an existing passkey.",
        );
      } catch (error) {
        if (!active) return;
        setPhase("error");
        setNotice(messageFor(error));
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  async function create() {
    const kit = kitRef.current;
    if (!kit) return;
    setPhase("creating");
    setNotice("Waiting for passkey creation, then Stellar Testnet deployment…");
    try {
      const connected = await createSmartAccount(kit, username);
      setAccount(connected);
      setPhase("connected");
      setNotice(
        "Passkey ownership verified and the smart account was deployed on Stellar Testnet.",
      );
    } catch (error) {
      setPhase("error");
      setNotice(messageFor(error));
    }
  }

  async function connect() {
    const kit = kitRef.current;
    if (!kit) return;
    setPhase("connecting");
    setNotice("Waiting for your existing passkey and on-chain ownership verification…");
    try {
      const connected = await connectSmartAccount(kit);
      setAccount(connected);
      setPhase("connected");
      setNotice("Existing passkey account reconnected and verified on Stellar Testnet.");
    } catch (error) {
      setPhase("error");
      setNotice(messageFor(error));
    }
  }

  async function disconnect() {
    const kit = kitRef.current;
    if (!kit) return;
    try {
      await disconnectSmartAccount(kit);
      setAccount(null);
      setPhase("disconnected");
      setNotice(
        "Signed out on this browser. Your passkey and on-chain account remain yours and can be reconnected.",
      );
    } catch (error) {
      setPhase("error");
      setNotice(messageFor(error));
    }
  }

  const busy = phase === "loading" || phase === "creating" || phase === "connecting";

  return (
    <section className="wallet-section shell" aria-labelledby="wallet-title">
      <div className="wallet-intro">
        <p className="eyebrow">Passkey-controlled Stellar account</p>
        <h2 id="wallet-title">Your account. No seed phrase.</h2>
        <p>
          Create or reconnect a Telya smart account with your device passkey. Account
          deployment is sponsored server-side; this page never receives the sponsor key.
        </p>
      </div>

      <div className="wallet-card" aria-live="polite" aria-busy={busy}>
        <div className="wallet-card-heading">
          <div>
            <span className="card-kicker">Stellar Testnet</span>
            <strong>{account ? "Account connected" : "Account setup"}</strong>
          </div>
          <span className={`wallet-state wallet-state-${phase}`}>
            {busy ? "In progress" : account ? "Verified" : phase === "error" ? "Needs attention" : "Not connected"}
          </span>
        </div>

        {account ? (
          <div className="wallet-account">
            <span>Smart-account contract</span>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${account.contractId}`}
              target="_blank"
              rel="noreferrer"
            >
              {account.contractId}
            </a>
            {account.deploymentTransactionHash ? (
              <a
                className="wallet-evidence-link"
                href={`https://stellar.expert/explorer/testnet/tx/${account.deploymentTransactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View deployment transaction ↗
              </a>
            ) : null}
          </div>
        ) : (
          <label className="wallet-username">
            <span>Passkey label</span>
            <input
              autoComplete="username webauthn"
              disabled={busy}
              maxLength={64}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Your name or username"
              value={username}
            />
          </label>
        )}

        <p className="wallet-notice">{notice}</p>

        <div className="wallet-actions">
          {account ? (
            <button className="secondary-action" onClick={() => void disconnect()} type="button">
              Sign out on this browser
            </button>
          ) : (
            <>
              <button
                className="primary-action wallet-button"
                disabled={busy || username.trim().length < 2}
                onClick={() => void create()}
                type="button"
              >
                {phase === "creating" ? "Creating account…" : "Create passkey account"}
              </button>
              <button
                className="secondary-action"
                disabled={busy}
                onClick={() => void connect()}
                type="button"
              >
                {phase === "connecting" ? "Connecting…" : "Reconnect existing account"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
