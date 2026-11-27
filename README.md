# Telya

**Conversational money movement on Stellar.**

Telya is building a conversational USDC experience across Stellar and Base. The current public Testnet app has verified passkey smart accounts, direct Stellar USDC payments with durable receipts, and limited, revocable Agent Pass spending. The conversational journey, Base routes, bidirectional Circle CCTP, usernames, and MoneyGram ramp are still being integrated or externally verified. [Current state](product/EXECUTION-TRACKER.md)

> Team Bravo — Stellar Buildathon 2026

## How to Test

Telya is in Build Week implementation. The public `main` deployment retains the
previously accepted direct Stellar and Agent Pass Testnet evidence. The integrated
branch walkthrough below remains a draft until its own browser acceptance gates pass.

Local development:

Node.js 22 or newer and pnpm 11 are required.

```bash
pnpm install
pnpm env:check -- --flow=onboarding
pnpm dev
```

The preflight reports only `READY`, `MISSING`, `PLACEHOLDER` or `INVALID` beside
configuration names; it never prints credential values. Use `--flow=stellar`,
`--flow=base`, `--flow=cctp` or `--flow=full` when validating those paths. The
CCTP/full checks require the exact Testnet domains, valid Stellar contract
addresses and credential-free HTTPS RPC endpoints; they do not treat a malformed
or Mainnet configuration as ready.

Open `http://localhost:3000`. The readiness endpoint is available at
`http://localhost:3000/api/health`; it returns HTTP `200` only when the app can
reach Neon and HTTP `503` with a sanitized `degraded` response otherwise.

Integrated passkey/onboarding flow:

1. Configure the public Stellar Testnet values from `.env.example` and keep
   `STELLAR_FEE_SPONSOR_SECRET` server-only. Never use a `NEXT_PUBLIC_*` name for
   the sponsor secret.
2. Apply all migrations through `0012_stellar_deployment_execution_sessions.sql`
   with the direct Neon connection: `pnpm db:migrate`.
3. Open `http://localhost:3000/onboarding`, sign in through Privy and choose an
   available username. The database remains authoritative for availability.
4. Create the passkey account. Before Smart Account Kit submits, the browser
   obtains a one-use authenticated deployment handoff stored only in a
   path-scoped HttpOnly cookie. The generic relayer rejects deployment and
   payment execution.
5. Complete the second passkey assertion that binds the confirmed on-chain
   account to the authenticated user, then verify the atomic username claim.
6. Refresh and reconnect. The same authenticated user, username and `C...`
   account must restore; cancelling a passkey prompt must not claim connection.
7. On the home composer, resolve a verified recipient, review real balances,
   route and fees, then authorize a small direct Stellar Testnet payment.
8. Verify the protected payment relayer consumes its one-use handoff before
   sponsorship. The receipt may show `completed` only after finality plus exact
   recipient and amount verification.
9. Refresh while pending and after completion. The same Payment and receipt must
   restore without another signature or transfer.

Integrated Agent Pass management:

1. Keep the authenticated passkey account restored and open Agent Pass.
2. Create a cumulative USDC allowance and expiry. The owner-authenticated,
   one-use administration handoff must be consumed before sponsorship.
3. Confirm status uses the current Stellar ledger and the exact verified owner
   account. Before refreshing the page, create a verified direct-Stellar payment
   review in the pass panel and inspect the exact recipient, amount, route and
   fees before running it with the memory-only agent key.
4. Verify the delegated payment uses the same one-use authenticated Payment
   handoff, finality checks and durable receipt as an owner-authorized payment.
   Refreshing discards the agent private key by design. Revoke with the owner
   passkey when finished.
5. The prior accepted on-chain allowed-spend, overspend-rejection and
   post-revocation evidence remains documented on `main`. This draft integrated
   flow still requires a live Privy/browser/Testnet acceptance run before it can
   be claimed as complete.

The UI reports deployment as connected only after the relayer returns a real
transaction hash and Smart Account Kit verifies the confirmed deployment. A
relayer, network, or on-chain failure remains visible as a failure and is never
presented as account creation success.

Direct Stellar payments use the configured `STELLAR_USDC_SAC` only. Smart
Account Kit signs the exact token invocation with the user's passkey; the
protected payment relayer requires an authenticated, one-use Payment handoff
and revalidates its token, sender, recipient, amount and authorization before
paying the network fee. Durable events record
authorization, submission, destination finality, recipient verification, and
completion. `GET /api/stellar/transfers/<transaction-hash>` returns the
consumer-safe receipt used for refresh recovery. It never returns passkey data,
the sponsor key, database credentials, or internal diagnostics.

Agent Pass administration is also narrowly allowlisted by the protected payment
relayer: only an owner-passkey-authorized `CallContract` rule for the configured
USDC contract, one configured Ed25519 verifier signer, one configured
spending-limit policy, and owner-authorized removal of a recorded Agent Pass
rule are sponsored. Administration and delegated payments rotate mutually
exclusive, path-scoped HttpOnly authorization cookies. Delegated payments must
match an authenticated persisted Payment and the owner's active recorded rule;
verified spend events are idempotent by transaction hash.

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
