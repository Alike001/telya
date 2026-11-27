# Telya Current Status

**Date:** November 27, 2026
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
Open draft on Webghost01-NG/telya at `05531f5`. Guarded source/destination state, exact attestation/mint evidence, canonical Stellar hashes and authenticated owner-scoped Base balances remain in place. A strict Circle Testnet client now retrieves only Telya's supported Base domain 6 ↔ Stellar domain 27 Standard Transfer quote and rejects missing, duplicate, malformed, unsupported or non-Testnet responses. Live read-only responses at about 01:09 UTC reported Standard `0` bps in both directions; this is observed provider data, not a hard-coded future fee. With `DATABASE_URL`, 150 tests passed across 22 files, including five PostgreSQL cases; plain `pnpm test` passed 145 with those cases skipped. Client/server TypeScript, build and diff check passed. [Latest PR evidence](https://github.com/Alike001/telya/pull/48#issuecomment-7206252803). GitGuardian passed and Vercel requires fork authorization. The quote is not yet mounted in payment review, no Base RPC credential was available for live balance proof, and real bidirectional settlement/retry evidence remains unverified. Keep draft.

### PR #46 — onboarding/auth/username, Issue #5
Open draft on Prudentdev-xyz/telya, now at `a69a28a`. Claims require a server-verified Privy session and a verified Stellar wallet belonging to that user. The wallet binding endpoint checks a fresh passkey assertion against the live Testnet contract's accepted WASM and active WebAuthn signer. The username claim is atomic and owner-bound. A read-only Testnet query confirmed the documented account's WASM/default-rule signer shape. The new Neon-backed regression raced differently cased claims by two temporary users, observed one winner, and verified that a failed rename preserved the original active username. With `DATABASE_URL` loaded, 68 tests passed; plain `pnpm test` passed 67 with the DB test skipped. Client/server TypeScript, production build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/46#issuecomment-7199042701). **Still unverified:** real browser Privy/passkey sign-in, wallet binding, authenticated claim/reconnect and Vercel fork preview. Exact WebAuthn RP ID/origin and Privy settings are required in the secure environment. Do not merge or close Issue #5.

### PR #49 — conversational experience, Issue #6
Open draft on Prudentdev-xyz/telya, now at `e5fbc06`. AI/manual, voice/text and protected passkey recovery remain. A hashless sponsor/relayer failure reconciles once, then renders failed with no hash and no repeat Confirm when submitted state cannot be found; it preserves the provider message without guessing an undocumented low-balance code. With `DATABASE_URL`, 142 tests passed across 29 files; plain `pnpm test` passed 138 with four DB tests skipped. Client/server TypeScript, build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/49#issuecomment-7205829550). No live low-sponsor, provider outage, browser Privy/passkey or signed Testnet proof; Vercel requires fork authorization. Keep draft.

### PRs #65 and #66 — timeline, activity, Agent Pass and supporting UI, Issues #7/#8

[PR #65](https://github.com/Alike001/telya/pull/65) is now at `b41d1db` and merges PR #49's hashless failure handling while retaining authenticated owner-scoped history, persisted timelines, non-signing refresh and exact receipt gating. With `DATABASE_URL`, 156 tests passed across 32 files; plain `pnpm test` passed 152 with four DB tests skipped. Client/server TypeScript, build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/65#issuecomment-7205854344). Live sponsor/provider, browser refresh and Testnet receipt remain unverified; Vercel requires fork authorization. Keep draft.

[PR #66](https://github.com/Alike001/telya/pull/66) is now at `b48b26a` after merging updated PR #65. Hashless sponsor/relayer failure plus AI/manual and voice/text fallbacks run through the full stack; contacts, exact Agent Pass state, owner-passkey operations and MoneyGram-unavailable truth remain intact. With `DATABASE_URL`, 171 tests passed across 38 files; plain `pnpm test` passed 167 with four DB tests skipped. Client/server TypeScript, build and diff check passed. [PR evidence](https://github.com/Alike001/telya/pull/66#issuecomment-7205875735). No live sponsor/AI/voice outage, Privy contacts, Agent Pass or Testnet acceptance proof. Keep draft and do not close Issue #8.

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
3. Propagate PR #53's payment-bound Stellar→Base forwarding flow into PR #49 without duplication, wire its confirmation UI, then prove browser authentication, signing, Circle forwarding and persisted final recipient/amount state.
4. Prove PR #49's protected Smart Account Kit confirmation in a real Privy/passkey browser session and signed Testnet payment; it is reconciled with main, refuses hash-only success and recovers duplicate/interrupted actions without resubmission.
5. Prove PR #65 authenticated browser pagination/refresh and a real Testnet submitted-to-completed timeline/receipt; its reconciled owner-scoped persisted integration is at `64d5b28`.
6. Prove PR #66 authenticated contacts and owner-passkey Agent Pass create/revoke in a real browser/Testnet session; the corrected full UI stack is at `4050d7a`, while MoneyGram remains externally blocked.
7. Continue Issue #18 end-to-end route/recovery matrix. Automated AI/manual, voice/text and duplicate/interrupted-response recovery are proven; real browser/provider outage and route evidence remain open.
8. Complete Issue #19/#22, independent teammate testing, bug fixes, demo and submission.

See the [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md) for the full start-to-finish instructions and the [Execution Tracker](EXECUTION-TRACKER.md) for current task status and human-controlled blockers.

## November 26 backend progress

Draft [PR #53](https://github.com/Alike001/telya/pull/53) stacks PR #48 without duplication and is mergeable at `5b846b8`. All four P0 routes have fail-closed review providers. Stellar→Base uses Circle's live Standard Forwarding Service quote and provider-submitted Base transaction, and the exact owner-signed smart account, Base recipient, gross burn and maximum fee are now bound to an authenticated one-use Payment handoff before sponsorship. Finality plus exact attested hook, fee, recipient and amount still gate completion. Environment-loaded suite passed 216 tests across 36 files; plain tests passed 207 with nine PostgreSQL skips. Both TypeScript checks, build, diff check and GitGuardian passed; Vercel was deployment-rate-limited on this head after the prior application head passed. No live Base RPC review, browser Privy/passkey walkthrough or transaction was performed.
