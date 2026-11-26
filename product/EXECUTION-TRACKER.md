# Telya Execution Tracker

**Last refreshed:** November 26, 2026, 10:52 UTC (Issue #15 API mount in progress)
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
| [#48 Base/Circle CCTP](https://github.com/Alike001/telya/pull/48) | 481cbba0f8dbda55fe06a05fe43ca0edf9c2c9a6 on Webghost01-NG/telya:feat/base-circle-cctp-16 | Draft | Independently reran on this exact head: `pnpm test` 15 files / 104 passed / 1 PostgreSQL test skipped; typecheck, build, server TypeScript and diff check passed. Four Circle/Iris mutation ranges and zero placeholders inspected. GitGuardian passed. | `DATABASE_URL` and Testnet signing/provider credentials are absent in this workspace. Apply/verify migrations 0007/0008, run DB test, prove both directions with final recipient/amount and retry/restart evidence. Vercel check still leads to team authorization, not an app build log. |
| [#46 Onboarding/username](https://github.com/Alike001/telya/pull/46) | e8a4ca2 on Prudentdev-xyz/telya:feat/FE-02-onboarding | Draft | Codex pushed a guard to the existing branch: real Privy session required; claim runs only for an already verified Stellar wallet bound to that user; no fabricated DID or client-triggered wallet verification; lookup filters to verified wallets. `pnpm test` 6 files / 60 passed, typecheck, build, server TypeScript and diff check passed. [PR evidence comment](https://github.com/Alike001/telya/pull/46#issuecomment-7189831916). GitGuardian passed on the prior head; recheck the new head. | The browser still has no Privy access token or cryptographic wallet proof/binding flow; a new user's claim now fails closed. Prove sign-in, wallet ownership, atomic claim/reconnect and case-insensitive race in the real database. No `DATABASE_URL` here. Vercel team authorization remains pending. |
| [#49 Conversational experience](https://github.com/Alike001/telya/pull/49) | 56553d6312e3185a5c9410353e540e95124ecf7d on Prudentdev-xyz/telya:feat/FE-03-conversational-home | Draft | Timer-based success removed; txHash required by card; insufficient-funds result added; handle check and voice fallback injection removed. Prudent reported 70 tests, typecheck/build passing; GitGuardian reported green. | Critical: balances stay 0.00 and are never fetched; confirm sends placeholder func string + empty auth to an XDR relayer; no resolved recipient address; fees remain hardcoded; returned hash alone can be unverified. Must use actual Smart Account Kit signing + relayer XDR + persisted payment/receipt. Review comment posted: 7189270232. Includes onboarding changes from #46; rebase/reconcile after #46. |
| [#50 Buildathon docs](https://github.com/Alike001/telya/pull/50) | Merged as ab8d4f51ef43754568e10cb99e89a7266fb0d87b | Merged | Persistent Codex master playbook, live tracker, updated status, agent rules, universal handoff, README links and execution plan are now on main. Latest Vercel check passed before merge. | No PR action remains. Keep the tracker updated as tasks progress. |

### CI/deployment interpretation

At this refresh, PR #44 has successful Vercel, GitGuardian and preview-comment checks. Vercel checks on fork PRs #46/#48/#49 lead to a Vercel Git authorization URL. This is an authorization barrier; it is not evidence that the application build failed and is not a successful deployment. The user must authorize the Vercel team/Git integration once. PR #50 was merged with successful checks. Recheck all statuses on current heads before merging.

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
| [#15 backend orchestration](https://github.com/Alike001/telya/issues/15) | Contacts, conversations, recipient resolution, route/fee, payment/event persistence and idempotency | In progress on `feat/backend-api-mount-15`; existing services now have App Router routes for contacts, conversations, intent, voice, payment status and confirmation. Preview creation remains fail-closed without live balance/fee providers. | Wire trusted balances and quotes; bind passkey authorization/execution to durable payment; prove database behavior and idempotency. No duplicate of CCTP coordinator. |
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

1. PR #48 head 481cbba passed independent local review/build; obtain secure Neon/Testnet access, apply migrations 0007/0008, run DB-backed test, then perform real bidirectional Testnet proof. Keep draft.
2. Continue PR #46 after guard commit e8a4ca2: add browser Privy authentication and real Smart Account Kit proof-of-control/binding, then database-backed atomic claim/reconnect tests. Keep draft until live proof.
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

## 8. November 26 live audit and handoff

- `origin/main` was fast-forwarded locally to `a611173` after PR #50 merged. The missing playbook/tracker files were present on current main.
- Reviewed current PR heads, comments, reviews, review requests and CI for #44/#46/#48/#49/#50. #46/#48/#49 retain older changes-requested reviews, have no pending review requests and remain draft. No inline review threads were open on these PRs at this audit. Open issues #5/#6/#7/#8/#12/#15/#16/#17/#18/#19/#22 and prep #24 remain open.
- `DATABASE_URL`, sponsor secret, Base RPC URL, Circle API key and Privy environment variables were absent from this shell. The user was given steps to place the Neon direct URL in Git-ignored `.env.local` and authorize Vercel. No secret was requested in chat. Organizer details remain pending.
- PR #46's server guard is a security stopgap, not completed onboarding. Do not merge or mark Issue #5 complete until browser authentication, wallet ownership proof, database race tests and live reconnect are verified.
- Issue #15 API mounting branch builds with the new `/api/contacts`, `/api/conversations`, `/api/intent`, `/api/voice/transcribe`, `/api/payments` and `/api/payments/confirm` routes. The existing handler rejects payment preview creation with 503 until actual balance/fee providers are configured. Missing Privy configuration now yields 503 instead of a misleading 401 when a bearer token is supplied. Local checks: 6 test files / 42 passed, typecheck, build, server TypeScript and diff check passed. This is not live payment evidence and Issue #15 remains open.

Keep the product moving on unblocked tasks while these actions are pending.
