"use client";

import { useEffect, useRef, useState } from "react";
import {
  createEd25519Signer,
  type SmartAccountKit,
} from "smart-account-kit";

import {
  createStellarAgentPass,
  getAgentPassSpending,
  revokeStellarAgentPass,
  submitAgentPassTransfer,
  type ActiveAgentPass,
} from "../stellar/agent-pass";
import {
  connectSmartAccount,
  createBrowserSmartAccountKit,
  createSmartAccount,
  disconnectSmartAccount,
  restoreSmartAccount,
  type ConnectedSmartAccount,
  type SmartAccountPublicConfig,
} from "../stellar/smart-account";
import {
  stellarUsdcAmountFromRawUnits,
  submitStellarUsdcTransfer,
} from "../stellar/usdc";

type WalletPhase =
  | "loading"
  | "disconnected"
  | "creating"
  | "connecting"
  | "connected"
  | "error";

type PaymentPhase =
  | "idle"
  | "authorizing"
  | "verifying"
  | "completed"
  | "error";

type AgentPassPhase =
  | "idle"
  | "creating"
  | "active"
  | "spending"
  | "revoking"
  | "revoked"
  | "error";

type DirectPaymentReceipt = {
  readonly status: "pending" | "completed" | "failed";
  readonly transactionHash: string;
  readonly ledger: number | null;
  readonly sender: string;
  readonly recipient: string;
  readonly expectedAmount: string;
  readonly verifiedRecipient: string | null;
  readonly verifiedAmount: string | null;
  readonly verifiedAt: string | null;
  readonly explorerUrl: string;
  readonly authorizationKind?: "owner" | "agent";
  readonly contextRuleId?: number;
  readonly events: readonly {
    readonly stage: string;
    readonly status: string;
    readonly publicMessage: string;
  }[];
};

type StoredAgentPass = {
  readonly smartAccount: string;
  readonly ruleId: number;
  readonly agentAddress: string;
  readonly agentPublicKey: string;
  readonly spendingLimit: string;
  readonly spendingLimitAtomic: string;
  readonly spentAmount: string;
  readonly validUntilLedger: number;
  readonly status: "active" | "revoked";
  readonly createTransactionHash: string;
  readonly revokeTransactionHash: string | null;
};

function hexBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid Agent Pass public key");
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The Stellar account action did not complete.";
}

export function StellarWalletPanel() {
  const kitRef = useRef<SmartAccountKit | null>(null);
  const configRef = useRef<SmartAccountPublicConfig | null>(null);
  const [phase, setPhase] = useState<WalletPhase>("loading");
  const [account, setAccount] = useState<ConnectedSmartAccount | null>(null);
  const [username, setUsername] = useState("");
  const [notice, setNotice] = useState("Checking this browser for a saved passkey session…");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const [paymentNotice, setPaymentNotice] = useState(
    "Enter a Stellar recipient and exact USDC amount. The sponsor pays the network fee, not the payment amount.",
  );
  const [receipt, setReceipt] = useState<DirectPaymentReceipt | null>(null);
  const [lastTransactionHash, setLastTransactionHash] = useState<string | null>(null);
  const [agentPassPhase, setAgentPassPhase] = useState<AgentPassPhase>("idle");
  const [agentPass, setAgentPass] = useState<ActiveAgentPass | null>(null);
  const [agentPassLimit, setAgentPassLimit] = useState("1");
  const [agentSpent, setAgentSpent] = useState("0");
  const [agentRecipient, setAgentRecipient] = useState("");
  const [agentAmount, setAgentAmount] = useState("");
  const [agentNotice, setAgentNotice] = useState(
    "Create a one-hour, USDC-only allowance. The test agent key stays only in this page's memory.",
  );
  const [agentTransactionHash, setAgentTransactionHash] = useState<string | null>(null);
  const [revokeTransactionHash, setRevokeTransactionHash] = useState<string | null>(null);

  async function fetchReceipt(txHash: string): Promise<DirectPaymentReceipt> {
    const response = await fetch(`/api/stellar/transfers/${txHash}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("The payment receipt is temporarily unavailable.");
    return (await response.json()) as DirectPaymentReceipt;
  }

  async function restoreAgentPass(
    connected: ConnectedSmartAccount,
    kit: SmartAccountKit,
    config: SmartAccountPublicConfig,
  ): Promise<void> {
    const response = await fetch(
      `/api/stellar/agent-passes/${connected.contractId}`,
      { cache: "no-store" },
    );
    if (response.status === 404) return;
    if (!response.ok) throw new Error("Agent Pass state is temporarily unavailable.");
    const stored = (await response.json()) as StoredAgentPass;
    const signer = createEd25519Signer(
      config.ed25519VerifierAddress,
      hexBytes(stored.agentPublicKey),
    );
    setAgentPass({
      smartAccount: stored.smartAccount,
      ruleId: stored.ruleId,
      agentAddress: stored.agentAddress,
      agentPublicKey: stored.agentPublicKey,
      spendingLimit: stored.spendingLimit,
      spendingLimitAtomic: BigInt(stored.spendingLimitAtomic),
      validUntilLedger: stored.validUntilLedger,
      createTransactionHash: stored.createTransactionHash,
      signer,
    });
    setAgentSpent(stored.spentAmount);
    setAgentTransactionHash(stored.createTransactionHash);
    setRevokeTransactionHash(stored.revokeTransactionHash);
    setAgentPassPhase(stored.status);
    setAgentNotice(
      stored.status === "active"
        ? "Restored the active on-chain Agent Pass. Its private agent key is not stored here; the owner can still revoke it."
        : "Restored the revoked Agent Pass and its public transaction evidence.",
    );
  }

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const response = await fetch("/api/stellar/config", { cache: "no-store" });
        if (!response.ok) throw new Error("Stellar account setup is temporarily unavailable.");
        const config = (await response.json()) as SmartAccountPublicConfig;
        configRef.current = config;
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
        if (restored) {
          try {
            await restoreAgentPass(restored, kit, config);
          } catch (error) {
            if (!active) return;
            setAgentNotice(messageFor(error));
          }
          const lastHash = window.localStorage.getItem(
            `telya:stellar-payment:${restored.contractId}`,
          );
          if (lastHash) {
            setLastTransactionHash(lastHash);
            try {
              const savedReceipt = await fetchReceipt(lastHash);
              if (!active) return;
              setReceipt(savedReceipt);
              setPaymentPhase(
                savedReceipt.status === "completed" ? "completed" : "error",
              );
              setPaymentNotice(
                savedReceipt.status === "completed"
                  ? "Restored the last verified payment receipt after refresh."
                  : "The restored payment is not verified as complete.",
              );
            } catch {
              if (!active) return;
              setPaymentPhase("error");
              setPaymentNotice(
                "The last transaction is known, but its durable verification receipt is temporarily unavailable. Check the Testnet transaction before retrying.",
              );
            }
          }
        }
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
      setReceipt(null);
      setLastTransactionHash(null);
      setPaymentPhase("idle");
      setPhase("disconnected");
      setNotice(
        "Signed out on this browser. Your passkey and on-chain account remain yours and can be reconnected.",
      );
    } catch (error) {
      setPhase("error");
      setNotice(messageFor(error));
    }
  }

  async function sendUsdc() {
    const kit = kitRef.current;
    const config = configRef.current;
    if (!kit || !config || !account) return;
    setReceipt(null);
    setPaymentPhase("authorizing");
    setPaymentNotice(
      "Review the device prompt: your passkey is authorizing this recipient and amount. Telya cannot sign for you.",
    );
    try {
      const submission = await submitStellarUsdcTransfer({
        kit,
        tokenContract: config.usdcContract,
        recipient,
        amount,
      });
      if (submission.status === "failed") {
        if (submission.txHash) {
          window.localStorage.setItem(
            `telya:stellar-payment:${account.contractId}`,
            submission.txHash,
          );
          setLastTransactionHash(submission.txHash);
        }
        throw new Error(submission.message);
      }
      setPaymentPhase("verifying");
      setPaymentNotice(
        "Stellar accepted the transaction. Verifying finality, recipient, and exact amount…",
      );
      window.localStorage.setItem(
        `telya:stellar-payment:${account.contractId}`,
        submission.txHash,
      );
      setLastTransactionHash(submission.txHash);
      const paymentReceipt = await fetchReceipt(submission.txHash);
      setReceipt(paymentReceipt);
      if (paymentReceipt.status !== "completed") {
        throw new Error(
          "The payment is not verified as complete. Check the recorded stage before retrying.",
        );
      }
      setPaymentPhase("completed");
      setPaymentNotice(
        `Completed: ${paymentReceipt.verifiedAmount} USDC reached the verified recipient on Stellar Testnet.`,
      );
    } catch (error) {
      setPaymentPhase("error");
      setPaymentNotice(messageFor(error));
    }
  }

  async function refreshAgentSpending(pass: ActiveAgentPass): Promise<void> {
    const kit = kitRef.current;
    const config = configRef.current;
    if (!kit || !config) return;
    const spending = await getAgentPassSpending({
      kit,
      spendingLimitPolicyAddress: config.spendingLimitPolicyAddress,
      ruleId: pass.ruleId,
    });
    setAgentSpent(stellarUsdcAmountFromRawUnits(spending.spentAtomic));
  }

  async function createAgentPass() {
    const kit = kitRef.current;
    const config = configRef.current;
    if (!kit || !config || !account) return;
    setAgentPassPhase("creating");
    setAgentNotice(
      "Waiting for your passkey to authorize a USDC-only rule, cumulative limit, and expiry…",
    );
    try {
      const created = await createStellarAgentPass({
        kit,
        tokenContract: config.usdcContract,
        ed25519VerifierAddress: config.ed25519VerifierAddress,
        spendingLimitPolicyAddress: config.spendingLimitPolicyAddress,
        spendingLimit: agentPassLimit,
      });
      setAgentPass(created);
      setAgentSpent("0");
      setAgentTransactionHash(created.createTransactionHash);
      setRevokeTransactionHash(null);
      setAgentPassPhase("active");
      setAgentNotice(
        `Active on Stellar: the agent may spend up to ${created.spendingLimit} USDC cumulatively before ledger ${created.validUntilLedger}.`,
      );
    } catch (error) {
      setAgentPassPhase("error");
      setAgentNotice(messageFor(error));
    }
  }

  async function sendWithAgentPass() {
    const kit = kitRef.current;
    const config = configRef.current;
    if (!kit || !config || !agentPass) return;
    const wasRevoked = agentPassPhase === "revoked";
    setAgentPassPhase("spending");
    setAgentNotice(
      wasRevoked
        ? "Testing the revoked agent on Stellar. This must fail before sponsorship."
        : "The agent is authorizing this exact direct Stellar USDC transfer within its bounded rule…",
    );
    try {
      const result = await submitAgentPassTransfer({
        kit,
        pass: agentPass,
        tokenContract: config.usdcContract,
        recipient: agentRecipient,
        amount: agentAmount,
      });
      if (!result.success) throw result.error;
      if (wasRevoked) {
        throw new Error(
          "Safety failure: the revoked Agent Pass unexpectedly submitted a transaction.",
        );
      }
      setAgentTransactionHash(result.hash);
      const paymentReceipt = await fetchReceipt(result.hash);
      if (
        paymentReceipt.status !== "completed" ||
        paymentReceipt.authorizationKind !== "agent" ||
        paymentReceipt.contextRuleId !== agentPass.ruleId
      ) {
        throw new Error(
          "The agent transfer is not verified as completed under this Agent Pass.",
        );
      }
      await refreshAgentSpending(agentPass);
      setAgentPassPhase("active");
      setAgentNotice(
        `Agent payment completed and verified. Cumulative spending is ${paymentReceipt.verifiedAmount} USDC plus any earlier Agent Pass payments.`,
      );
    } catch (error) {
      setAgentPassPhase(wasRevoked ? "revoked" : "active");
      setAgentNotice(
        wasRevoked
          ? `Rejected after revocation: ${messageFor(error)}`
          : `Agent payment rejected: ${messageFor(error)}`,
      );
      if (!wasRevoked) {
        try {
          await refreshAgentSpending(agentPass);
        } catch {
          // Keep the genuine transaction failure visible even if the readback fails.
        }
      }
    }
  }

  async function revokeAgentPass() {
    const kit = kitRef.current;
    if (!kit || !agentPass) return;
    setAgentPassPhase("revoking");
    setAgentNotice("Waiting for your passkey to remove the Agent Pass rule on Stellar…");
    try {
      const revoked = await revokeStellarAgentPass({ kit, pass: agentPass });
      setRevokeTransactionHash(revoked.transactionHash);
      setAgentPassPhase("revoked");
      setAgentNotice(
        "Revoked on Stellar. The agent can no longer spend; the owner passkey payment controls above remain available.",
      );
    } catch (error) {
      setAgentPassPhase("active");
      setAgentNotice(messageFor(error));
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

        {account ? (
          <div className="direct-payment" aria-live="polite">
            <div className="direct-payment-heading">
              <div>
                <span className="card-kicker">Direct Stellar payment</span>
                <strong>Send Testnet USDC</strong>
              </div>
              <span className={`wallet-state wallet-state-${paymentPhase}`}>
                {paymentPhase === "completed"
                  ? "Recipient verified"
                  : paymentPhase === "error"
                    ? "Needs attention"
                    : paymentPhase === "idle"
                      ? "Not submitted"
                      : "In progress"}
              </span>
            </div>
            <label className="wallet-username">
              <span>Stellar recipient</span>
              <input
                autoComplete="off"
                disabled={paymentPhase === "authorizing" || paymentPhase === "verifying"}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="G… or C…"
                value={recipient}
              />
            </label>
            <label className="wallet-username">
              <span>Recipient gets</span>
              <div className="amount-input">
                <input
                  autoComplete="off"
                  disabled={paymentPhase === "authorizing" || paymentPhase === "verifying"}
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="5"
                  value={amount}
                />
                <span>USDC</span>
              </div>
            </label>
            <p className="wallet-notice">{paymentNotice}</p>
            <button
              className="primary-action wallet-button"
              disabled={
                paymentPhase === "authorizing" ||
                paymentPhase === "verifying" ||
                !recipient.trim() ||
                !amount.trim()
              }
              onClick={() => void sendUsdc()}
              type="button"
            >
              {paymentPhase === "authorizing"
                ? "Waiting for passkey…"
                : paymentPhase === "verifying"
                  ? "Verifying recipient…"
                  : "Authorize and send"}
            </button>

            {receipt ? (
              <div className="payment-receipt">
                <strong>Where is the money?</strong>
                <dl>
                  <div><dt>Status</dt><dd>{receipt.status}</dd></div>
                  <div><dt>Expected</dt><dd>{receipt.expectedAmount} USDC</dd></div>
                  <div><dt>Verified</dt><dd>{receipt.verifiedAmount ?? "Not verified"} USDC</dd></div>
                  <div><dt>Recipient</dt><dd>{receipt.verifiedRecipient ?? receipt.recipient}</dd></div>
                </dl>
                <ol className="payment-timeline">
                  {receipt.events.map((event) => (
                    <li key={`${event.stage}-${event.status}`}>
                      <span>{event.status.replaceAll("_", " ")}</span>
                      <p>{event.publicMessage}</p>
                    </li>
                  ))}
                </ol>
                <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                  View verified transaction ↗
                </a>
              </div>
            ) : null}
            {!receipt && lastTransactionHash ? (
              <a
                className="wallet-evidence-link"
                href={`https://stellar.expert/explorer/testnet/tx/${lastTransactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Inspect the last submitted transaction ↗
              </a>
            ) : null}
          </div>
        ) : null}

        {account ? (
          <div className="direct-payment agent-pass" aria-live="polite">
            <div className="direct-payment-heading">
              <div>
                <span className="card-kicker">Bounded agent authority</span>
                <strong>Agent Pass · Stellar USDC only</strong>
              </div>
              <span className={`wallet-state wallet-state-${agentPassPhase}`}>
                {agentPassPhase === "active"
                  ? "Active"
                  : agentPassPhase === "revoked"
                    ? "Revoked"
                    : agentPassPhase === "idle"
                      ? "Not created"
                      : agentPassPhase === "error"
                        ? "Needs attention"
                        : "In progress"}
              </span>
            </div>

            {!agentPass ? (
              <>
                <label className="wallet-username">
                  <span>Cumulative allowance</span>
                  <div className="amount-input">
                    <input
                      autoComplete="off"
                      disabled={agentPassPhase === "creating"}
                      inputMode="decimal"
                      onChange={(event) => setAgentPassLimit(event.target.value)}
                      value={agentPassLimit}
                    />
                    <span>USDC</span>
                  </div>
                </label>
                <p className="agent-pass-scope">
                  Direct Stellar USDC · expires after about one hour · revocable by owner
                </p>
                <button
                  className="primary-action wallet-button"
                  disabled={agentPassPhase === "creating" || !agentPassLimit.trim()}
                  onClick={() => void createAgentPass()}
                  type="button"
                >
                  {agentPassPhase === "creating" ? "Waiting for passkey…" : "Create Agent Pass"}
                </button>
              </>
            ) : (
              <>
                <dl className="agent-pass-details">
                  <div><dt>Agent</dt><dd>{agentPass.agentAddress}</dd></div>
                  <div><dt>Rule</dt><dd>#{agentPass.ruleId} · USDC contract only</dd></div>
                  <div><dt>Spent</dt><dd>{agentSpent} / {agentPass.spendingLimit} USDC</dd></div>
                  <div><dt>Expires</dt><dd>Ledger {agentPass.validUntilLedger}</dd></div>
                </dl>
                <label className="wallet-username">
                  <span>Agent payment recipient</span>
                  <input
                    autoComplete="off"
                    disabled={agentPassPhase === "spending" || agentPassPhase === "revoking"}
                    onChange={(event) => setAgentRecipient(event.target.value)}
                    placeholder="G… or C…"
                    value={agentRecipient}
                  />
                </label>
                <label className="wallet-username">
                  <span>Agent sends</span>
                  <div className="amount-input">
                    <input
                      autoComplete="off"
                      disabled={agentPassPhase === "spending" || agentPassPhase === "revoking"}
                      inputMode="decimal"
                      onChange={(event) => setAgentAmount(event.target.value)}
                      placeholder="0.25"
                      value={agentAmount}
                    />
                    <span>USDC</span>
                  </div>
                </label>
                <div className="wallet-actions">
                  <button
                    className="primary-action wallet-button"
                    disabled={
                      agentPassPhase === "spending" ||
                      agentPassPhase === "revoking" ||
                      !agentRecipient.trim() ||
                      !agentAmount.trim()
                    }
                    onClick={() => void sendWithAgentPass()}
                    type="button"
                  >
                    {agentPassPhase === "spending"
                      ? "Checking allowance…"
                      : agentPassPhase === "revoked"
                        ? "Prove agent is blocked"
                        : "Send as agent"}
                  </button>
                  {agentPassPhase !== "revoked" ? (
                    <button
                      className="secondary-action"
                      disabled={agentPassPhase === "spending" || agentPassPhase === "revoking"}
                      onClick={() => void revokeAgentPass()}
                      type="button"
                    >
                      {agentPassPhase === "revoking" ? "Waiting for owner…" : "Revoke with passkey"}
                    </button>
                  ) : null}
                </div>
              </>
            )}
            <p className="wallet-notice">{agentNotice}</p>
            <div className="agent-pass-evidence">
              {agentTransactionHash ? (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${agentTransactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View latest Agent Pass transaction ↗
                </a>
              ) : null}
              {revokeTransactionHash ? (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${revokeTransactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View revocation transaction ↗
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
