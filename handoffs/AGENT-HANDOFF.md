# Telya Universal Agent Handoff

This handoff is for any new Codex session or replacement engineering agent. It is intentionally self-contained enough to resume work without the previous chat.

## Required source of truth

Read these in order:
1. AGENTS.md
2. product/CODEX-MASTER-PLAYBOOK.md
3. product/EXECUTION-TRACKER.md
4. product/STATUS.md
5. product/BUILDATHON-EXECUTION-PLAN.md
6. product/JUDGING-AND-GRANT-READINESS.md
7. product/PRD.md
8. product/ARCHITECTURE.md
9. product/DECISIONS.md
10. product/ACCEPTANCE-TESTS.md
11. product/TEAM.md
12. product/SETLORA-LESSONS.md

Always refresh GitHub PR heads, review comments and CI before acting. The execution tracker is a snapshot; live code and GitHub state supersede it when newer.

## Product in one sentence

Telya is a conversational money-movement product where users speak or type USDC payment requests, while deterministic software resolves recipients and routes, passkey authorization approves execution, and durable on-chain/provider evidence powers real progress, receipts and bounded agent spending.

## P0 route matrix

- Stellar → Stellar
- Base → Base
- Base → Stellar via Circle CCTP Standard
- Stellar → Base via Circle CCTP Standard

MoneyGram sandbox is an additional ramp capability, subject to legitimate partner access and explicit smart-account compatibility confirmation.

## Core security boundaries

- AI parses intent only and never signs.
- No secrets in browser code, logs or Git.
- No mock balances, fees, recipients, quotes, wallet connection or completed transaction in app paths.
- Username claim must authenticate the caller and prove wallet ownership; client-supplied public address is not authentication.
- Ambiguous payment routes require clarification.
- Cross-chain completion requires destination finality and recipient/amount verification.
- Irreversible operations require idempotency.
- Testnet success states must be real, not mocked.

## Consumer principle

At every stage, the user should be able to answer:

**Where is my money right now?**

The UI must show real states such as awaiting confirmation, authorized, submitted, source confirmed, waiting for attestation, destination submitted, destination confirmed, recipient verified, completed or failed.

## Username model

A username such as @alice is a human-readable application identity, not an on-chain wallet address. It resolves to verified wallet records such as the Stellar smart-account address, optional Base address and preferred receive network. Usernames are globally unique and case-insensitive. The database uniqueness constraint is authoritative.

Never manufacture a Privy DID from a Stellar address. Use a real verified auth session or an explicitly designed cryptographic proof-of-control flow.

## Agent Pass

The validated Stellar Testnet proof demonstrated:
- a delegated agent can spend within allowance;
- cumulative spend above allowance is rejected;
- the owner can revoke;
- the agent cannot spend after revocation;
- the owner retains control.

P0 Agent Pass is direct Stellar USDC only.

## Current PR dependencies

- PR #48 Base/Circle is stacked on PR #44 Stellar CCTP. Do not create a competing CCTP coordinator.
- PR #46 onboarding is a prerequisite to safely accepting PR #49.
- PR #49 currently contains onboarding code from #46; after #46 is secured and merged, reconcile/rebase #49 against main.
- Codex may commit directly into an existing teammate PR branch where repository permissions allow. If it cannot push, request the original author to enable maintainer edits; do not duplicate the PR.
- PR #50 is the documentation PR containing the execution plan, playbook and tracker.

## Current implementation and blocker summary

Use product/EXECUTION-TRACKER.md for exact SHA/status and refresh it before acting.

- Main already includes verified Stellar smart-account creation/reconnect, sponsored direct USDC, persistent receipt evidence and Agent Pass on-chain behavior.
- PR #48 has commit 481cbba on its existing Webghost PR branch. Circle message verification now handles nonce, executed finality, executed fee and expiration fields with strict immutable-byte checks. Remaining gates: Neon migrations 0007/0008, DB-backed test, real bidirectional Base Sepolia ↔ Stellar Testnet hashes/amounts/recipients and retry evidence. Keep draft.
- PR #46 has the reported fail-closed username availability and claim/lookup implementation, but its claim endpoint still trusts the request body's wallet address, fabricates a Privy DID and marks the wallet verified without authenticated proof. This is a critical security blocker. A review comment records it.
- PR #49 has removed the timer-based card success and added insufficient-funds behavior, but its current home still does not fetch balances; the confirm request is not valid relayer XDR/passkey authorization; the username is not resolved to an address; fees are hardcoded; and a hash alone can be unverified. A review comment records it.
- MoneyGram partner access is pending. The user's official enquiry was submitted November 25, 2026; no response had arrived at last report. The documented widget uses G-addresses; Telya uses Smart Account Kit C-addresses. Obtain written compatibility confirmation and sandbox credentials before building the provider flow.
- Vercel authorization-required statuses are not proof of an app build failure and are not successful deployments. The user must authorize the team integration before previews can run.

## Codex execution ownership

Codex is the primary engineering lead while Hammed owns product decisions and credentials. Do not wait for teammates to become available. Take over their assigned P0 tasks using existing PRs/branches, preserve contribution history, and keep them informed. Codex must maintain the execution tracker after each task.

## Resume rule

At each new session:
1. Read the entire source-of-truth list.
2. Inspect current main, all open PRs/issues and latest checks.
3. Compare GitHub reality with product/EXECUTION-TRACKER.md.
4. Continue the highest-priority unblocked task from product/CODEX-MASTER-PLAYBOOK.md.
5. Fix existing PRs directly where possible.
6. Run required test/build/security checks and live Testnet/database checks where relevant.
7. Update tracker, status, PR validation notes and issue state after verified progress.

Do not invent a new feature, restart planning, widen scope or ask Hammed what to do next when the tracker and playbook already specify it.

## Buildathon demo lesson

Prove one complete real user outcome with evidence, failure handling and a clear judge story. Do not present Telya as a list of integrations. Only include CCTP and MoneyGram in the primary demo after their real acceptance criteria have been met.
