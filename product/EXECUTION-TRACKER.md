# Telya Execution Tracker

**Last refreshed:** November 26, 2026, 16:28 UTC (PRs #65/#66 safety review)
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
| [#48 Base/Circle CCTP](https://github.com/Alike001/telya/pull/48) | 9f8fe2b on Webghost01-NG/telya:feat/base-circle-cctp-16 | Draft | Four Circle/Iris mutation ranges and zero placeholders inspected. Official Circle tables confirm configured Base/Stellar Testnet CCTP addresses, USDC addresses and domains; the Stellar SDK derives the configured USDC SAC. [Address audit](https://github.com/Alike001/telya/pull/48#issuecomment-7192033085). Commit `9f8fe2b` adds a read-only Base Sepolia USDC balance reader with chain-ID validation and exact 6-decimal output; [PR evidence](https://github.com/Alike001/telya/pull/48#issuecomment-7192212141). Local validation on this head: 16 files / 108 tests passed / 1 PostgreSQL test skipped; typecheck, build, server TypeScript and diff check passed. GitGuardian passed. The migration runner compiled. | Direct Neon URL is present in Git-ignored `.env.local`, but this workspace's HTTPS and PostgreSQL connections to the resolved host still time out. Migrations 0006-0008 and DB test remain unverified; the user has terminal instructions. Testnet signing/provider variables remain absent. The Base balance reader is not yet exposed through an authenticated API or live wallet-proven. Prove both CCTP directions with final recipient/amount and retry/restart evidence. Vercel requires team authorization on the new fork commit; the prior preview redirected to SSO. |
| [#46 Onboarding/username](https://github.com/Alike001/telya/pull/46) | 2fab001 on Prudentdev-xyz/telya:feat/FE-02-onboarding | Draft | Real Privy session and previously verified owner wallet are required for claim and restoration; no fabricated DID or client-triggered wallet verification. Ready card no longer invents a zero balance or asserts biometrics. At c04301d: 6 files / 61 tests, client/server TypeScript and production build passed; at 2fab001: typecheck and diff check passed. [Latest PR evidence](https://github.com/Alike001/telya/pull/46#issuecomment-7191141573). | Browser Privy access token and cryptographic wallet proof/binding still absent; a new user's claim fails closed. React SDK install attempts failed on npm registry timeouts; no dependency change committed. Prove sign-in, wallet ownership, atomic claim/reconnect and case-insensitive race in real DB. Vercel team authorization remains pending. |
| [#49 Conversational experience](https://github.com/Alike001/telya/pull/49) | 8ba7ee5 on Prudentdev-xyz/telya:feat/FE-03-conversational-home | Draft | Codex cherry-picked #46's identity guard and owner-bound handle lookup, and removed invented balances, Agent Pass limits, fees, placeholder relayer submission and hash-only success from the app path. The composer gives a truthful unavailable response until verified payment review is wired. Parser preserves exact decimal text. At 3336eb6, `pnpm test` 7 files / 68 passed; typecheck, build, server TypeScript and diff check passed. At 8ba7ee5, the focused username suite passed 21 tests. [Latest PR evidence comment](https://github.com/Alike001/telya/pull/49#issuecomment-7190705349). | Full server-backed recipient, balance, quote, authorization, persisted progress and receipt are still absent. Reconcile inherited onboarding after #46 merges. Vercel still requires fork authorization. Keep draft. |
| [#65 Payment timeline/activity](https://github.com/Alike001/telya/pull/65) | fcb6dc1 on Prudentdev-xyz/telya:feat/FE-04-payment-timeline | Draft | Original branch added timeline, receipt and history presentation but trusted browser `localStorage` for financial state and inherited a placeholder relayer request. Codex replaced the mounted conversation with fail-closed PR #49 behavior, left activity unavailable until authenticated server history, corrected stalled detection to use the latest event, and removed an unproven funds-safety claim. [PR evidence](https://github.com/Alike001/telya/pull/65#issuecomment-7197671419). Local 9 files / 80 tests, typecheck, build and diff check passed; GitGuardian passed. | Presentation components remain unmounted until persisted Payment/PaymentEvent integration. Inherited onboarding must reconcile with #46. No authenticated refresh or live Testnet proof. Vercel fork authorization required. |
| [#66 Agent Pass/contacts/ramps/Judge UI](https://github.com/Alike001/telya/pull/66) | f4d2402 on Prudentdev-xyz/telya:feat/FE-05-agent-pass-contacts-ramps | Draft | Original branch added simulated MoneyGram fees/reference/success, seeded unverified contacts, hardcoded green route indicators and inherited unsafe payment code. Codex removed those application paths, carried PR #65's fail-closed conversation fix, retained navigation to honest pending views and the real Agent Pass panel, and cleared stale pass status on API failure. [PR evidence](https://github.com/Alike001/telya/pull/66#issuecomment-7197677506). Local 13 files / 90 tests, typecheck, build and diff check passed; GitGuardian passed. | Real authenticated contacts, provider-backed MoneyGram sandbox, Agent Pass browser proof, payment history and reconciliation with #46/#49/#65 remain. Vercel fork authorization required; no live user acceptance. |
| [#50 Buildathon docs](https://github.com/Alike001/telya/pull/50) | Merged as ab8d4f51ef43754568e10cb99e89a7266fb0d87b | Merged | Persistent Codex master playbook, live tracker, updated status, agent rules, universal handoff, README links and execution plan are now on main. Latest Vercel check passed before merge. | No PR action remains. Keep the tracker updated as tasks progress. |

### CI/deployment interpretation

At this refresh, PRs #44 and #53 have successful Vercel, GitGuardian and preview-comment checks. PR #48's previous fork preview deployed but its endpoints redirected to Vercel SSO; its new head `9f8fe2b` has GitGuardian green and Vercel authorization required. Fork PRs #46/#49/#65/#66 also lead to Git authorization URLs. This is an authorization barrier, not an application build result. Recheck all statuses on current heads before merging.

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
| [#15 backend orchestration](https://github.com/Alike001/telya/issues/15) | Contacts, conversations, recipient resolution, route/fee, payment/event persistence and idempotency | Draft [PR #53](https://github.com/Alike001/telya/pull/53) at `a4e69fe` mounts authenticated APIs, real read-only Stellar USDC balances and a persisted, owner-scoped payment history with stable keyset pagination. It removes the unproven authorization mutation and fixes zero-balance routing. Manual intents now must match the saved user message; preview creation checks amount plus sender-paid USDC fees against the server-read balance and rejects malformed quotes. On this head 11 files / 57 tests passed, client/server TypeScript and diff check passed; Vercel and GitGuardian checks passed. The local production build passed before the final quote-validation change; Vercel deployed the final head. A public Testnet SDK query returned `45,000,000` raw units (`4.5 USDC`) for the documented account. [Latest PR evidence](https://github.com/Alike001/telya/pull/53#issuecomment-7192394064). | Authenticated DB/API walkthrough and history pagination, trusted fee quote, wallet authorization, payment execution and idempotency remain. Preview endpoints redirect to Vercel SSO. |
| [#7 timeline/activity](https://github.com/Alike001/telya/issues/7) | Payment progress, refresh recovery, receipts and history | Draft PR #65 has presentation components; PR #53 has owner-scoped persisted history read API. The mounted app is fail-closed until integrated. | Wire authenticated Payment/PaymentEvent reads and verified receipt mapping, then prove refresh and live Testnet states. Do not close. |
| [#8 Agent Pass/contacts/ramps/Judge mode](https://github.com/Alike001/telya/issues/8) | On-chain Agent Pass UI, verified contacts, add/withdraw and Testnet mode | Draft PR #66 has Agent Pass UI and honest unavailable contacts/MoneyGram/Judge views after safety fixes. | Bind authenticated verified contacts and true pass state, obtain provider access, prove browser flows and reconcile stacked frontend branches. Do not close. |
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

1. PR #48 head 9f8fe2b passed local tests/typechecks/build and adds the read-only Base USDC balance building block; the direct Neon URL is configured but inaccessible from this workspace. Apply migrations 0006-0008 on a network that reaches Neon, run the DB-backed test, then perform real bidirectional Testnet proof. Keep draft.
2. Continue PR #46 after safety commit 2fab001: add browser Privy authentication and real Smart Account Kit proof-of-control/binding, then database-backed atomic claim/reconnect tests. Keep draft until live proof.
3. Wire Issue #15 real payment services: verified username → address, actual balances, actual route/fee quote, durable Payment and PaymentEvents, idempotent confirm.
4. PR #49 has been made fail-closed at `8ba7ee5`. Rework it to consume actual APIs and real Smart Account Kit signed XDR. Do not show success from hash alone; use durable receipt verification.
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
- A direct Neon `DATABASE_URL` is now present in Git-ignored `.env.local`; sponsor secret, Base RPC URL, Circle API key and Privy variables are still missing. No secret was printed. DNS resolves, but HTTPS and PostgreSQL TCP time out from this workspace. PR #48's migration runner was compiled, and the user has one-command terminal instructions for a network that reaches Neon. Organizer details remain pending.
- PR #46's server guard is a security stopgap, not completed onboarding. Do not merge or mark Issue #5 complete until browser authentication, wallet ownership proof, database race tests and live reconnect are verified.
- Draft PR #53 is on `feat/backend-api-mount-15`, now at `a4e69fe`. It mounts existing authenticated services and adds owner-scoped persisted payment history pages; `GET ?id=` still returns each payment's event timeline. Manual payment intent can no longer replace the saved message's amount, recipient or explicit networks; a quoted sender-paid USDC fee is included in the affordability check, and malformed fee quotes fail as provider-unavailable. A public `rpc.Server.queryContract` balance read returned `isReadCall: true` and `45,000,000` raw units (`4.5 USDC`) for the documented Testnet smart account. [Latest PR evidence](https://github.com/Alike001/telya/pull/53#issuecomment-7192394064). This is not an authenticated `/api/balances`, history or DB walkthrough; the PR preview redirects to Vercel SSO. Base remains unavailable; trusted fee quote/payment creation fail closed. Both the public confirmation route and its exported helper/service mutation were removed because a click is not wallet authorization. Branch validation on latest head: 11 test files / 57 passed, client/server TypeScript and diff check passed; a local build passed before the final quote-validation change, and Vercel/GitGuardian passed on the latest head.
- PR #49 remains draft at `8ba7ee5`. The inherited #46 guard and owner-bound lookup were cherry-picked temporarily, and fake client financial states were removed. This preserves the PR and its authorship while preventing a fake success path. The complete UI issue remains unfinished. Vercel still leads to team authorization; GitGuardian passed on this head.
- PR #48 received `9f8fe2b` on its existing fork branch: read-only Base Sepolia USDC `balanceOf`, Base chain-ID check, exact decimal formatting and fail-closed malformed result handling. The 16-file suite passed 108 tests with one PostgreSQL test skipped; typecheck, server TypeScript, build and diff check passed. This code is not yet wired into `/api/balances` and no live Base wallet balance has been claimed. GitGuardian passed on the new head; Vercel reported authorization required, not an application build failure.
- PRs #65/#66 were opened ready with unsafe financial application paths and were returned to draft. PR #65 at `fcb6dc1` now keeps browser payment history unavailable until authenticated persisted state is wired; PR #66 at `f4d2402` removes simulated MoneyGram settlement, fees and reference codes, invented contact addresses, hardcoded green route indicators and inherited client payment claims. Both branches passed local tests/typecheck/build/diff and GitGuardian on their new heads; Vercel requires fork authorization. The UI feature claims in the original PR descriptions are not completion evidence. [#65 review](https://github.com/Alike001/telya/pull/65#issuecomment-7197246685), [#66 review](https://github.com/Alike001/telya/pull/66#issuecomment-7197251441).
- Public `https://telya.vercel.app/api/health` returned HTTP 200 with application/database `ok` at 11:10 UTC on November 26. This checks the deployed main health endpoint, not an unmerged PR preview or migration 0007/0008.

Keep the product moving on unblocked tasks while these actions are pending.
