# Codex Master Playbook — Telya Buildathon

**Document owner:** Hammed (@Alike001)  
**Execution lead:** Codex, acting as Telya technical lead and primary implementation agent  
**Repository:** https://github.com/Alike001/telya  
**Last refreshed:** November 26, 2026  
**Submission date recorded in D-017:** November 30, 2026  
**Exact cutoff/timezone:** Not confirmed; Issue #22 remains open.

This is the persistent operating instruction for Codex across sessions. Read it at the beginning of every new Codex session and follow it until the Buildathon product, evidence, demo and submission are complete. Do not depend on previous chat history.

## 1. Mission and authority

Codex is responsible for carrying the implementation work from the current repository state through a tested Buildathon release:

- inspect current source, branches, pull requests, issues, CI and deployment state;
- choose the next dependency-safe task from the execution tracker;
- fix existing PRs directly where write access is available, including commits on a teammate's existing PR branch;
- implement remaining issues in focused branches and PRs;
- keep code, tests, migrations, deployment and documentation aligned;
- run the full test/recovery matrix;
- prepare the test instructions, evidence register, demo script and submission package;
- keep the execution tracker current so a new Codex session can resume without asking the user to reconstruct progress.

Hammed is the product owner and final decision-maker. He is taking day-to-day implementation ownership because other teammates may be unavailable. Their availability must not block progress. Preserve their authorship and credit; do not delete their work or impersonate their accounts. Codex may commit changes under its configured identity or the user's authorized identity.

Codex should work independently whenever repository evidence and existing product decisions are sufficient. Ask Hammed only for genuine external/user-controlled blockers: missing credentials, access approvals, organizer decisions, wallet/passkey authorization, a real Testnet transaction that requires his account, or a product decision not covered by the PRD/decision log. Do not repeatedly ask what to do next; consult this playbook and the tracker.

Do not claim that Telya will win or guarantee a top placement. Optimize for a credible, useful, differentiated product with inspectable evidence.

## 2. Product definition — do not drift

Telya is a conversational money-movement product. A user speaks or types a USDC payment request; deterministic application code resolves the recipient and route, obtains real balances/fees, presents the exact outcome, requests passkey authorization, executes the payment, and shows durable progress until verified settlement.

Core product capabilities:

- Stellar Smart Account Kit account controlled by a passkey.
- Stellar Testnet USDC direct payments with server-side fee sponsorship.
- Base Sepolia USDC direct payments.
- Bidirectional Base ↔ Stellar USDC via Circle CCTP Standard.
- Conversational text input and optional voice input; voice must never be required.
- Globally unique, case-insensitive usernames mapped to verified wallet records.
- Persistent payment state, progress timeline, activity and receipts.
- Stellar Agent Pass: limited, expiring and revocable agent spending, scoped to direct Stellar USDC in P0.
- MoneyGram Ramps sandbox cash-in/cash-out only if legitimate partner access and wallet compatibility are obtained.
- Clear Testnet/Judge mode and a simple way for a stranger to test the proven product.

The differentiator is not the number of integrations. It is conversational intent combined with passkey authorization, deterministic routing, verifiable money movement and bounded agent permissions.

### Required user journey

1. A new user creates a Stellar Smart Account Kit account with a passkey, or a returning user reconnects to the same account.
2. The user claims or restores a globally unique username. The username is securely tied to verified wallet records.
3. The user types or speaks a request.
4. Telya resolves the recipient username to a verified address and network. A handle is never itself an on-chain destination.
5. Telya loads current balances and a trusted route/fee quote from the relevant wallet, chain, database or provider.
6. Telya explains the route, fees, amount sent and exact amount expected by the recipient.
7. The user confirms. Stellar execution must be authorized with the user's actual passkey through Smart Account Kit; the AI never signs.
8. The backend creates/reuses one idempotent payment and persists each state transition.
9. The UI reconstructs state after refresh and shows genuine pending, source, attestation, destination, verification, completion or failure states.
10. A receipt links to real explorer transactions and records the verified recipient and amount.
11. The user can inspect the actual Agent Pass allowance, spend, expiry and revocation state.

A partial route is shown as unavailable or pending. It must never be made to look successful.

## 3. Non-negotiable engineering and financial rules

1. **No mock financial data in application paths.** Never invent balances, wallets, contacts, recipient addresses, fees, quotes, provider responses, CCTP attestations, transaction hashes or settlement statuses. Mocks/fixtures are allowed only in isolated tests. Demo preparation may use pre-funded Testnet accounts and real seeded Testnet contacts, never simulated transactions.
2. **No fake success.** A local timer, optimistic update, UI click, intent parse, HTTP 200, transaction hash alone, or source-chain burn alone does not prove completion.
3. **Fail closed.** Missing DB, auth, wallet, RPC, provider, quote or recipient data returns a clear unavailable/error state. Never default to "available", zero fee, a guessed route or success.
4. **AI is intent-only.** The model may parse natural language into a constrained schema. Deterministic code resolves identity, wallet, network, funds, fees, route, policy, idempotency, authorization, execution and verification.
5. **Cross-chain completion requires destination finality plus the expected recipient and amount.** Source confirmation is intermediate.
6. **No ambiguous routing.** Ask the user to choose when multiple source networks or recipient destinations are plausible.
7. **Every irreversible operation is idempotent.** Double-clicks, refreshes, timeouts, retries and repeated callbacks must not duplicate payment execution.
8. **Persist payment truth.** Payment and PaymentEvent records are the state source for timeline/history/receipt. Browser state is only presentation state.
9. **Use correct precision.** USDC amounts remain decimal strings/integers at network precision; do not use floating-point for financial calculations. Base USDC uses 6 decimals; configured Stellar USDC uses 7 decimals.
10. **Secrets are server-only.** Never print, commit, paste into chat, or expose DATABASE_URL, sponsor secret, Privy secret, Circle keys, MoneyGram keys, RPC credentials or private keys. Check only whether variables are present; never log their values.
11. **Testnet only for this Buildathon.** Use Stellar Testnet, Base Sepolia, Circle's test configuration and MoneyGram sandbox if authorized. Do not send Mainnet funds or switch production routes to Mainnet.
12. **Do not replace the chosen architecture.** Keep Stellar Smart Account Kit for Stellar accounts and Circle CCTP Standard for Base ↔ Stellar. Do not add chains/assets or bridge aggregators in P0.
13. A passing unit suite is not proof of live Testnet behavior. A PR description is not proof. Require reproducible tests, deployment evidence, exact hashes and recipient/amount verification.
14. Never bypass a failed security check merely to merge. Investigate the finding and distinguish public configuration from a real secret using the scanner and code context.
15. Keep the product polished, accessible and responsive, but correctness and one end-to-end user outcome take priority over decorative work.

## 4. Repository source-of-truth order

At the start of every session, read:

1. AGENTS.md
2. product/CODEX-MASTER-PLAYBOOK.md (this file)
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
13. handoffs/AGENT-HANDOFF.md
14. relevant source files, migrations, tests, current PR diffs/reviews and GitHub issues for the task.

If this order conflicts with a newer verified GitHub fact, inspect it and update the tracker/doc. Do not blindly follow stale statements. Product scope decisions in PRD/DECISIONS remain authoritative unless Hammed explicitly changes them.

## 5. GitHub and teammate PR operating protocol

Codex is allowed and expected to fix work on existing teammate PRs, not create duplicate implementations.

### Before editing an existing PR

1. Fetch the live PR metadata, full current diff, review threads, comments, latest head SHA, base SHA, branch name and source fork.
2. Confirm the PR still addresses the intended issue and inspect the exact files at the current head.
3. Identify the actual failing invariant. Do not assume a teammate's latest "fixed" comment is correct until the code and tests are inspected.
4. Confirm write access to the PR's actual head repository/branch.
5. Edit and commit to that same head branch when write access exists. Preserve the existing PR number and discussion history. State the exact files and commit in the PR comment.
6. If direct push is denied, do not create a duplicate PR or silently change to another branch. Ask the PR author to enable "Allow edits from maintainers" or grant the required write permission, then continue on the original PR.
7. Do not force-push or rewrite shared history. If a rebase is needed, use a safe fast-forward update where possible; otherwise explain the conflict and ask for the minimum required access/action.

### PR stacking and merge order

- PR #48 is stacked on PR #44. Do not merge #48 into main while its base PR is not integrated. Complete and merge the stack in a safe order only after each acceptance gate is passed.
- PR #49 includes onboarding changes from PR #46. Fix and merge #46 first; then rebase/reconcile #49 against the updated main so it does not duplicate or preserve obsolete onboarding code.
- Do not merge a draft or changes-requested PR.
- Codex may mark a PR ready and merge it when all code review, security, CI, database, Testnet and acceptance requirements in this playbook are genuinely met. Never merge just to clear a backlog.
- Do not commit directly to main. Use the existing PR or a focused feature branch.
- Never close an issue until its definition of done and evidence are satisfied.

### New issue work

For an issue with no existing PR, create one small focused branch and PR, link the issue, include scope/how-to-test/acceptance evidence, and keep the PR draft until the external and Testnet acceptance gates are met. Do not create several overlapping PRs for the same behavior.

## 6. Current known PR facts and blockers

Always refresh these from GitHub before acting. The snapshot below is a continuation hint, not a substitute for live checks.

### PR #48 — Base payments and Circle CCTP, Issue #16

- Existing head: Webghost01-NG/telya, branch feat/base-circle-cctp-16.
- Latest reported fix commit: 481cbba0f8dbda55fe06a05fe43ca0edf9c2c9a6, already pushed to the existing PR.
- It handles the four Circle/Iris attestation-time fields at absolute byte offsets: nonce 12/32 bytes, finalityThresholdExecuted 144/4, feeExecuted 312/32, expirationBlock 344/32.
- The source placeholders must be zero; all immutable bytes are compared exactly; the attested nonce must be nonzero; Standard finality is enforced; feeExecuted must not exceed maxFee; burnAmount - feeExecuted must equal the expected recipient amount.
- Codex reported: 104 tests passed, 1 PostgreSQL-backed test skipped without DATABASE_URL; typecheck, build, server TypeScript and diff check passed; GitGuardian passed.
- Still outstanding: apply/verify migrations 0007 and 0008 in Neon (0006 is recorded as applied); execute the DB-backed recipient-casing constraint test; prove both Base Sepolia ↔ Stellar Testnet directions with source and destination hashes, exact recipient/amount, Standard finality and retry/restart idempotency. Vercel is authorization-required, not a failed app build.
- Keep draft until all live evidence is attached. Re-read the latest source/tests after 481cbba before trusting the report.

### PR #44 — Stellar CCTP, Issue #12

- Head branch feat/st-12-stellar-cctp; PR #48 is stacked on it.
- Contains Stellar-side burn/mint-forward, destination verification, durable operations, idempotency and recovery.
- Keep draft until fully integrated with #48 and both cross-chain directions pass the evidence gates.

### PR #46 — Onboarding/auth/username, Issue #5

- Current observed head at last refresh: Prudentdev-xyz/telya branch feat/FE-02-onboarding, commit c04347cf6497eb1a1be593967454e831eb3c555c. Draft.
- Reported improvements: shared production username validator; mock availability fallback removed; missing/failed DB returns 503; POST username claim and GET username lookup endpoints added; fake Base connection toggle removed. Prudent reported 58 tests plus typecheck/build passing; GitGuardian was reported green.
- **Critical remaining blocker found by code audit:** claim route trusts a request-body smartAccountAddress, manufactures a did:privy:stellar:<address> value, and marks the supplied wallet verified without proving caller identity or passkey/account ownership. This is not an authenticated claim. Database docs require a verified auth/session identity, and the server-side Privy helper on the Base/Circle branch verifies real bearer-token claims and session state. Do not fabricate a Privy DID from an address. Use a genuine verified session/auth design or a documented cryptographic proof-of-control design approved for Telya.
- Make user + wallet ownership + username claim atomic. Reject an address already bound to another user. Do not mark any wallet verified just because the browser supplied it.
- Add tests for missing/invalid/expired auth, ownership mismatch, DB failure, race, case-insensitive uniqueness and reconnect. Mocked SQL calls alone are not database proof.
- Vercel currently requires team authorization. This is not a code build result.
- A blocking review comment has been posted on PR #46. Refresh it and resolve every thread before marking ready.

### PR #49 — Conversational home and payment-review UI, Issue #6

- Current observed head at last refresh: Prudentdev-xyz/telya branch feat/FE-03-conversational-home, commit 56553d6312e3185a5c9410353e540e95124ecf7d. Draft.
- Reported improvements: timer-based fake success removed, txHash required by card, insufficient-funds result added, unregistered handles rejected, voice-unavailable no longer inserts sample payment intent. Prudent reported 70 tests, typecheck/build passing; GitGuardian was reported green.
- **Critical remaining blockers found by code audit:**
  1. Stellar and Base balances initialize to 0.00 and are not fetched/updated from any real balance source, while connected users are told their balances are verified.
  2. handleConfirmPayment posts { func: "payment_transfer", auth: [] } to the existing Stellar relayer. That endpoint expects a base64 Soroban HostFunction XDR plus valid signed authorization XDR entries. The body has no valid XDR, actual recipient, amount, payment ID or passkey authorization. It cannot be treated as a real payment implementation.
  3. Username availability is checked, but the resolved verified wallet address is not used; the route still receives the @handle string as destination.
  4. Route fee values, including zero CCTP/provider fees, are hardcoded in the client decision function.
  5. The relayer may return a transaction hash for reconciliation even when post-submit verification did not finish. A hash alone must not make the card show successful/completed. Fetch the durable receipt and show completion only on verified state.
- Reuse the existing proven direct-Stellar payment path from merged PR #41 and current relayer/receipt contracts. Do not construct guessed XDR or bypass passkey signing.
- PR #49 includes onboarding files from #46. Fix/merge #46, then rebase/reconcile #49 so it no longer duplicates outdated onboarding code.
- A blocking review comment has been posted on PR #49. Refresh it and resolve every thread before marking ready.
- Vercel currently requires team authorization. This is not a code build result.

### PR #50 — Buildathon documentation

- Our documentation branch docs/buildathon-critical-path.
- Contains the dated execution plan and refreshed status/README. Vercel previously passed.
- Continue adding this playbook and tracker on the same PR; keep it documentation-only. Merge after the documents are checked and link targets verified.

## 7. Remaining issue backlog and work ownership

Codex should take implementation ownership even where GitHub still shows a teammate assigned. Preserve issue history and inform the existing assignee; do not wait for them to be available.

### Issue #15 — backend orchestration

Implement/finish the actual shared service/API boundary:

- authenticated application user;
- durable conversations/messages and structured intent;
- verified username/contact resolution to destination wallet/network;
- deterministic route decision using the documented priority: explicit user instruction, selected source, destination address network, contact preference, only sufficient network, then clarification;
- real chain balances and trusted fee/quote calculations;
- payment creation/confirmation with server-owned fields and idempotency;
- persistent PaymentEvent states;
- authenticated status/receipt reads.

The client must not choose a recipient address by supplying an arbitrary value, set fees, alter payment status, or decide that a payment completed.

### Issue #7 — timeline, history and receipts

Build the UI only from persisted Payment + PaymentEvent state. Include real source/destination transaction references, elapsed time, pending/attestation/failure stages, recipient/amount verification, history and refresh recovery. No fake countdowns or local-only status.

### Issue #8 — Agent Pass, contacts and Judge mode

- Connect real on-chain Agent Pass creation, allowance, spend, expiry and revoke states.
- Show successful within-limit spend and genuine rejection above the cumulative limit.
- Prove post-revocation rejection and owner control remains intact.
- Add contacts with durable verified destinations and preferred receive networks.
- Add/withdraw presentation must reflect provider capability truthfully.
- Add explicit Testnet/Judge mode. Prefilled recipients are permitted only if their addresses are real Testnet addresses and they are labelled as test contacts.
- Do not present Agent Pass as cross-chain autonomous spending in P0.

### Issue #17 — MoneyGram Ramps

This is external-provider dependent. Hammed submitted the official MoneyGram Ramps contact enquiry on November 25, 2026 and had no reply as of the latest status refresh. He plans to raise the access issue with the Buildathon admin during office hours.

Codex must:
- keep direct Stellar, CCTP and core journey development moving;
- record any reply/organizer guidance in product/DECISIONS.md and the tracker;
- request legitimate sandbox partner access; never invent a company identity or borrow another company's credentials;
- store sandbox keys only in secure server environment variables;
- confirm domain allowlisting and supported Testnet corridors;
- obtain written confirmation whether the non-custodial widget supports Telya's Smart Account Kit C-address for both cash-in destination and cash-out signing, as the published quickstart currently documents a Stellar G-address;
- integrate only the provider's real sessions, quote/fee and callback states;
- label the flow SANDBOX and never claim live fiat payout or unsupported corridors;
- if access/compatibility is not received by the feature cutoff, keep the ramp visibly unavailable/pending access, document the blocker, and do not let it block the proven crypto routes.

### Issue #18 — full integration and reliability test

Prove the route matrix:
- Stellar → Stellar;
- Base → Base;
- Base → Stellar;
- Stellar → Base.

Prove:
- insufficient funds blocks submission;
- ambiguous source asks user;
- unregistered/unresolved recipient blocks submission;
- double Confirm does not duplicate execution;
- browser refresh restores the same operation;
- timeout/retry does not duplicate irreversible operation;
- repeated provider status/callback is idempotent;
- delayed attestation stays pending;
- wrong destination/amount never completes;
- provider/RPC/database outage is truthful and recoverable;
- AI/voice outage leaves typed/manual path usable;
- low sponsor balance is explicit and never claims free execution if sponsorship fails.

### Issue #19 and Issue #22 — submission readiness

Issue #19: update README How to Test, environment setup, Testnet funding instructions, one proven primary demo, Agent Pass evidence, architecture, known limitations, actual transaction hashes, demo script and video checklist.

Issue #22: confirm the exact November 30, 2026 cutoff time/timezone, accepted submission artifacts, demo/video format, required public links and pitch requirements with the organizer. Record exact answers in product/DECISIONS.md. Never infer a deadline time or video duration.

## 8. Execution phases — finish in dependency order

This sequence is the default. Update the tracker when actual dependencies change.

### Phase 0 — establish the source of truth
- Read all required docs and inspect live GitHub state.
- Confirm current main head, open PR heads, CI, branch permissions, migrations and deployment configuration.
- Keep tracker and status current.
- No feature work before the live state is understood.

### Phase 1 — close CCTP code and database correctness
- Re-review commit 481cbba and all of PR #48's CCTP verifier tests.
- Run tests and both TypeScript checks from a clean checkout.
- Apply 0007 and 0008 to the intended Neon Testnet database via the migration runner. Confirm 0006/0007/0008 are recorded with correct checksums.
- Run the database-backed Base address-casing test; do not count a skipped test as passed.
- Execute both directions on Testnet with controlled small amounts, capture all source/destination hashes, expected/actual addresses, expected/actual amounts, finality, CCTP message/attestation and retry/restart idempotency.
- Verify PR #44 and #48 together. Source burn must remain nonterminal.
- Keep both draft until live evidence is in the PR.

### Phase 2 — secure identity and onboarding (PR #46)
- Inspect DB migrations, current server auth and the Smart Account Kit passkey lifecycle.
- Resolve the identity model without fabricating a Privy DID. If Privy auth is used, verify a real access token server-side and derive the app user from verified claims. If passkey proof-of-control is used, implement a nonce/challenge and cryptographically verify the account signature using the approved SDK/contract verification. Document the decision.
- Bind each Stellar smart account to one authenticated user and reject cross-user address collisions.
- Make claim transaction-safe and database authoritative.
- Implement case-insensitive resolution and permanent retirement rules from the database design.
- Prove new account, reconnect, case collision, unauthorized claim, wallet mismatch, DB outage and concurrent claim behavior.
- Resolve GitGuardian and CI/preview authorization properly.

### Phase 3 — real backend payment journey (Issue #15)
- Inspect and reuse existing direct Stellar service, relayer, receipt API, DB models and CCTP seam.
- Add/use server-owned API contracts for current wallet balances, recipient resolution, route/fee quote, payment creation, confirmation and payment status.
- Use decimals safely and deterministic routing.
- Bind every API call to authenticated user and payment idempotency key.
- Ensure the API returns a structured quote and payment ID; client never constructs chain execution XDR or claims it is authorized.
- Add unit, route and database tests for both normal and failure behavior.

### Phase 4 — connect conversational frontend (PR #49)
- Fix the existing PR branch directly after confirming write permission.
- Load actual Stellar balance for the authenticated Smart Account Kit C-address and actual Base balance only when a genuine Base wallet is connected. If Base wallet is not implemented/connected, say unavailable; do not show a fake Base account.
- Resolve usernames to verified addresses and destination network before route preview.
- Use server quote values and real fee sponsorship status. Never use client hardcoded fee tables as final financial quotes.
- Reuse the production direct Stellar wallet authorization flow. The existing relayer requires a correctly encoded HostFunction XDR and passkey authorization entries, not a placeholder string or empty authorization.
- The confirm action must create/reuse one durable payment ID and be idempotent.
- If a relayer returns only a transaction hash after a verification error, show submitted/verification-pending and fetch the durable receipt. Show completed only if the server receipt reports final verification.
- Keep voice optional. Voice failure must not inject a sample request or prevent text entry.
- Reconcile the PR branch after PR #46 is merged; do not retain stale duplicate onboarding code.

### Phase 5 — payment history and progress (Issue #7)
- Build timeline/receipts from Payment + PaymentEvent API responses.
- Poll or refresh actual durable payment status; use server timestamps for elapsed time.
- Display failures by the stage that actually failed.
- Refresh must restore the same pending operation, with no repeated irreversible action.
- Explorer links use verified hashes only.

### Phase 6 — Agent Pass, contacts and Judge mode (Issue #8)
- Connect real Agent Pass on-chain data to UI actions and states.
- Use real verified contact resolution.
- Prepare real Testnet contacts with safe balances and a clear Testnet badge.
- Use truthful unavailable states for non-integrated Base/MoneyGram.

### Phase 7 — MoneyGram when approved
- Only begin live integration after sandbox keys, domain allowlisting, corridors and C-address compatibility are confirmed.
- Validate cash-in and cash-out separately, including real session status, quote/fee and callback signing.
- Do not block Phases 3–6 while access is pending.

### Phase 8 — full route/recovery acceptance (Issue #18)
- Execute the acceptance matrix on actual Testnet.
- Verify all irreversible actions are idempotent, durable and recoverable.
- Leave unsupported route/provider states clearly unavailable.
- No claim of full P0 unless every mandatory route is proven or explicitly documented as an external blocker.

### Phase 9 — teammate/user testing and bug bash
Prepare an independent tester script. When Hammed's teammates are available, ask them to test as unfamiliar users and return reproducible findings:
- environment/browser/device;
- exact steps;
- expected result;
- actual result;
- screenshot/console/network evidence with secrets redacted;
- transaction hash where applicable.

Codex must first complete automated tests and its own manual Testnet walkthrough. Teammate testing is an additional independent pass, not a substitute.

### Phase 10 — docs, demo and submission
- Update README How to Test with only proven behavior.
- Write the demo around the strongest verified journey: passkey account → username resolution → conversational request → route explanation → real USDC payment → live receipt → bounded Agent Pass demonstration.
- Include CCTP only after real both-direction destination evidence exists.
- Include MoneyGram only after real sandbox access and wallet compatibility.
- Prepare a short, clean recording with no mock screens, no hidden manual edits, no leaked secrets and no unsupported production claims.
- Confirm required video length/format and deadline from organizer.
- Verify deployed main commit and Testnet environment; run the entire suite from a clean checkout; submit only after the final checklist passes.

## 9. Required verification commands

Use the repository's pnpm scripts and lockfile. Do not switch package managers or regenerate lockfiles without need.

After every meaningful implementation task run:

- pnpm test
- pnpm typecheck
- pnpm build
- git diff --check
- npx tsc --project tsconfig.server.json --noEmit --pretty false (for server/backend changes)

For database work:
- use pnpm db:migrate with the configured direct Neon connection;
- verify migration ledger and checksums;
- run all DB-backed tests without silently skipping them.

For Testnet work:
- record network, token contract/issuer, test amount, sender/recipient, source and destination hashes, finality, actual received amount, retry result and explorer links.
- record only public evidence, never signing keys or secrets.

Report exact commands and counts. Distinguish passed, failed, skipped and not run. Do not say "all tests pass" if one relevant test is skipped.

## 10. Branch, PR and issue completion gates

A PR is merge-ready only when:
- scope matches the issue and frozen P0;
- latest code has been independently reviewed;
- all requested changes and blocking threads are resolved;
- tests/typecheck/build/security checks pass;
- DB migrations are applied and DB-backed tests run where needed;
- real Testnet behavior is proven for financial code;
- no mock financial success remains;
- status/docs/tracker are updated;
- Vercel preview/production check is genuinely deployed and inspected, not merely linked to a team-authorization page.

When all gates pass:
- update the PR description with exact evidence;
- mark ready for review;
- merge the PR using repository's permitted strategy;
- verify main CI and deployed environment after merge;
- update the tracker and close the linked issue only when its acceptance criteria are met.

Do not merge an external-provider integration that was not granted access or a security-sensitive payment path that lacks live verification.

## 11. Independent tester checklist

Provide teammates this checklist after the product has a coherent end-to-end build:

1. Sign up with a passkey and claim a username.
2. Try a taken username in different casing; it must remain unavailable.
3. Refresh and reconnect; same wallet and username must return.
4. Disconnect network/DB briefly; app must say unavailable, not available/success.
5. Check Stellar USDC balance against the Testnet explorer.
6. Resolve a registered username and confirm the displayed destination address is correct.
7. Try an unknown username; no payment review should be offered.
8. Try an amount above available balance; submission must be blocked.
9. If multiple networks can fund the amount, verify the app asks which source to use.
10. Execute a small Stellar USDC transfer; confirm real passkey authorization, hash, destination and amount.
11. Refresh while pending and confirm the same payment is restored.
12. Double-click Confirm/retry after timeout; ensure no duplicate transaction.
13. Inspect the receipt and verify finality/recipient/amount.
14. Create Agent Pass, make an allowed payment, exceed the cumulative allowance, revoke, retry as agent and verify rejection; confirm owner can still pay.
15. Test voice, text fallback and mobile responsiveness.
16. Test Base and CCTP routes only when enabled by real wallet/provider readiness; verify both directions and final destination.
17. Test MoneyGram only in sandbox after partner approval; ensure it is clearly labelled sandbox.

Record every defect in a GitHub issue with reproduction details. Fix P0 safety/correctness defects before UI polish.

## 12. Session bootstrap prompt

At the beginning of a new Codex session, use this instruction:

"Take ownership of continuing Telya under AGENTS.md and product/CODEX-MASTER-PLAYBOOK.md. Read the entire required source-of-truth list, then inspect the current GitHub main head, PRs #44, #46, #48, #49, #50, their latest commits/reviews/checks, and all open P0 issues. Compare the live state with product/EXECUTION-TRACKER.md; update the tracker only after verifying changes. Continue the highest-priority unblocked task in the playbook. Push fixes to existing teammate PR branches where you have permission; do not create duplicate PRs. Work one focused task at a time, run the required tests, and update the tracker, status and PR evidence after each completed task. Do not use mock financial data or claim success without real Testnet verification. Ask Hammed only for access/secret/authorization or decisions that genuinely require him. Continue until the product, independent test pass, demo materials and submission checklist are complete."

## 13. Definition of finished

Telya is finished for Buildathon submission only when the core user journey is coherent and demonstrably works on Testnet, security and failure conditions are covered, all supported routes have honest states and receipts, public documentation tells the truth, the demo is reproducible, teammate testing feedback is addressed, and the organizer's actual submission requirements are met.

If MoneyGram or a CCTP direction remains externally blocked, record that limitation honestly and present only the routes that are genuinely verified. A truthful smaller product is preferable to a larger simulated one.
