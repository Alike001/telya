# Telya Build Week Day-1 Runbook

**Purpose:** This file is the safe starting point for Hammed or any replacement AI agent when Build Week begins.

**Build Week implementation start:** November 25, 2026.

Do not improvise a new product direction. Do not restart architecture. Do not replace previously selected rails without an explicit, documented blocker.

## Step 0 — Read before touching code

Read in this exact order:

1. `AGENTS.md`
2. `product/STATUS.md`
3. `handoffs/AGENT-HANDOFF.md`
4. `product/PRD.md`
5. `product/ARCHITECTURE.md`
6. `product/DECISIONS.md`
7. `product/BUILD-PLAN.md`
8. `product/TEAM.md`
9. `product/ACCEPTANCE-TESTS.md`
10. the role-specific handoff in `handoffs/`
11. this file

Then inspect open GitHub issues and work only from the assigned P0 issue list.

## Non-negotiable continuation rule

A new agent must NOT:
- rename Telya,
- redesign the product from scratch,
- add chains/assets/features outside frozen P0,
- replace Stellar Smart Account Kit,
- replace Circle CCTP without a documented blocker,
- let an LLM sign transactions,
- expose sponsor/private/API secrets,
- fake successful transactions,
- mark source confirmation as cross-chain completion,
- silently guess ambiguous routes,
- bypass GitHub issue/branch/PR workflow.

If an existing decision appears wrong, open or update a GitHub issue and explain the evidence before changing architecture.

## Day-1 start sequence

### 1. Sync repository

```bash
cd ~/Desktop/stellar/telya
git switch main
git pull origin main
git status
```

Expected:
- branch: `main`
- synced with `origin/main`
- clean working tree

### 2. Create the dedicated Stellar Testnet fee sponsor

Do this once, on Hammed's trusted local machine:

```bash
stellar keys generate telya-fee --network testnet --fund
```

This creates and funds a fresh **Testnet-only** sponsor identity.

Security rules:
- never paste or screenshot the secret key,
- never commit the secret,
- never place the secret in a `NEXT_PUBLIC_*` variable,
- never send the secret to an AI agent,
- store it only in local secure CLI storage and/or the server-side Vercel secret `STELLAR_FEE_SPONSOR_SECRET`,
- the public address may be documented later.

The earlier Agent Pass PoC sponsor must not be treated as Telya's long-term app sponsor.

### 3. Confirm pre-provisioned cloud resources

Already prepared before Build Week:
- Vercel project: `telya`
- production branch: `main`
- Neon project: `telya-testnet`
- database: `telya`
- `DATABASE_URL` stored as a Vercel sensitive environment variable
- Testnet Stellar/CCTP public configuration stored in Vercel

Do not create duplicate Vercel or Neon projects unless the existing resources are actually unusable.

### 4. Start only the first parallel P0 work

Initial work order:

**Shared**
- Issue #3 — shared payment/route/event contracts

**Hammed**
- Issue #9 — Stellar Smart Account Kit/passkey account
- Issue #2 — public shell/deployment coordination only as needed

**Prudent**
- Issue #4 — design system + responsive consumer shell

**Webghost**
- Issue #13 — database/auth/username registry

After those contracts/foundations settle, continue assigned P0 issues.

## Product identity

Telya is a conversational money application where users tell the app the payment outcome they want.

The core problem is NOT “stablecoins cannot be sent.”

The core problem is:

> Moving digital dollars across wallets, networks, ramps and agent workflows still exposes users to infrastructure decisions they should not need to understand.

## Frozen P0 routes

- Stellar -> Stellar USDC
- Base -> Base USDC
- Base -> Stellar via Circle CCTP Standard
- Stellar -> Base via Circle CCTP Standard

## Core completion invariant

A cross-chain payment is complete only when:
- destination finality is verified,
- recipient matches,
- received amount matches the route acceptance policy.

Source burn success alone is never completion.

## Agent Pass scope

Buildathon P0:
- direct Stellar USDC only,
- limited,
- expiring,
- revocable,
- owner remains in control.

Cross-chain autonomous Agent Pass spending is roadmap, not P0.

## AI boundary

AI can:
- understand text/voice,
- extract structured intent,
- ask clarifying questions,
- explain payment status.

AI cannot:
- sign,
- hold private keys,
- invent wallet addresses,
- choose unsupported rails,
- override policy,
- silently guess an ambiguous route.

## Stop condition

If an agent is unsure what to build next, it must:
1. inspect GitHub issues,
2. inspect `product/STATUS.md`,
3. inspect the role handoff,
4. continue the highest-priority assigned open P0 issue.

It must not invent a new task just to stay busy.
