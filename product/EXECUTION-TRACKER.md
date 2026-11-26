# Telya Execution Tracker

**Last refreshed:** November 26, 2026 (after PR #50 merge)  
**Execution lead:** Codex  
**Product owner:** Hammed (@Alike001)  
**Submission date recorded:** November 30, 2026 (exact cutoff/timezone still unconfirmed in Issue #22).

This is the live continuation ledger. Codex must update it after every meaningful task, commit, PR review, migration, Testnet run, issue completion, organizer reply or deployment. At the start of every session, refresh GitHub and compare live evidence with this file. GitHub and the actual code are authoritative when this file is stale.

## 1. Overall state

**Status: ACTIVE — implementation, security review and integration remain.**

The project has real Stellar Testnet foundations: passkey smart accounts, sponsored direct USDC transfers with verified recipient/amount and durable receipts, and Agent Pass allowance/revoke enforcement. The integrated consumer journey and full cross-chain demo are not yet proven.

Hammed is taking primary implementation ownership. Teammate availability is not a blocker; preserve their contribution history and continue on existing PR branches where access permits.

## 2. Current PR ledger

| PR | Latest observed head | State at refresh | Verified / reported progress | Remaining blockers |
| --- | --- | --- | --- | --- |
| [#44 Stellar CCTP](https://github.com/Alike001/telya/pull/44) | 09cc07f40df6c3d2ee661c61c5e176d344ee423e on feat/st-12-stellar-cctp | Draft | Stellar-side burn/mint-forward, destination verification, durable operation/idempotency/recovery code exists. | Must integrate with #48 and prove both directions with live Testnet recipient/amount/finality/retry evidence. |
| [#48 Base/Circle CCTP](https://github.com/Alike001/telya/pull/48) | 481cbba0f8dbda55fe06a05fe43ca0edf9c2c9a6 on Webghost01-NG/telya:feat/base-circle-cctp-16 | Draft | Circle source/attested message comparison updated for four attestation fields; zero source placeholders, immutable-byte match, nonzero nonce, Standard finality, executed-fee ceiling and exact net recipient amount checks. Codex reported 104 passed / 1 PostgreSQL-backed test skipped; typecheck, build, server TypeScript, diff check and GitGuardian passed. | Apply/verify migrations 0007 and 0008 in Neon (0006 is recorded applied); run DB-backed casing constraint test; real Base Sepolia ↔ Stellar Testnet both directions; exact hashes and expected/actual recipients/amounts; retry/restart idempotency. Vercel currently asks for team authorization, not showing an app build failure. |
| [#46 Onboarding/username](https://github.com/Alike001/telya/pull/46) | c04347cf6497eb1a1be593967454e831eb3c555c on Prudentdev-xyz/telya:feat/FE-02-onboarding | Draft | Mock username fallback removed; 503 fail-closed availability; production validator tests; claim/lookup endpoints; fake Base toggle removed. Prudent reported 58 tests and typecheck/build passing; GitGuardian reported green. | Critical security: claim endpoint trusts body-supplied Stellar address, fabricates did:privy:stellar:<address>, and marks wallet verified without authenticating caller or proving account ownership. Use real verified session or cryptographic proof-of-control; atomic user/wallet/username binding; reject wallet already bound to another user; add auth and DB-backed race tests. Review comment posted: 7189269409. |
| [#49 Conversational experience](https://github.com/Alike001/telya/pull/49) | 56553d6312e3185a5c9410353e540e95124ecf7d on Prudentdev-xyz/telya:feat/FE-03-conversational-home | Draft | Timer-based success removed; txHash required by card; insufficient-funds result added; handle check and voice fallback injection removed. Prudent reported 70 tests, typecheck/build passing; GitGuardian reported green. | Critical: balances stay 0.00 and are never fetched; confirm sends placeholder func string + empty auth to an XDR relayer; no resolved recipient address; fees remain hardcoded; returned hash alone can be unverified. Must use actual Smart Account Kit signing + relayer XDR + persisted payment/receipt. Review comment posted: 7189270232. Includes onboarding changes from #46; rebase/reconcile after #46. |
| [#50 Buildathon docs](https://github.com/Alike001/telya/pull/50) | Merged as ab8d4f51ef43754568e10cb99e89a7266fb0d87b | Merged | Persistent Codex master playbook, live tracker, updated status, agent rules, universal handoff, README links and execution plan are now on main. Latest Vercel check passed before merge. | No PR action remains. Keep the tracker updated as tasks progress. |

### CI/deployment interpretation

At this refresh, Vercel checks on PRs #44/#46/#48/#49 have shown a Vercel Git authorization URL. This is an authorization barrier; it is not evidence that the application build failed and is not a successful deployment. The user must authorize the Vercel team/Git integration once. PR #50's Vercel check was success at the last status query. Recheck all statuses on current heads before merging.

Prudent reported GitGuardian green on #46/#49. Webghost reported GitGuardian green on #48. Verify the latest commit's actual security status before merge.

## 3. Existing verified product capabilities on main

- Public Testnet application and health endpoint.
- Canonical domain contracts and database migrations through 0005.
- Passkey-controlled Stellar Smart Account Kit create/reconnect, server-side sponsorship.
- Direct Stellar Testnet USDC with finality, exact recipient/amount verification, durable events and receipt restoration.
- Agent Pass allowed spend, cumulative over-limit rejection, owner revocation, post-revoke rejection and continued owner control.
- Responsive application shell/navigation and Testnet inspector.
- PR #47 judging/grant baseline merged in commit 846e4c887f2fb940f424edf37bc237a1d219c915.

The main-branch baseline previously recorded was 5 test files / 40 tests, with type generation, TypeScript and build passing. Do not confuse that baseline with test results from unmerged PR branches.

## 4. Remaining issue ledger

| Issue | Scope | Current state | Next action |
| --- | --- | --- | --- |
| [#16 Base/Circle CCTP](https://github.com/Alike001/telya/issues/16) | Base direct + CCTP orchestration, Circle attestation and state persistence | In PR #48 | Complete DB + Testnet evidence; keep stacked with #44. |
| [#12 Stellar CCTP](https://github.com/Alike001/telya/issues/12) | Stellar burn/mint, verification and recovery | In PR #44 | Coordinate with #48; prove bidirectional settlement. |
| [#5 onboarding](https://github.com/Alike001/telya/issues/5) | Passkey onboarding and durable unique username | In PR #46 | Fix authentication/proof of ownership and atomic wallet claim. |
| [#6 conversational home](https://github.com/Alike001/telya/issues/6) | Text/voice, balances, route review, confirm/cancel | In PR #49 | Replace all placeholders with actual balance, quote, recipient, signing and payment APIs. |
| [#15 backend orchestration](https://github.com/Alike001/telya/issues/15) | Contacts, conversations, recipient resolution, route/fee, payment/event persistence and idempotency | Open; previously assigned Webghost | Implement/reuse real authenticated service/API boundary; no duplicate of CCTP coordinator. |
| [#7 timeline/activity](https://github.com/Alike001/telya/issues/7) | Payment progress, refresh recovery, receipts and history | Open; previously assigned Prudent | Build only from persisted Payment + PaymentEvent and verified receipts. |
| [#8 Agent Pass/contacts/ramps/Judge mode](https://github.com/Alike001/telya/issues/8) | On-chain Agent Pass UI, verified contacts, add/withdraw and Testnet mode | Open; previously assigned Prudent | Connect existing on-chain evidence; truthful provider-unavailable state. |
| [#17 MoneyGram](https://github.com/Alike001/telya/issues/17) | MoneyGram Ramps sandbox | External blocker | Await partner enquiry and organizer guidance; require sandbox keys/domain allowlisting and written C-address compatibility. |
| [#18 integration acceptance](https://github.com/Alike001/telya/issues/18) | Full route matrix, refresh/retry/idempotency and failure recovery | Open; assigned Hammed | Run after the real API/UI journey is integrated; record exact results. |
| [#19 docs/demo](https://github.com/Alike001/telya/issues/19) | How to Test, demo evidence, architecture, known limitations and submission | Open | Update only after proven behavior; prepare video/pitch. |
| [#22 submission details](https://github.com/Alike001/telya/issues/22) | Exact cutoff/timezone, artifacts, video and public links | Open | Confirm with Buildathon organizer; record reply in DECISIONS.md. |

## 5. MoneyGram and organizer status

- Official MoneyGram Ramps contact enquiry submitted November 25, 2026, with product option MoneyGram Ramps.
- No email reply had arrived at the last user report.
- User plans to raise the blocker with the Buildathon admin during office hours on November 26.
- Partner registration requires a company-domain email; Telya is not incorporated and must not misrepresent that fact.
- The documented widget onboarding requires partner access and sandbox credentials. The documented non-custodial Stellar web quickstart uses a G-address; Telya uses a Smart Account Kit C-address.
- Codex must record every response and requirement. Do not submit duplicate enquiries without reason. Do not fake provider responses or weaken wallet architecture. Continue all other work while waiting.

## 6. Next execution queue

1. Re-review PR #48 head 481cbba, independently run current tests and validate four field ranges; apply migrations 0007/0008 to Neon, run DB-backed test, then perform real bidirectional Testnet proof if credentials/accounts are available.
2. Resolve PR #46 identity security: no fabricated Privy DID, no client-trusted wallet verification, authenticate the claimant and prove account ownership, make DB claim transaction-safe.
3. Wire Issue #15 real payment services: verified username → address, actual balances, actual route/fee quote, durable Payment and PaymentEvents, idempotent confirm.
4. Rework PR #49 to consume the actual APIs and real Smart Account Kit signed XDR. Do not show success from hash alone; use durable receipt verification.
5. Build Issue #7 from persisted payment events and verified receipts.
6. Build Issue #8 from real Agent Pass and contact state; MoneyGram visibly unavailable until partner approval.
7. Run Issue #18 full route/recovery matrix.
8. Complete Issues #19/#22, record organizer answers, teammate test pass, bug bash, demo recording and final submission.
9. Update this tracker and product/STATUS.md after each task. Never mark an issue complete before its acceptance evidence exists.

## 7. Human-controlled blockers

Codex must not ask Hammed to paste secrets into chat. Request a secure environment configuration/check only when required. Human actions may include:
- authorize Vercel Git integration/team so preview deployment can run;
- ensure the Codex environment has authorized write access to teammate PR forks;
- configure Neon direct connection and execute migrations through the documented migration runner;
- provide/authorize Testnet wallet access and approve small Testnet transactions;
- share MoneyGram/admin office-hour replies and any provider credentials through a secure environment;
- confirm official submission cutoff and required artifacts;
- run the final product with teammates as independent testers.

Keep the product moving on unblocked tasks while these actions are pending.
