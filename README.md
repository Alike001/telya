# Telya

**Conversational money movement on Stellar.**

Telya lets people speak or type what they want to do with USDC, then safely routes payments across Stellar and Base, exposes real transaction progress until finality, supports fiat ramp flows, and enables limited, revocable AI-agent spending through Stellar smart accounts.

> Team Bravo — Stellar Buildathon 2026

## How to Test

Telya is now in Build Week implementation. The public shell is intentionally
honest about its current state: it shows the frozen Testnet route matrix and a
route preview, but never displays a fake completed transaction.

Local development:

Node.js 20.9 or newer and pnpm 11 are required.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The readiness endpoint is available at
`http://localhost:3000/api/health`; it returns HTTP `200` only when the app can
reach Neon and HTTP `503` with a sanitized `degraded` response otherwise.

Runtime behavior:

- local and preview environments use Testnet configuration;
- the production branch is `main` and deploys to the existing Vercel project;
- `NEXT_PUBLIC_*` values are browser-safe and build-time inlined;
- `DATABASE_URL` and all sponsor/provider secrets remain server-only;
- the health endpoint never returns connection strings or provider errors.

The exact public Testnet URL and judge walkthrough will be added after the first
successful production deployment is verified.

Planned test environment:
- Stellar Testnet
- Base Sepolia
- Circle CCTP test configuration
- MoneyGram sandbox

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

## What Telya does

- Conversational text and voice payment intent.
- Stellar passkey smart account.
- Stellar USDC payments with fee sponsorship.
- Base USDC payments.
- Bidirectional Base <-> Stellar USDC through Circle CCTP Standard.
- Visible money movement and finality.
- Persistent history and receipts.
- Unique human-readable usernames mapped to verified wallet records.
- Agent Pass: limited, expiring, revocable Stellar agent spending.
- MoneyGram sandbox cash-in/cash-out integration.

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

Foundation planning is complete and stored in the repository so all three contributors and their coding agents work from the same source of truth.

Build Week begins November 25, 2026. Until then, keep work to preparation, accounts, documentation, deployment plumbing, and Testnet setup unless organizers explicitly permit earlier substantive feature implementation.

Feature implementation begins from the shared contracts and acceptance criteria defined in this repository.
