# Telya Universal Agent Handoff

Use this file when continuing Telya from a new AI agent or a new chat.

## First read

Read these files before changing code:
1. `AGENTS.md`
2. `product/STATUS.md`
3. `product/PRD.md`
4. `product/ARCHITECTURE.md`
5. `product/BUILD-PLAN.md`
6. `product/TEAM.md`
7. `product/ACCEPTANCE-TESTS.md`
8. Your role-specific handoff in `handoffs/`

## Product in one sentence

Telya is a conversational money application where users speak or type what they want to do with USDC, while deterministic software routes and verifies payments across Stellar and Base, exposes real money movement/finality, supports fiat ramp flows, and enables limited, revocable AI-agent spending through Stellar smart accounts.

## P0 route matrix

- Stellar -> Stellar
- Base -> Base
- Base -> Stellar via Circle CCTP Standard
- Stellar -> Base via Circle CCTP Standard

## Core security boundaries

- AI parses intent only.
- AI never signs.
- AI never sees private keys.
- Ambiguous payment routes require clarification.
- Cross-chain completion requires destination finality + recipient/amount verification.
- Irreversible operations require idempotency.
- Secrets are server-only.
- Testnet success states must be real, not mocked.

## Consumer principle

At every stage, the user should be able to answer:

**Where is my money right now?**

The UI must expose real states such as approved, source confirmed, waiting for attestation, destination submitted, finality confirmed, recipient verified, completed, or failed.

## Username model

A username such as `@alice` is a human-readable application identity, not an on-chain wallet address.

It resolves to verified wallet records such as:
- Stellar smart-account address,
- optional Base address,
- preferred receive network.

Usernames are globally unique and case-insensitive.

## Agent Pass

The validated Stellar Testnet spike proved:
- a delegated agent can spend within allowance,
- cumulative spend above allowance is rejected,
- the owner can revoke,
- the agent cannot spend after revocation,
- the owner retains control.

P0 Agent Pass is direct Stellar USDC only.

## Team ownership

- @Alike001: Stellar, Agent Pass, settlement verification, integration/deployment.
- @Prudentdev-xyz: frontend/product/design.
- @Webghost01-NG: backend/AI/Base/Circle/MoneyGram.

Do not reassign major areas without explicit team agreement.

## Current timing

Build Week begins November 25, 2026.

Before then, restrict work to preparation unless official rules explicitly allow substantive feature implementation.

## Resume rule

Before doing work:
- inspect open GitHub issues,
- choose only issues assigned to your role,
- create a focused branch,
- link the issue in the PR,
- include how-to-test evidence,
- do not expand P0.
