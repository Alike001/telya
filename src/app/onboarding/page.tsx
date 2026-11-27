"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import type { SmartAccountKit } from "smart-account-kit";
import {
  connectSmartAccount,
  createBrowserSmartAccountKit,
  createSmartAccount,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../../stellar/smart-account";
import { validateUsername } from "../../domain/username";
import { authenticatedFetch } from "../authenticated-fetch";

type OnboardingStep = "welcome" | "username" | "creating" | "ready" | "returning";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: ArrayBuffer): string {
  const raw = String.fromCharCode(...new Uint8Array(value));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function OnboardingPage() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <main className="onboarding-main">
        <div className="onboarding-card welcome-card" role="alert">
          <h1>Sign-in is temporarily unavailable.</h1>
          <p className="card-subtitle">Telya cannot verify your identity until the Testnet sign-in service is configured.</p>
          <Link href="/">Return to Telya</Link>
        </div>
      </main>
    );
  }
  return <OnboardingFlow />;
}

function OnboardingFlow() {
  const { ready: authReady, authenticated, login, getAccessToken } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { ready: walletsReady, wallets } = useWallets();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [usernameInput, setUsernameInput] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameFeedback, setUsernameFeedback] = useState("");
  const [account, setAccount] = useState<ConnectedSmartAccount | null>(null);
  const [claimedUsername, setClaimedUsername] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedBaseWallet, setSelectedBaseWallet] = useState("");
  const [verifiedBaseWallet, setVerifiedBaseWallet] = useState<string | null>(null);
  const [baseWalletBusy, setBaseWalletBusy] = useState(false);
  const [baseWalletError, setBaseWalletError] = useState<string | null>(null);

  const kitRef = useRef<SmartAccountKit | null>(null);
  const configRef = useRef<SmartAccountPublicConfig | null>(null);
  const creationRef = useRef(false);

  useEffect(() => {
    if (wallets.length === 1 && !selectedBaseWallet) setSelectedBaseWallet(wallets[0]!.address);
    if (selectedBaseWallet && !wallets.some((wallet) => wallet.address.toLowerCase() === selectedBaseWallet.toLowerCase())) {
      setSelectedBaseWallet("");
      setVerifiedBaseWallet(null);
    }
  }, [selectedBaseWallet, wallets]);

  async function verifyBaseWallet(): Promise<void> {
    const wallet = wallets.find((candidate) =>
      candidate.address.toLowerCase() === selectedBaseWallet.toLowerCase());
    if (!wallet) {
      setBaseWalletError(wallets.length > 1
        ? "Choose the exact Base wallet you want Telya to use."
        : "Connect an Ethereum wallet before verification.");
      return;
    }
    setBaseWalletBusy(true);
    setBaseWalletError(null);
    try {
      await wallet.loginOrLink();
      await wallet.switchChain(84_532);
      const provider = await wallet.getEthereumProvider();
      const accounts = await provider.request({ method: "eth_accounts" });
      if (!Array.isArray(accounts) || !accounts.some((address) =>
        typeof address === "string" && address.toLowerCase() === wallet.address.toLowerCase())) {
        throw new Error("The selected wallet did not expose the verified Base account.");
      }
      const response = await authenticatedFetch("/api/wallets/base/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.address }),
      }, getAccessToken);
      const payload = await response.json() as { verified?: unknown; address?: unknown; error?: unknown };
      if (!response.ok || payload.verified !== true || typeof payload.address !== "string" ||
          payload.address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error(typeof payload.error === "string"
          ? `Base wallet verification failed: ${payload.error}`
          : "Base wallet verification failed.");
      }
      setVerifiedBaseWallet(payload.address.toLowerCase());
    } catch (error) {
      setVerifiedBaseWallet(null);
      setBaseWalletError(error instanceof Error ? error.message : "Base wallet verification was not completed.");
    } finally {
      setBaseWalletBusy(false);
    }
  }
  async function bindWalletToIdentity(connected: ConnectedSmartAccount): Promise<void> {
    const challengeResponse = await authenticatedFetch(
      "/api/wallets/stellar/challenge",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: connected.contractId, credentialId: connected.credentialId }),
      },
      getAccessToken,
    );
    if (!challengeResponse.ok) throw new Error("Wallet verification is unavailable. Your account was not linked to your sign-in.");
    const challenge = await challengeResponse.json() as {
      challenge: string; proofToken: string; rpId: string;
    };
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: decodeBase64Url(challenge.challenge),
        rpId: challenge.rpId,
        allowCredentials: [{ id: decodeBase64Url(connected.credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 120_000,
      },
    });
    if (!(credential instanceof PublicKeyCredential) ||
        !(credential.response instanceof AuthenticatorAssertionResponse)) {
      throw new Error("Passkey verification was not completed.");
    }
    const assertion = {
      id: credential.id,
      response: {
        authenticatorData: encodeBase64Url(credential.response.authenticatorData),
        clientDataJSON: encodeBase64Url(credential.response.clientDataJSON),
        signature: encodeBase64Url(credential.response.signature),
      },
    };
    const bindResponse = await authenticatedFetch(
      "/api/wallets/stellar/bind",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofToken: challenge.proofToken, assertion }),
      },
      getAccessToken,
    );
    if (!bindResponse.ok) throw new Error("Passkey ownership could not be verified for this sign-in.");
  }

  useEffect(() => {
    if (authReady && !authenticated) {
      setAccount(null);
      setClaimedUsername("");
      setStep("welcome");
    }
  }, [authReady, authenticated]);

  // Initialize SmartAccountKit
  useEffect(() => {
    if (!authReady || !authenticated) return;
    let active = true;

    async function init() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) return;
        const config = (await response.json()) as SmartAccountPublicConfig;
        configRef.current = config;
        const kit = createBrowserSmartAccountKit(config);
        kitRef.current = kit;

        // Check if there is an existing restored account with a durable claim on server
        const restored = await restoreSmartAccount(kit);
        if (active && restored) {
          try {
            const lookupRes = await authenticatedFetch(
              `/api/usernames/lookup?account=${encodeURIComponent(restored.contractId)}`,
              { cache: "no-store" },
              getAccessToken,
            );
            const lookupData = await lookupRes.json();
            if (active && lookupRes.ok && lookupData.found && lookupData.username) {
              setAccount(restored);
              setClaimedUsername(lookupData.username);
              setStep("ready");
            }
          } catch {
            // lookup network error
          }
        }
      } catch {
        // Fallback for offline/test environments
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [authReady, authenticated, getAccessToken]);

  // Debounce username input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(usernameInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [usernameInput]);

  // Check username availability
  useEffect(() => {
    if (!debouncedUsername) {
      setUsernameStatus("idle");
      setUsernameFeedback("");
      return;
    }

    const validation = validateUsername(debouncedUsername);
    if (!validation.valid) {
      setUsernameStatus(validation.error?.includes("reserved") ? "reserved" : "invalid");
      setUsernameFeedback(validation.error ?? "Invalid username");
      return;
    }

    let active = true;
    setUsernameStatus("checking");
    setUsernameFeedback("Checking availability...");

    async function checkAvailability() {
      try {
        const res = await fetch(
          `/api/usernames/check?username=${encodeURIComponent(debouncedUsername)}`,
        );
        const data = await res.json();
        if (!active) return;

        if (res.status === 503 || !res.ok) {
          // Fail closed
          setUsernameStatus("invalid");
          setUsernameFeedback(
            data.error || "Username registry is temporarily unavailable.",
          );
          return;
        }

        if (data.available) {
          setUsernameStatus("available");
          setUsernameFeedback(`@${data.normalized} is available!`);
        } else {
          if (data.error?.includes("reserved")) {
            setUsernameStatus("reserved");
            setUsernameFeedback(data.error);
          } else {
            setUsernameStatus("taken");
            setUsernameFeedback(
              data.error ?? `@${data.normalized} is already taken.`,
            );
          }
        }
      } catch {
        if (!active) return;
        // Fail closed on network failure
        setUsernameStatus("invalid");
        setUsernameFeedback(
          "Unable to check username availability. Please verify network connection.",
        );
      }
    }

    void checkAvailability();
    return () => {
      active = false;
    };
  }, [debouncedUsername]);

  // Handle Passkey smart account registration & atomic durable claim
  async function handleCreateAccount() {
    if (usernameStatus !== "available") return;
    if (!authReady) return;
    if (!authenticated) {
      setErrorMessage("Sign in to Telya first, then confirm your username and passkey account.");
      login();
      return;
    }
    setStep("creating");
    setErrorMessage(null);

    const validation = validateUsername(debouncedUsername);
    if (!validation.valid) {
      setErrorMessage(validation.error ?? "Invalid username format.");
      setStep("username");
      return;
    }

    let kit = kitRef.current;
    if (!kit) {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (response.ok) {
          const config = (await response.json()) as SmartAccountPublicConfig;
          configRef.current = config;
          kit = createBrowserSmartAccountKit(config);
          kitRef.current = kit;
        }
      } catch {
        // retry on demand
      }
    }

    if (!kit) {
      setErrorMessage("Passkey service is initializing. Please try again in a moment.");
      setStep("username");
      return;
    }

    if (creationRef.current) return;
    creationRef.current = true;
    try {
      const normalized = validation.normalized;
      // Reuse a deployed account after a claim/network failure; never deploy a
      // second account just because the user retries the same onboarding flow.
      const created = account ?? await createSmartAccount(kit, normalized);
      setAccount(created);

      // 2. Bind the authenticated Privy user to the live on-chain passkey signer.
      await bindWalletToIdentity(created);

      // 3. Persist the atomic username claim only after wallet proof succeeds.
      const claimRes = await authenticatedFetch("/api/usernames/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalized,
          smartAccountAddress: created.contractId,
        }),
      }, getAccessToken);

      const claimData = await claimRes.json();
      if (!claimRes.ok || !claimData.success) {
        throw new Error(claimData.error || "Failed to persist username claim to registry.");
      }

      setAccount(created);
      setClaimedUsername(claimData.username || normalized);
      setStep("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey authorization or username claim failed.";
      setErrorMessage(msg);
      setStep("username");
    } finally {
      creationRef.current = false;
    }
  }

  // Handle returning user passkey sign-in with durable server restoration
  async function handleSignIn() {
    setErrorMessage(null);
    if (!authReady) return;
    if (!authenticated) {
      login();
      return;
    }
    let kit = kitRef.current;
    if (!kit) {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (response.ok) {
          const config = (await response.json()) as SmartAccountPublicConfig;
          configRef.current = config;
          kit = createBrowserSmartAccountKit(config);
          kitRef.current = kit;
        }
      } catch {
        // retry on demand
      }
    }

    if (!kit) {
      setErrorMessage("Passkey service is not ready. Please try again.");
      return;
    }

    try {
      setStep("creating");
      const connected = await connectSmartAccount(kit);

      // Restore durable handle from server
      const lookupRes = await authenticatedFetch(
        `/api/usernames/lookup?account=${encodeURIComponent(connected.contractId)}`,
        { cache: "no-store" },
        getAccessToken,
      );
      const lookupData = await lookupRes.json();

      if (!lookupRes.ok) {
        throw new Error("Account identity lookup is temporarily unavailable. Please try again.");
      }
      if (lookupData.found && lookupData.username) {
        setAccount(connected);
        setClaimedUsername(lookupData.username);
        setStep("ready");
      } else {
        await bindWalletToIdentity(connected);
        setAccount(connected);
        setClaimedUsername("");
        setErrorMessage(
          "This passkey account is verified for your sign-in. Choose a unique handle to continue.",
        );
        setStep("username");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in passkey authorization was cancelled.";
      setErrorMessage(msg);
      setStep("welcome");
    }
  }

  return (
    <div className="onboarding-canvas">
      {/* Top Brand Bar */}
      <header className="onboarding-header shell">
        <Link href="/" className="wordmark" aria-label="Telya Home">
          Telya<span className="wordmark-dot" aria-hidden="true">.</span>
        </Link>
        <span className="network-badge">
          <span className="status-dot pulse" aria-hidden="true" />
          Testnet
        </span>
      </header>

      {/* Main Container */}
      <main className="onboarding-main">
        {/* Step 1: Serene Welcome */}
        {step === "welcome" && (
          <div className="onboarding-card welcome-card">
            <h1>Move digital dollars with a touch.</h1>
            <p className="card-subtitle">
              Create a Stellar smart account with a device passkey, then use a verified handle to receive USDC.
            </p>

            {errorMessage && (
              <div className="onboarding-error-banner" role="alert">
                <ShieldAlert className="error-icon" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="onboarding-actions">
              <button
                type="button"
                className="cta-button primary"
                onClick={() => setStep("username")}
              >
                <Fingerprint className="btn-icon" />
                <span>Choose a handle and create an account</span>
              </button>

              <button
                type="button"
                className="cta-button secondary"
                onClick={handleSignIn}
              >
                <span>Already have an account? Sign in</span>
                <ChevronRight className="btn-icon-right" />
              </button>
            </div>

            <div className="security-guarantee-row">
              <div className="guarantee-item">
                <Lock className="guarantee-icon" />
                <span>No 24-word seed phrase</span>
              </div>
              <div className="guarantee-item">
                <ShieldCheck className="guarantee-icon" />
                <span>Device passkey control</span>
              </div>
              <div className="guarantee-item">
                <CheckCircle2 className="guarantee-icon" />
                <span>Testnet fee sponsorship when available</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Choose Username */}
        {step === "username" && (
          <div className="onboarding-card username-card">
            <div className="card-step-kicker">Step 1 of 2 · Identity</div>
            <h2>Claim your unique handle</h2>
            <p className="card-subtitle">
              Choose the username friends and agents will use to pay you digital dollars.
              Usernames are globally unique and case-insensitive.
            </p>

            {errorMessage && (
              <div className="onboarding-error-banner" role="alert">
                <ShieldAlert className="error-icon" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="handle-input-box">
              <label htmlFor="username-input" className="input-label">
                Personal Handle
              </label>
              <div className="handle-field-wrapper">
                <span className="handle-at-symbol" aria-hidden="true">@</span>
                <input
                  id="username-input"
                  type="text"
                  className="handle-text-input"
                  placeholder="alex"
                  maxLength={30}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  autoFocus
                />
                <div className="handle-status-icon">
                  {usernameStatus === "checking" && <Loader2 className="spinner-icon" />}
                  {usernameStatus === "available" && <Check className="check-icon" />}
                  {(usernameStatus === "taken" || usernameStatus === "reserved" || usernameStatus === "invalid") && (
                    <X className="cross-icon" />
                  )}
                </div>
              </div>

              {/* Status Message */}
              {usernameFeedback && (
                <p className={`handle-feedback ${usernameStatus}`}>
                  {usernameFeedback}
                </p>
              )}

              {/* Canonical normalization hint */}
              {usernameInput.trim() && usernameInput.trim() !== usernameInput.trim().toLowerCase() && (
                <p className="normalization-hint">
                  Saved canonically as <strong>@{usernameInput.trim().toLowerCase()}</strong>
                </p>
              )}
            </div>

            <div className="onboarding-actions">
              <button
                type="button"
                className="cta-button primary"
                disabled={usernameStatus !== "available" || !authReady}
                onClick={handleCreateAccount}
              >
                <Fingerprint className="btn-icon" />
                <span>{authenticated ? "Confirm and authorize passkey" : "Sign in to continue"}</span>
              </button>

              <button
                type="button"
                className="back-text-button"
                onClick={() => setStep("welcome")}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Passkey Creating State */}
        {step === "creating" && (
          <div className="onboarding-card creating-card">
            <div className="creating-visual">
              <div className="creating-pulse-ring" aria-hidden="true" />
              <Fingerprint className="creating-fingerprint" />
            </div>

            <h2>Account setup in progress</h2>
            <p className="card-subtitle">
              Follow the passkey prompt on your device. Account setup will finish after the network confirms it.
            </p>

            <div className="creating-checklist">
              <div className="check-item in-progress">
                <Loader2 className="check-item-icon spinner" />
                <span>Waiting for account setup...</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Account Ready / Presentation Card */}
        {step === "ready" && account && (
          <div className="onboarding-card ready-card">
            <div className="ready-success-icon-wrap">
              <Check className="ready-success-icon" />
            </div>

            <h2>Your account is ready.</h2>
            <p className="card-subtitle">
              Your smart account is live on Stellar Testnet and secured by your device passkey.
            </p>

            {/* Account Card (Family-Style) */}
            <div className="account-presentation-card">
              <div className="account-card-header">
                <div className="account-avatar">
                  <span>{claimedUsername.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="account-names">
                  <strong>@{claimedUsername}</strong>
                  <span className="account-tag">Stellar Passkey Owner</span>
                </div>
                <span className="network-mini-pill">Testnet</span>
              </div>

              <div className="account-details-grid">
                <div>
                  <span className="detail-label">Security</span>
                  <span className="detail-val proof-text">
                    <ShieldCheck className="mini-icon" /> Passkey verified
                  </span>
                </div>
                <div>
                  <span className="detail-label">Balance</span>
                  <span className="detail-val">Unavailable</span>
                </div>
                <div>
                  <span className="detail-label">Primary Chain</span>
                  <span className="detail-val">Stellar (Sponsored)</span>
                </div>
                <div>
                  <span className="detail-label">Smart Account</span>
                  <a
                    className="detail-val link"
                    href={`https://stellar.expert/explorer/testnet/contract/${account.contractId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {account.contractId.slice(0, 8)}...{account.contractId.slice(-6)} ↗
                  </a>
                </div>
              </div>

              {/* Optional Base Wallet Setup Banner */}
              <div className="optional-base-box">
                <div className="optional-base-content">
                  <Wallet className="base-icon" />
                  <div>
                    <strong>Base Cross-Chain Wallet</strong>
                    <p>Link an exact Privy-verified Ethereum wallet, then switch it to Base Sepolia for Testnet USDC.</p>
                  </div>
                </div>
                {verifiedBaseWallet ? (
                  <span className="base-status-tag" aria-label="Verified Base wallet">
                    Verified {verifiedBaseWallet.slice(0, 8)}…{verifiedBaseWallet.slice(-6)}
                  </span>
                ) : wallets.length === 0 ? (
                  <button type="button" className="base-status-tag" onClick={() => connectWallet()} disabled={!walletsReady}>
                    Connect wallet
                  </button>
                ) : (
                  <div>
                    {wallets.length > 1 && (
                      <select
                        aria-label="Base wallet"
                        value={selectedBaseWallet}
                        onChange={(event) => setSelectedBaseWallet(event.target.value)}
                      >
                        <option value="">Choose wallet</option>
                        {wallets.map((wallet) => (
                          <option key={wallet.address} value={wallet.address}>
                            {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="base-status-tag"
                      onClick={() => { void verifyBaseWallet(); }}
                      disabled={baseWalletBusy || !selectedBaseWallet}
                    >
                      {baseWalletBusy ? "Verifying…" : "Verify for Base Sepolia"}
                    </button>
                  </div>
                )}
              </div>
              {baseWalletError && <div className="onboarding-error-banner" role="alert">{baseWalletError}</div>}
            </div>

            <div className="onboarding-actions">
              <Link href="/" className="cta-button primary">
                <span>Enter Telya Application</span>
                <ArrowRight className="btn-icon-right" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
