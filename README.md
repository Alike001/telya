# Telya

**Conversational money movement on Stellar.**

Telya is building a conversational USDC experience across Stellar and Base. The current public Testnet app has verified passkey smart accounts, direct Stellar USDC payments with durable receipts, and limited, revocable Agent Pass spending. The conversational journey, Base routes, bidirectional Circle CCTP, usernames, and MoneyGram ramp are still being integrated or externally verified. [Current state](product/EXECUTION-TRACKER.md)

> Team Bravo — Stellar Buildathon 2026

## How to Test

Telya is in Build Week implementation. The public main deployment supports the
direct Stellar and Agent Pass Testnet flows below. Draft PR features are not part
of this walkthrough until their live acceptance gates pass.

Local development:

Node.js 22 or newer and pnpm 11 are required.

```bash
pnpm install
pnpm env:check -- --flow=onboarding
pnpm dev
```

The preflight reports only `READY`, `MISSING`, `PLACEHOLDER` or `INVALID` beside
configuration names; it never prints credential values. Use `--flow=stellar`,
`--flow=base` or `--flow=full` when validating those paths.

Open `http://localhost:3000`. The readiness endpoint is available at
`http://localhost:3000/api/health`; it returns HTTP `200` only when the app can
reach Neon and HTTP `503` with a sanitized `degraded` response otherwise.

Stellar passkey account flow:

1. Configure the public Stellar Testnet values from `.env.example` and keep
   `STELLAR_FEE_SPONSOR_SECRET` server-only. Never use a `NEXT_PUBLIC_*` name for
   the sponsor secret.
2. Apply the database migrations with the direct Neon connection so relayer
   reservations and rate limits fail closed: `pnpm db:migrate`.
3. Open the passkey account panel on `http://localhost:3000` (localhost is a
   valid WebAuthn secure context), enter a passkey label, and create the account.
4. Verify that the resulting contract and deployment transaction links open on
   Stellar Expert Testnet.
5. Refresh the page and verify the same contract restores silently.
6. Sign out on this browser, choose **Reconnect existing account**, complete the
   passkey prompt, and verify the same contract reconnects.
7. Fund the smart-account contract with Circle Testnet USDC, enter a distinct
   Stellar Testnet recipient and amount, then choose **Authorize and send**.
8. Approve the exact transfer with the account passkey. Verify the receipt shows
   `completed` only after Stellar finality and exact recipient/amount matching.
9. Refresh the page and verify the last receipt and its event timeline restore.

Agent Pass flow (direct Stellar USDC only):

1. Keep the passkey account connected and funded with Testnet USDC.
2. Enter a cumulative allowance and choose **Create Agent Pass**. Approve the
   owner prompt and verify the creation transaction on Stellar Expert.
3. Enter a recipient and an amount below the allowance, then choose **Send as
   agent**. Verify the receipt is completed under the displayed context rule
   and the on-chain cumulative spend increases.
4. Attempt another agent payment whose cumulative total exceeds the allowance.
   Verify Smart Account Kit reports the genuine on-chain spending-limit
   rejection and no successful transfer is claimed.
5. Choose **Revoke with passkey**, approve the owner prompt, and verify the
   revocation transaction.
6. Choose **Prove agent is blocked** and verify the revoked agent is rejected.
7. Use the owner **Authorize and send** control above to verify the passkey
   owner can still pay after agent revocation.

The demo agent key is generated in the browser and retained only in memory for
the current page. It is never sent to the AI, database, relayer, or browser
storage. The database stores public rule metadata, cumulative verified spend,
and transaction references; the Stellar context rule and spending-limit policy
remain the authorization source of truth.

The UI reports deployment as connected only after the relayer returns a real
transaction hash and Smart Account Kit verifies the confirmed deployment. A
relayer, network, or on-chain failure remains visible as a failure and is never
presented as account creation success.

Direct Stellar payments use the configured `STELLAR_USDC_SAC` only. Smart
Account Kit signs the exact token invocation with the user's passkey; the
server relayer allowlists and revalidates its token, sender, recipient, amount,
and authorization before paying the network fee. Durable events record
authorization, submission, destination finality, recipient verification, and
completion. `GET /api/stellar/transfers/<transaction-hash>` returns the
consumer-safe receipt used for refresh recovery. It never returns passkey data,
the sponsor key, database credentials, or internal diagnostics.

Agent Pass administration is also narrowly allowlisted by the relayer: only an
owner-passkey-authorized `CallContract` rule for the configured USDC contract,
one configured Ed25519 verifier signer, one configured spending-limit policy,
and owner-authorized removal of a recorded Agent Pass rule are sponsored.

Stellar CCTP integration checks:

1. Apply migrations `0006_stellar_cctp.sql` and
   `0007_stellar_cctp_recovery.sql`, then confirm
   `GET /api/stellar/cctp/config` returns the configured Stellar Testnet CCTP
   domains and public contract addresses without any secret.
2. For Stellar → Base, use the trusted fee quote to pass the source burn amount
   (recipient amount plus Circle fee) and maximum fee to
   `submitStellarCctpBurn`. Verify the passkey signs an exact Standard-finality
   `deposit_for_burn` and `reconcileStellarCctpSource` records only
   `source_confirmed`.
3. Let the Issue #16 coordinator fetch the Circle message and attestation from
   that source hash, mint on Base, then verify the final Base recipient and
   amount before completion.
4. For Base → Stellar, pass the confirmed Base source hash and Circle's message
   and attestation to `settleBaseToStellarCctp`. Verify the durable timeline
   reaches `destination_submitted`, `destination_confirmed`,
   `recipient_verified`, then `completed`.
5. Repeat the same destination call and verify it reuses/reconciles the stored
   signed envelope and transaction hash rather than creating another mint.
   Let a submission lease expire before and after envelope persistence to prove
   crash recovery. Change the message, attestation, recipient, or amount and
   verify the operation fails closed.

Do not check off the cross-chain acceptance tests until both directions have
real Base Sepolia, Circle sandbox, and Stellar Testnet transaction evidence.

Runtime behavior:

- local and preview environments use Testnet configuration;
- the production branch is `main` and deploys to the existing Vercel project;
- `NEXT_PUBLIC_*` values are browser-safe and build-time inlined;
- `DATABASE_URL` and all sponsor/provider secrets remain server-only;
- the health endpoint never returns connection strings or provider errors.

Public Testnet deployment: [telya.vercel.app](https://telya.vercel.app)

Production readiness is available at
[telya.vercel.app/api/health](https://telya.vercel.app/api/health). The exact
judge walkthrough will be added after the end-to-end Testnet payment flow is
verified.

Planned test environment:
- Stellar Testnet
- Base Sepolia
- Circle CCTP test configuration
- MoneyGram sandbox, pending partner access and contract-wallet compatibility confirmation

The final judge flow will include:
1. Open the public Testnet app.
2. Use a prepared Testnet profile/contact.
3. Send USDC on a same-chain or cross-chain route.
4. Watch real payment-state transitions.
5. Open the final receipt and transaction references.
6. Try Agent Pass spending and limit/revocation behavior.

## Problem

A simple stablecoin payment should not require users to understand wallets, networks, gas tokens, bridges, and settlement mechanics.

AI agents also need safer wallet permissions than unrestricted access.

## Planned P0 experience

- Conversational text and voice payment intent (draft integration).
- Stellar passkey smart account, direct sponsored Stellar USDC and durable receipts (verified on Testnet).
- Base USDC and bidirectional Base ↔ Stellar USDC through Circle CCTP Standard (draft; final settlement evidence pending).
- Visible payment movement, history and receipts across supported routes (draft integration).
- Unique human-readable usernames tied to verified wallet records (draft; live claim proof pending).
- Agent Pass: limited, expiring, revocable Stellar agent spending (verified on Testnet).
- MoneyGram sandbox cash-in/cash-out (pending provider access and contract-wallet compatibility).

## Required payment routes

| Source | Destination | Rail |
|---|---|---|
| Stellar | Stellar | Direct Stellar USDC |
| Base | Base | Direct Base USDC |
| Base | Stellar | Circle CCTP Standard |
| Stellar | Base | Circle CCTP Standard |

## Trust rule

Telya never marks a cross-chain payment complete because the source transaction succeeded.

Completion requires destination finality plus recipient and amount verification.

## Documentation

If you are a developer or AI agent joining the project, start here:

- [Current project status](product/STATUS.md)
- [Codex master playbook](product/CODEX-MASTER-PLAYBOOK.md)
- [Live execution tracker](product/EXECUTION-TRACKER.md)
- [Buildathon execution plan](product/BUILDATHON-EXECUTION-PLAN.md)
- [Judging and grant readiness baseline](product/JUDGING-AND-GRANT-READINESS.md)
- [Universal agent handoff](handoffs/AGENT-HANDOFF.md)
- [Product requirements](product/PRD.md)
- [Architecture](product/ARCHITECTURE.md)
- [Build plan](product/BUILD-PLAN.md)
- [Acceptance tests](product/ACCEPTANCE-TESTS.md)
- [Team responsibilities](product/TEAM.md)
- [Decision log](product/DECISIONS.md)
- [Roadmap](product/ROADMAP.md)
- [Database setup and migrations](db/README.md)
- [Agent operating rules](AGENTS.md)

## Development status

Build Week implementation is active. Codex continues from the persistent [Master Playbook](product/CODEX-MASTER-PLAYBOOK.md), [Execution Tracker](product/EXECUTION-TRACKER.md) and [Current Project Status](product/STATUS.md). These documents record task order, PR dependencies, acceptance gates and external blockers across sessions.

Only real Stellar Testnet / Base Sepolia / approved provider data may drive financial UI states. Mock fixtures are for tests only and must never appear as real balances, quotes, wallet connections, or successful payments.
