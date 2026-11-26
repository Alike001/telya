# Buildathon Execution Plan — November 26–30, 2026

**Execution lead:** Hammed (@Alike001)  
**Product:** Telya  
**Repository:** [Alike001/telya](https://github.com/Alike001/telya)  
**Submission date recorded in D-017:** November 30, 2026  
**Submission cutoff/timezone:** Not yet confirmed; keep Issue #22 open until the organizer confirms it.

This is the active execution plan for the final Buildathon sprint. It supersedes the earlier day-by-day Build Week schedule where that schedule conflicts with the current repository state. It does not change the P0 product scope in product/PRD.md.

## 1. Objective

Deliver one coherent, usable **Stellar-first Testnet money movement product** with real payment evidence—not a collection of polished screens, simulated balances, or mock provider responses.

The strongest existing differentiators are already real on Stellar:

- Passkey-controlled Stellar Smart Account Kit accounts.
- Sponsored direct Stellar USDC transfers with finality, recipient/amount verification, durable events, and receipt restoration.
- Agent Pass with bounded cumulative spending, rejection above allowance, owner revocation, rejection after revocation, and continued owner control.

The remaining work must connect those strengths into an unfamiliar user's journey: account → verified recipient → intent → deterministic route/fee review → passkey authorization → real Testnet settlement → persisted progress → receipt. CCTP should extend that journey when both sides are proven. MoneyGram should be integrated only after access and wallet compatibility are confirmed.

A top placement cannot be guaranteed. The best competitive strategy is to demonstrate one genuinely working outcome, show why Stellar is central, and provide independently verifiable evidence.

## 2. Non-negotiable implementation rules

1. **No fake financial data in application paths.** Balances, fees, recipients, payment states, wallet connections, and provider quotes must come from the actual wallet, server, database, chain, or provider. Test fixtures belong in tests; any development-only fixtures must be visibly labelled and impossible to confuse with live Testnet state.
2. **No fake success.** A button click, local timer, optimistic state, or AI response cannot mean a payment was authorized, submitted, or completed. Show those states only after the corresponding wallet, API, database, and chain evidence exists.
3. **Fail closed.** Missing database, wallet, RPC, provider, auth, or quote data must produce an explicit unavailable/error state—not a fallback username, zero fee, invented balance, default route, or success.
4. **AI is intent-only.** Deterministic server code resolves usernames, wallet/network, balance, route, fee, authorization policy, idempotency, execution, and verification.
5. **Cross-chain completion requires destination finality plus exact recipient and accepted amount verification.** Source confirmation is intermediate.
6. **Every irreversible action is idempotent and recoverable after refresh.**
7. **Use real Testnet infrastructure.** Keep secrets server-only. Do not weaken Stellar Smart Account Kit or Circle CCTP architecture to bypass provider limitations.
8. Work in focused branches/PRs. Read the relevant source before changing it, add regression tests for the reported failure, run the full required checks, and include exact how-to-test evidence. Do not merge merely because a PR description says tests passed.

## 3. Current PR and issue triage

### P0 — Review/fix existing PRs first

| Work | Current state | Required next action | Merge gate |
| --- | --- | --- | --- |
| [PR #48 — Base/Circle coordinator](https://github.com/Alike001/telya/pull/48), Issue #16 | Open; in Webghost's fork; based on PR #44's branch. Local build, TypeScript, and 86 tests reported passing; one PostgreSQL test was skipped without DATABASE_URL. Latest review found an attestation-message comparison blocker. | Fix circleAttestationMatchesSourceEvent in src/server/base-cctp.ts. Permit only the exact Circle attestation-time fields to differ: nonce (absolute byte offset 12, 32 bytes), finalityThresholdExecuted (144, 4 bytes), feeExecuted (312, 32 bytes), and expirationBlock (344, 32 bytes). Require each corresponding source-event placeholder to be zero; compare every other byte exactly; parse the attested message; retain Standard finality; enforce feeExecuted <= maxFee; add positive and negative regression tests, including tampering immediately outside each permitted range. | Apply/verify migrations 0007 and 0008 in Neon (0006 is recorded applied); run the database-backed casing test; prove both Base Sepolia ↔ Stellar Testnet directions with real source/destination hashes, exact expected/actual recipients and amounts, and retry/restart idempotency. Keep draft until all evidence exists. |
| [PR #44 — Stellar CCTP](https://github.com/Alike001/telya/pull/44), Issue #12 | Open draft; base for PR #48. | Preserve the shared CCTP seam; test Stellar source/destination logic with real Testnet evidence and recovery. Do not duplicate the Base/Circle coordinator. | Do not merge before #48 is integrated and the full bidirectional acceptance evidence is attached. |
| [PR #46 — onboarding and username](https://github.com/Alike001/telya/pull/46), Issue #5 | Open; changes requested. | Remove mock username fallback; missing/failed DB must return unavailable/error (for example 503). Import the production validator in tests. Implement authenticated, durable, atomic username claiming backed by the DB uniqueness constraint; restore identity from server state on reconnect. Remove/disable any UI that claims Base is connected without a real wallet. Investigate and accurately disposition the GitGuardian finding in src/stellar/public-config.ts. | Prove new-user passkey + durable claim; case-insensitive collision/concurrent claim rejection; returning-user restoration; database-outage fail-closed behavior; verified wallet state. Resolve required checks. |
| [PR #49 — conversational home](https://github.com/Alike001/telya/pull/49), Issue #6 | Open; changes requested; includes the onboarding code path and inherits its outstanding risks. | Remove hardcoded Stellar/Base balances and fees; remove the timer/local-state payment-success path; no “submitted” state without actual authorization, transaction hash, persisted payment and verified server state. Resolve @username to a verified wallet record. Return explicit insufficient-funds state instead of defaulting to Stellar. Voice-unavailable must not inject a sample payment request. Rework the UI against the real shared API contracts. | Same identity/security gates as #46 plus real quote, authorization, submission, persisted progress, failure, and receipt evidence. |

### P0 — Remaining product issues

| Issue | Work required | Acceptance |
| --- | --- | --- |
| [#15 — contacts, routing and payment orchestrator](https://github.com/Alike001/telya/issues/15) | Mount/connect real server handlers; persist conversations and payment intents; resolve recipients from durable username/contact records; apply the documented deterministic routing priority; source fee quotes from trusted code; create/confirm payments with PaymentEvents and idempotency. | Same input produces deterministic decisions; unresolved recipient/ambiguous network/insufficient funds/provider outage fail clearly; no client-supplied address or fee is trusted. |
| [#7 — payment timeline, receipts and activity](https://github.com/Alike001/telya/issues/7) | Build from persisted Payment + PaymentEvent state; include source and destination hashes, elapsed time, pending/attestation/failure stages, refresh recovery and activity history. | Refresh restores the same payment. No fake countdown. Completed appears only after final verification. |
| [#8 — Agent Pass, contacts, ramps and Judge mode](https://github.com/Alike001/telya/issues/8) | Connect the existing real Agent Pass create/status/spend/revoke evidence to UI; build contacts with verified destination records and receive-network preference; add/withdraw screen with genuine provider availability state; show clearly labelled Testnet/Judge mode. | Agent limits and revocation reflect on-chain state. Unavailable MoneyGram is shown as unavailable/pending access, never as a successful ramp. |
| [#18 — route matrix and recovery](https://github.com/Alike001/telya/issues/18) | Exercise Stellar→Stellar, Base→Base, Base→Stellar, Stellar→Base; duplicate-confirm, timeout, refresh, repeated provider status, delayed attestation, recipient mismatch, low sponsor balance, AI/voice outage. | No duplicate irreversible execution and no false completion on any path. |
| [#19 — test and submission docs](https://github.com/Alike001/telya/issues/19) | Update README How to Test, public Testnet setup/faucets, exact known working flow, Agent Pass evidence, architecture, limitations, demo sequence, evidence links, and video/pitch checklist. Remove stale pre-Build-Week wording. | A judge can run and understand the proven demo without a team member explaining hidden setup. |
| [#22 — organizer requirements](https://github.com/Alike001/telya/issues/22) | Confirm exact November 30 cutoff and timezone, submission artifacts, public-link requirements, and video/demo format. Record the answer in product/DECISIONS.md. | Do not close until organizer confirmation is recorded. |

### External dependency — MoneyGram

[Issue #17 — MoneyGram Ramps sandbox](https://github.com/Alike001/telya/issues/17) is externally blocked, not a reason to stop the core product.

- The official developer guide says new widget partners need partner access before the integration works end to end and request sandbox API keys (ramps_pk_sbox_... / ramps_sk_sbox_...).
- The partner registration page currently rejects personal email addresses.
- Hammed submitted the official MoneyGram Ramps contact enquiry on November 25, 2026; no reply had arrived as of November 26. Follow up through the Buildathon admin/organizer and check inbox/spam before sending duplicate enquiries.
- The published non-custodial Stellar web guide asks the partner to pass a user's Stellar G-address and invokes a Stellar USDC signing callback. Telya currently uses a Smart Account Kit C-address. Obtain written MoneyGram confirmation that the intended wallet model is supported before implementing the signing path.
- Do not use somebody else's business identity, claim Telya is incorporated when it is not, expose keys, or create a fake adapter response.
- Continue with a provider abstraction and honest unavailable state only where needed. Activate the ramp flow after sandbox access, domain allowlisting, and wallet compatibility are confirmed.

## 4. Execution sequence and timebox

The submission date recorded in the repository is **November 30, 2026**. Exact cutoff/timezone remains unknown, so confirm it immediately with the organizer. The following is a priority sequence, not a promise that every external dependency will clear.

### November 26 — correctness and stop-the-bleeding
- Fix the latest PR #48 Circle message comparison review and its regression tests.
- Apply/verify migrations 0007/0008 in the configured Neon Testnet database; run the skipped database-backed test.
- Fix PR #46 identity and username fail-closed/durable-claim path.
- Keep PR #49 blocked from merge until its hardcoded/mock balance and payment-success behavior is removed.
- Confirm the actual Testnet app, env configuration, and main-branch health before changing production paths.

### November 27 — one real user journey
- Wire the onboarding/account state to the existing passkey-controlled Stellar account.
- Connect typed intent to the deterministic server-side recipient/route/fee/payment orchestration.
- Complete and verify the direct Stellar USDC journey from the conversational UI.
- Render timeline/activity/receipt from the durable payment/event model and prove refresh recovery.
- Keep voice as an input convenience; text/manual flow must work without it.

### November 28 — cross-chain and Agent Pass
- Complete CCTP source → attestation → destination verification for each direction if the external Testnet prerequisites are ready.
- Add/finish Base→Base direct payment only with actual Testnet execution evidence.
- Connect the already-proven Agent Pass behavior to real UI controls and display allowance/spend/revocation from on-chain-backed state.
- If any cross-chain route cannot be proven safely, label it pending/unavailable and use the verified Stellar direct + Agent Pass flow for the primary demo rather than pretending it works.

### November 29 — integration, evidence and freeze
- Run the full acceptance matrix, including refresh, retry, idempotency, failure and low-balance tests.
- Fix only blockers and high-impact UX/accessibility issues. No new product surface unless it closes a P0 acceptance gap.
- Verify the deployed commit, public URL, database health and Testnet configuration.
- Finalize README, known limitations, exact transaction evidence, short demo recording, and pitch.
- Feature freeze at the end of the day.

### November 30 — submission
- No feature work. Verify the exact organizer cutoff, submit the tested build and required artifacts, and retain submission confirmation.

## 5. Demo story to optimize

Primary story:
1. A new user creates/reconnects a Stellar Smart Account Kit account with a passkey.
2. The user addresses a recipient by a durable Telya username; Telya resolves it to a verified Stellar wallet.
3. The user types or speaks a request; Telya explains the deterministic route and actual fees.
4. The user reviews the exact recipient amount and confirms with the passkey.
5. The UI shows real Testnet state transitions and a receipt with the real transaction reference.
6. The user creates a bounded Agent Pass, demonstrates an allowed spend, an over-limit rejection, and revocation.

Add a cross-chain step only after both source and destination are verified. Add MoneyGram only after partner keys and wallet compatibility are confirmed. The pitch should make the differentiator clear: conversational intent with deterministic, passkey-authorized, verifiable money movement and constrained agent authority.

## 6. Coding-agent work protocol

Give the coding agent **one task from this plan at a time**. Every task prompt must require it to:

- inspect the current branch, exact PR diff, source files, tests, schema and acceptance criteria before editing;
- identify the failing invariant and write/adjust a regression test;
- change the smallest necessary surface; do not rewrite architecture or create a competing implementation;
- never add mock data/fallback success to app/API code; test fixtures must remain isolated;
- run pnpm test, pnpm typecheck, pnpm build, and git diff --check (plus the server TypeScript check and database-backed tests where relevant);
- report commands and actual results, skipped tests with reasons, changed files, remaining blockers, and exact Testnet evidence;
- leave the PR in draft whenever real Testnet, database, provider, or security acceptance evidence is missing.

## 7. Definition of done

A feature is done only when its implementation, negative/failure tests, Testnet evidence, durable refresh/retry behavior, security boundaries, and user-facing documentation all agree. A green unit-test suite alone is not proof of a working financial product.


## Live repository update — November 26, 2026, 11:18 UTC+01:00

This section supersedes any older PR snapshot or task-order statement earlier in this document. The detailed, continuously maintained sources are now:

- [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md) — persistent instructions from a new Codex session through final submission.
- [Execution Tracker](EXECUTION-TRACKER.md) — exact PR heads, current review blockers, issue queue, external dependencies and next actions.
- [Current Status](STATUS.md) — concise project-level status.

### Latest PR changes inspected

- **PR #48:** Codex pushed commit 481cbba0f8dbda55fe06a05fe43ca0edf9c2c9a6 to Webghost's existing PR branch. It permits only Circle's four attestation-time changes (nonce, executed finality, executed fee, expiration), requires zero source placeholders, compares immutable bytes, checks fee ceiling and exact net recipient amount. The report says 104 tests pass and one DB-backed test is skipped without DATABASE_URL; TypeScript/build/server TypeScript/diff checks passed. Remaining: migrations 0007/0008, DB-backed constraint test, real bidirectional Testnet evidence and retry proof. Keep draft.
- **PR #46:** Prudent's latest commit c04347cf6497eb1a1be593967454e831eb3c555c removes mock username availability fallback and adds claim/lookup handlers. Code audit found the claim endpoint still trusts a browser-supplied wallet address, manufactures a Privy DID from it, and marks the wallet verified without authenticating the caller or proving account ownership. This is a critical blocker; a review comment has been posted. Keep draft.
- **PR #49:** Prudent's latest commit 56553d6312e3185a5c9410353e540e95124ecf7d removes the timer-based fake success and adds insufficient-funds behavior. Code audit found balances are still never loaded, the confirm request does not supply valid relayer XDR/passkey authorization, handles are not resolved to verified destination addresses, fees remain hardcoded, and a hash alone may not prove verification. A review comment has been posted. Keep draft and reconcile the branch after PR #46 is secured/merged.
- **PR #50:** This documentation PR now carries the master playbook, execution tracker, refreshed status, handoff and README links. Vercel was green on the previous check; recheck after the latest commits.

Vercel authorization-required checks on the code PRs are not failed application builds and are not successful previews. The Vercel team integration must be authorized before preview/deployment evidence can be collected.

### Execution ownership update

Codex is the primary implementation lead for all remaining P0 issues, even where GitHub still lists a teammate as assignee. Fix existing PRs directly where write access is available; do not create duplicate PRs. Teammates may join later to contribute or independently test. Do not wait for their availability.

The MoneyGram Ramps enquiry was submitted on November 25; no reply had arrived at the last user report. Hammed plans to raise the blocker with the Buildathon admin during office hours. Continue the core journey and other P0 work while waiting. Never fake MoneyGram access or compromise the Stellar smart-account design to bypass the G-address/C-address compatibility question.
