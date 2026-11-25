# Telya Universal Agent Handoff

Use this file when continuing Telya from a new AI agent or a new chat.

## First read

Read these files before changing code:
1. `AGENTS.md`
2. `product/STATUS.md`
3. `product/JUDGING-AND-GRANT-READINESS.md`
4. `product/PRD.md`
5. `product/ARCHITECTURE.md`
6. `product/BUILD-PLAN.md`
7. `product/TEAM.md`
8. `product/ACCEPTANCE-TESTS.md`
9. `product/SETLORA-LESSONS.md`
10. `product/BUILD-WEEK-DAY1.md`
11. Your role-specific handoff in `handoffs/`

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

## Current implementation boundary

Build Week is active. The evidence/status baseline is `product/JUDGING-AND-GRANT-READINESS.md`.

- Smart-account lifecycle, direct Stellar USDC, and Agent Pass have verified real Testnet evidence.
- PR #44 is the draft Stellar CCTP implementation. Keep it draft until Issue #16 is integrated and both directions have exact destination recipient/amount/finality and retry evidence.
- Issue #16 belongs to @Webghost01-NG. Do not modify his branch or create a competing Base/Circle coordinator.
- PR #46 is in progress. Its Vercel status is blocked on authorization before deployment, not a proven build failure; no preview build log exists for the current attempt. GitGuardian separately flags a high-entropy public-configuration value and needs disposition, but that finding alone is not proof of a committed secret. Fail-closed username behavior, production-code tests, and the durable authenticated claim path must also be accepted before merge.
- MoneyGram partner access has not been obtained. The documented non-custodial Stellar widget flow uses G-addresses, while Telya uses Smart Account Kit contract accounts; compatibility requires explicit provider confirmation. Do not simulate provider success, and do not let this external blocker interrupt direct Stellar or CCTP work.
- Source confirmation never completes a cross-chain payment.

## Resume rule

Before doing work:
- inspect open GitHub issues,
- choose only issues assigned to your role,
- create a focused branch,
- link the issue in the PR,
- include how-to-test evidence,
- use the factual status labels and evidence requirements in `product/JUDGING-AND-GRANT-READINESS.md`,
- do not infer completion from a PR description alone,
- do not expand P0.


## Build Week continuation

When implementation begins on November 25, always follow `product/BUILD-WEEK-DAY1.md` before starting work. It contains the sponsor creation step, first issue order, cloud resources already prepared, and strict continuation rules for replacement agents.


## Setlora feedback continuity

Before judging/demo work, read `product/SETLORA-LESSONS.md`. The key lesson is to prove one complete user outcome with real evidence, failure/recovery handling, and a clear judge story rather than presenting Telya as a list of integrations. The frozen MVP remains unchanged.
