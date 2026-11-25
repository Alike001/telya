# Telya

**Conversational money movement on Stellar.**

Telya lets people speak or type what they want to do with USDC, then safely routes payments across Stellar and Base, exposes real transaction progress until finality, supports fiat ramp flows, and enables limited, revocable AI-agent spending through Stellar smart accounts.

> Team Bravo — Stellar Buildathon 2026

## How to Test

Telya is currently in pre-Build-Week foundation setup.

The public Testnet deployment and exact judge walkthrough will be added here as soon as the first deployable shell is live.

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
