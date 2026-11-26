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

PR #67 merged as `d87ae75`, recording the safety corrections on draft PRs #65/#66. PR #48's CCTP migrations `0001`–`0008` and PR #53's Payment-relayer/execution-session migrations `0009`–`0010` are recorded in Neon. Their PostgreSQL regressions passed.

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
Open draft at `af68df4`. Stellar source, destination submission, verified mismatch/failure and completion now each require guarded Payment/operation writes before timeline events. Submission checks its active lease and saved Circle evidence; failure cannot overwrite a completed payment. Neon SQL probes and regressions passed; with `DATABASE_URL`, 67 tests passed across 10 files. Plain `pnpm test` passed 64 with three DB cases skipped. Typecheck, server TypeScript, build, GitGuardian and Vercel passed. [PR evidence](https://github.com/Alike001/telya/pull/44#issuecomment-7199926657). Real bidirectional settlement and retry/recovery proof remain before merge.

### PR #48 — Base/Circle CCTP, Issue #16
Open draft on Webghost01-NG/telya at `eb69d1c`. Neon migrations `0001`–`0008` are verified. Base and Stellar source evidence is guarded, and PR #44’s guarded Stellar destination submission, failure and completion are synced into this stacked branch. Stellar→Base attestation reservation and Base mint submission now use guarded operation/Payment/event writes in one statement. The attested burn now checks source and destination messenger, USDC contract, source smart account, nonce, executed fee and exact net Base recipient amount. A late Circle pending poll can no longer reopen a prepared mint reservation. Base destination submission now requires RPC evidence of the exact reserved mint transaction before it is recorded. The Base USDC balance reader remains read-only and is not connected to the authenticated API. With `DATABASE_URL`, 135 tests passed across 21 files, including five PostgreSQL cases; plain `pnpm test` passed 130 with those five DB cases skipped. Client/server TypeScript, build and diff check passed. [Latest PR evidence](https://github.com/Alike001/telya/pull/48#issuecomment-7199942767). GitGuardian status needs rechecking on the new head and Vercel required fork authorization. Real bidirectional settlement, exact recipient/amount/finality and retry/restart evidence remain unverified. Keep draft.

### PR #46 — onboarding/auth/username, Issue #5
Open draft on Prudentdev-xyz/telya, now at `a69a28a`. Claims require a server-verified Privy session and a verified Stellar wallet belonging to that user. The wallet binding endpoint checks a fresh passkey assertion against the live Testnet contract's accepted WASM and active WebAuthn signer. The username claim is atomic and owner-bound. A read-only Testnet query confirmed the documented account's WASM/default-rule signer shape. The new Neon-backed regression raced differently cased claims by two temporary users, observed one winner, and verified that a failed rename preserved the original active username. With `DATABASE_URL` loaded, 68 tests passed; plain `pnpm test` passed 67 with the DB test skipped. Client/server TypeScript, production build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/46#issuecomment-7199042701). **Still unverified:** real browser Privy/passkey sign-in, wallet binding, authenticated claim/reconnect and Vercel fork preview. Exact WebAuthn RP ID/origin and Privy settings are required in the secure environment. Do not merge or close Issue #5.

### PR #49 — conversational experience, Issue #6
Open draft on Prudentdev-xyz/telya, now at `0a87405`. The existing PR stacks the current Privy/passkey onboarding and authenticated backend, including PR #53's protected one-use execution handoff. The conversation gets a short-lived Privy token without storing or logging it, reads only server-verified balances, persists the original message and requests an owner-bound idempotent review. Confirmation accepts only the fixed same-origin payment relayer URL, restores the same verified smart account before passkey signing and reconciles the submission against canonical Payment/Event state. A returned hash alone renders only `unverified`; completed UI requires the exact persisted payment ID, recipient, decimal amount and destination hash plus matching recipient-verification and completion events. With `DATABASE_URL`, 125 tests passed across 26 files; plain `pnpm test` passed 121 with four DB tests skipped. The seven focused execution/parser regressions, client/server TypeScript, build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/49#issuecomment-7204229635). Browser Privy/passkey and signed Testnet proof remain, GitHub reports main-branch conflicts, and Vercel still requires fork authorization. GitGuardian was running when recorded. Keep draft.

### PRs #65 and #66 — timeline, activity, Agent Pass and supporting UI, Issues #7/#8

[PR #65](https://github.com/Alike001/telya/pull/65) is now at `6a3d512` and includes the protected PR #49 journey. It mounts authenticated owner-scoped payment history with stable pagination, persisted PaymentEvent timelines and canonical non-signing refresh for an already-submitted direct Stellar payment. Its parser rejects mismatched route/network/rail, decimal, timestamp and network-hash evidence. A receipt appears only when the completed Payment has the exact recipient, amount and destination hash plus matching recipient-verification and completion events; there is no browser-stored financial truth or amount fallback. With `DATABASE_URL`, 139 tests passed across 29 files; plain `pnpm test` passed 135 with four DB tests skipped. Client/server TypeScript, build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/65#issuecomment-7204514936). Browser Privy pagination/refresh and a real Testnet timeline/receipt remain unverified; Vercel requires fork authorization. Keep draft.

[PR #66](https://github.com/Alike001/telya/pull/66) remains at `f4d2402`. It shows MoneyGram/contacts as unavailable until verified, removes unproven judge claims and keeps the Agent Pass panel from retaining stale API status. Its last recorded head passed 90 tests, typecheck, build, diff check and GitGuardian; Vercel requires fork authorization. Real authenticated contacts, Agent Pass browser proof and provider acceptance remain. Do not merge or close Issue #8.

### PR #50 — execution documentation
Merged as `ab8d4f5`; the playbook, tracker and execution plan are available on main. The latest tracker audit was merged in PR #52.

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

1. Prove PR #48 real bidirectional CCTP, recipient/amount/finality and retry/restart behavior using authorized Testnet credentials. Neon migrations through `0008` and guarded source and Stellar destination SQL are verified. The newest guarded attestation and Base submission SQL passed regressions, the suite and read-only Neon `EXPLAIN` probes.
2. Complete PR #46 browser Privy authentication and proof-of-wallet-ownership; no fabricated Privy DID or client-trusted verification.
3. Implement Issue #15 service/API contracts using actual balances, recipient resolution, quotes, payment state and idempotency.
4. Reconcile PR #49's main-branch conflicts and prove its protected Smart Account Kit confirmation in a real Privy/passkey browser session and signed Testnet payment; its implementation now refuses hash-only success.
5. Prove PR #65 authenticated browser pagination/refresh and a real Testnet submitted-to-completed timeline/receipt; its owner-scoped persisted integration is implemented at `6a3d512`.
6. Complete Issue #8 Agent Pass, contacts and Judge mode using real states.
7. Run Issue #18 end-to-end route/recovery matrix.
8. Complete Issue #19/#22, independent teammate testing, bug fixes, demo and submission.

See the [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md) for the full start-to-finish instructions and the [Execution Tracker](EXECUTION-TRACKER.md) for current task status and human-controlled blockers.

## November 26 backend progress

Draft [PR #53](https://github.com/Alike001/telya/pull/53) at `e2cd2ed` mounts authenticated contacts, conversations, intent, voice and payments, live Stellar USDC balances and owner-scoped history. Direct Stellar reviews are owner-bound and idempotent; exact passkey execution and saved-hash reconciliation advance canonical Payment/Event state only after verified finality, recipient and amount. Migration `0010` adds a five-minute one-time browser handoff: Privy-authenticated preparation sets a path-scoped HttpOnly/Secure/SameSite cookie, stores only its hash, and the dedicated relayer consumes it before reservation or broadcast. Originating Privy-session revocation invalidates it, and the SDK keeps its standard signed `func`/`auth` body while the server supplies the fixed payment context. Neon tests proved owner scope, hashed storage, one-time consumption, revocation, pending recovery, exact completion and replay. With `DATABASE_URL`, 82 tests passed across 19 files; plain `pnpm test` passed 79 with three DB tests skipped. Client/server TypeScript, build and diff check passed; fixtures were removed. A real browser Privy/passkey walkthrough and signed Testnet payment remain unverified. Base and CCTP previews remain unavailable without trusted providers.
