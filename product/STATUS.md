# Telya Current Status

**Date:** November 26, 2026  
**Team:** Bravo  
**Product:** Telya  
**Repository:** Alike001/telya  
**Execution lead:** Codex  
**Product owner:** Hammed (@Alike001)

**Persistent continuation documents:**
- [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md)
- [Live Execution Tracker](EXECUTION-TRACKER.md)
- [Buildathon Execution Plan](BUILDATHON-EXECUTION-PLAN.md)
- [Judging and Grant Readiness](JUDGING-AND-GRANT-READINESS.md)

## Codex operating system

The persistent [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md), [Execution Tracker](EXECUTION-TRACKER.md), agent rules and universal handoff were merged to main in PR #50 (merge commit ab8d4f51ef43754568e10cb99e89a7266fb0d87b). New Codex sessions must read these documents before changing code. The tracker is the live continuation ledger.

## Readiness verdict

Telya has independently inspectable Stellar Testnet foundations, but the complete P0 consumer journey and bidirectional cross-chain demo are not yet proven. The final submission date recorded in decision D-017 is **November 30, 2026**; exact cutoff/timezone remains unconfirmed in Issue #22.

Hammed is taking primary implementation ownership. Codex is the day-to-day engineering lead and should continue the remaining tasks without waiting for teammates. Teammates can contribute and provide independent testing when available.

## Verified on main

- Public Testnet application and health endpoint.
- Canonical domain contracts and database migrations through 0005.
- Passkey-controlled Stellar Smart Account Kit creation/reconnect and server-side sponsorship.
- Direct Stellar Testnet USDC with finality, exact recipient/amount verification, durable events and receipt restoration.
- Agent Pass allowed spend, cumulative-limit rejection, revocation, post-revocation rejection and continued owner control.
- PR #47 judging/grant readiness documentation merged in commit 846e4c887f2fb940f424edf37bc237a1d219c915.
- Main-branch baseline previously recorded as 5 test files / 40 tests, with type generation, TypeScript and production build passing. This is not the test count for unmerged PRs.

## Current pull requests

### PR #44 — Stellar CCTP, Issue #12
Open draft. It contains Stellar-side CCTP burn/mint-forward, destination verification, durable operation records, idempotency and recovery. It is stacked with PR #48. Keep draft until the complete Base/Circle integration and real bidirectional evidence exist.

### PR #48 — Base/Circle CCTP, Issue #16
Open draft on Webghost01-NG/telya, latest observed head 481cbba0f8dbda55fe06a05fe43ca0edf9c2c9a6. Circle attestation comparison now handles nonce, executed finality, executed fee and expiration block with strict immutable-byte comparison and zero source placeholders. Codex reported 104 passing tests and one PostgreSQL-backed test skipped because DATABASE_URL was unavailable; typecheck, build, server TypeScript and diff checks passed. Remaining acceptance: apply/verify migrations 0007/0008; run DB-backed address-casing test; prove Base Sepolia ↔ Stellar Testnet in both directions with exact source/destination hashes, recipient/amount and retry/restart idempotency. Vercel currently requires team authorization; this is not evidence of a code build failure.

### PR #46 — onboarding/auth/username, Issue #5
Open draft on Prudentdev-xyz/telya, latest observed head c04347cf6497eb1a1be593967454e831eb3c555c. Prudent reported fail-closed username availability, shared validator, claim/lookup routes, 58 tests, typecheck/build passing and GitGuardian green. **Critical blocker found in code audit:** claim endpoint trusts a browser-supplied smartAccountAddress, manufactures a Privy DID from it and marks the wallet verified without authenticating the caller or proving account ownership. This must be fixed with a genuine verified session or an approved proof-of-control design. Wallet binding and username claim must be atomic; reject cross-user address collisions. Review comment 7189269409 records the issue. Vercel is authorization-required, not a successful preview or a code build failure.

### PR #49 — conversational experience, Issue #6
Open draft on Prudentdev-xyz/telya, latest observed head 56553d6312e3185a5c9410353e540e95124ecf7d. Prudent reported removal of timer-based success, transaction-hash requirement, insufficient-funds behavior, 70 tests and typecheck/build passing. **Critical blockers found in code audit:** balances remain initialized to 0.00 and are never fetched; payment confirm sends a placeholder function string and empty authorization to an XDR relayer; recipient handles are not resolved into verified addresses; route fees remain hardcoded; and a returned hash is not sufficient to claim verified completion. Review comment 7189270232 records the findings. This PR contains onboarding changes from #46 and must be reconciled after #46 is fixed/merged. Vercel is authorization-required, not a successful preview or a code build failure.

### PR #50 — execution documentation
Open documentation PR on docs/buildathon-critical-path. It contains the dated execution plan, refreshed status, README links, Codex master playbook and execution tracker. Vercel was green on the last check. Verify all docs/links before merging.

## Remaining P0 issues

- Issue #15: real contacts, conversations, recipient resolution, deterministic routing/fee quotes, payment orchestration, PaymentEvents and idempotency.
- Issue #7: real timeline, receipt, history and refresh recovery from persisted payment state.
- Issue #8: actual Agent Pass management, verified contacts, add/withdraw and truthful Testnet/Judge mode.
- Issue #17: MoneyGram Ramps sandbox; externally blocked on partner access, credentials, domain allowlisting and written C-address wallet compatibility.
- Issue #18: full route matrix and retry/refresh/failure/idempotency acceptance.
- Issue #19: final How to Test, demo script, evidence and submission documentation.
- Issue #22: confirm exact submission cutoff/timezone, required artifacts and demo/video requirements.

## MoneyGram status

Hammed submitted the official MoneyGram Ramps contact enquiry on November 25, 2026; no reply had arrived at the last report. He plans to raise the issue with the Buildathon admin during office hours on November 26. Record the eventual response in product/DECISIONS.md and the tracker. Do not submit duplicate enquiries without reason or invent company details.

MoneyGram's documented non-custodial Stellar widget flow uses a G-address. Telya uses a Smart Account Kit C-address. Written provider confirmation is required before implementing the signing flow. If access or compatibility does not arrive by feature freeze, show ramp as unavailable/pending partner access and continue the core payment product.

## Immediate execution order

1. Re-review PR #48 commit 481cbba, apply/verify Neon migrations 0007/0008, run the DB-backed test and prove real bidirectional CCTP/retry behavior.
2. Fix PR #46 authenticated identity and proof-of-wallet-ownership; no fabricated Privy DID or client-trusted verification.
3. Implement Issue #15 service/API contracts using actual balances, recipient resolution, quotes, payment state and idempotency.
4. Connect PR #49 to the real Smart Account Kit signed XDR and payment/receipt APIs; no hardcoded financial state or hash-only success.
5. Complete Issue #7 payment timeline/history/receipts.
6. Complete Issue #8 Agent Pass, contacts and Judge mode using real states.
7. Run Issue #18 end-to-end route/recovery matrix.
8. Complete Issue #19/#22, independent teammate testing, bug fixes, demo and submission.

See the [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md) for the full start-to-finish instructions and the [Execution Tracker](EXECUTION-TRACKER.md) for current task status and human-controlled blockers.
