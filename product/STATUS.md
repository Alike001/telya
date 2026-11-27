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

PR #67 merged as `d87ae75`, recording the safety corrections on draft PRs #65/#66. PR #48's CCTP migrations `0001`–`0008`, PR #53's Payment handoff migrations `0009`–`0010`, and PR #66's Agent Pass/deployment handoffs `0011`–`0012` are recorded in Neon. Their PostgreSQL regressions passed.

## Readiness verdict

Telya has independently inspectable Stellar Testnet foundations, but the complete P0 consumer journey and bidirectional cross-chain demo are not yet proven. The final submission date recorded in decision D-017 is **November 30, 2026**; exact cutoff/timezone remains unconfirmed in Issue #22.

The canonical production host `https://telya.vercel.app` is healthy with application/database checks ready. Vercel has the production WebAuthn RP ID/origin and the official Base Sepolia RPC (`84532`) for all environments. Its secret-safe environment listing confirms Privy ID/secret key presence in Development/Preview/Production and `STELLAR_FEE_SPONSOR_SECRET` as a hidden Secret in Preview/Production. A Ready Preview deployment at 07:24 WAT and a Ready Production deployment at 08:12 WAT both postdate that Vercel secret record; the latter owns the canonical alias and its health endpoint is ready. No Vercel value was exported, so the deployed secret's public-key identity has not been cryptographically compared with the locally verified sponsor.

The local full preflight is now entirely ready, and the focused environment/relayer suite passed 28/28. Without displaying the seed, the SDK derived Testnet account `GBM35DI75UZ2TDVYMGBKBUMRQTZIVTZZTI2ULJ24UHH4ONI23IBYKNOP` and Horizon reported `10000.0000000 XLM`, zero subentries and the expected single Ed25519 signer. A minimal 1-stroop self-payment proved local construction, signing, submission and Testnet confirmation in ledger `5,947,990`; transaction [`338a4c08…bf5de`](https://stellar.expert/explorer/testnet/tx/338a4c0876cd0b8c0d22ee27e6e23e70ccaa14bb9ed9673f0d1dc1bb824bf5de) charged 100 stroops and left `9999.9999900 XLM`. This is sponsor-key operability evidence only, not a smart-account authorization, relayer acceptance, user payment, USDC transfer or CCTP settlement.

End-to-end acceptance preparation now runs the exact integrated PR #66 head locally. The credential-free Testnet probe passed again at Stellar ledger `5,948,211`, verifying Base Sepolia `84532` plus deployed Base USDC/CCTP bytecode and every configured Stellar verifier, policy, USDC and CCTP interface. The real Privy login modal opens at `http://localhost:3000/onboarding` with no application console error on the canonical localhost origin. Unauthenticated runtime probes returned 401 before sponsor use for deployment authorization, direct-Stellar authorization, Agent Pass authorization, the protected payment relayer and the protected deployment relayer. A direct PR #66 Vercel Preview attempt was rejected before build by the free-tier `api-deployments-free-per-day` limit after more than 100 deployments in 24 hours; Production was not replaced with the draft branch. The deployed sponsor identity remains unverified until a PR #66 Preview can be built after the quota resets or the team owner raises the limit.

The first authenticated local acceptance stage has now passed. A real Privy session authorized one one-use deployment handoff, which was consumed before the protected relayer sponsored the passkey smart-account deployment. Username `@alike` is persisted against verified Testnet account `CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R`. Horizon independently reports deployment transaction [`f0341f1e…97d06`](https://stellar.expert/explorer/testnet/tx/f0341f1e9f5346fcd29962bc34196b9ad0434cb69771f36ea7bbee0bba697d06) successful in ledger `5,948,219`, sourced and fee-paid by the verified sponsor, with one `CreateContractV2` host-function operation and 166,273 stroops charged. Stellar RPC resolves the resulting C-address as an 18-method smart account. The authenticated passkey challenge/bind and username claim each returned 200. This proves local protected deployment relayer acceptance, sponsor identity and passkey ownership binding; reconnect, cancelled-prompt handling and case-insensitive second-user collision remain untested, and it does not prove the hidden Vercel sponsor identity.

Read-only USDC balance checks show the new smart account at `0 USDC` and prepared recipient `GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW` at `1 USDC`. A real direct payment cannot be authorized until Hammed funds the new C-address with Stellar Testnet USDC through the Circle faucet; no balance is being invented or substituted.

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
Open draft on Webghost01-NG/telya at `05531f5`. Guarded source/destination state, exact attestation/mint evidence, canonical Stellar hashes and authenticated owner-scoped Base balances remain in place. Its strict Circle Testnet Standard quote primitive is mounted in both CCTP payment reviews by PR #53 and propagated through the frontend stack; no duplicate implementation is needed in PR #48. With `DATABASE_URL`, 150 tests passed across 22 files, including five PostgreSQL cases; plain passed 145 with those cases skipped. Both TypeScript checks, build, diff check and GitGuardian passed. [Latest PR evidence](https://github.com/Alike001/telya/pull/48#issuecomment-7206252803). Vercel requires fork authorization. The local public RPC now verifies Base Sepolia chain `84532` and deployed code at USDC, TokenMessenger and MessageTransmitter, but no authenticated balance or real bidirectional settlement/retry proof exists. Keep draft.

### PR #46 — onboarding/auth/username, Issue #5
Open draft on Prudentdev-xyz/telya, now at `dd69a3d`. Stellar claims require a verified Privy session and fresh passkey assertion against the live Testnet smart account; Base binding re-fetches Privy's exact verified Ethereum wallets. The username claim boundary now has Neon proof that another authenticated user cannot claim or reserve a name through the owner's verified smart account, while the exact owner succeeds. Secure-env: 72/72; plain: 69 passed / 3 skipped. Both TypeScript checks, corrected build, diff check and GitGuardian passed. [PR evidence](https://github.com/Alike001/telya/pull/46#issuecomment-7208401775). Vercel requires fork authorization. **Still unverified:** real browser Privy wallet link/switch, passkey binding, authenticated claim/reconnect and preview. Keep draft.

### PR #49 — conversational experience, Issue #6
Open draft on Prudentdev-xyz/telya at `64ab352`. All four routes retain protected execution/recovery and guarded finalized failures; current PR #46 wallet-bound username claims are merged without duplication. Secure-env: 294/294; plain: 280 passed / 14 skipped; full build gates and GitGuardian passed. [PR evidence](https://github.com/Alike001/telya/pull/49#issuecomment-7208509335). No real browser wallet/passkey or signed Testnet proof. Keep draft.

### PRs #65 and #66 — timeline, activity, Agent Pass and supporting UI, Issues #7/#8

[PR #65](https://github.com/Alike001/telya/pull/65) is now at `8f64801`. Authenticated owner-scoped history, persisted timelines, non-signing refresh, exact receipt gating and current PR #49 are integrated. Secure-env passed 310/310; plain passed 296 with 14 skips; full build gates and GitGuardian passed. [PR evidence](https://github.com/Alike001/telya/pull/65#issuecomment-7208509190). Live failed/completed browser refresh and Testnet receipt remain unverified. Keep draft.

[PR #66](https://github.com/Alike001/telya/pull/66) is now at `bf800e3`. Local full preflight, sponsor balance/key control, authenticated protected deployment, passkey ownership binding, real smart-account deployment and 20-USDC Testnet funding pass as recorded above. The first direct-payment review exposed a parser/validator mismatch: `on Stellar` was parsed as an explicit source but rejected by saved-message validation. The fix aligns `from`/`on`/`via` and passed focused 5/5, secure Neon-backed 390/390, plain 372 with 18 explicit skips, both TypeScript checks, production build, 215-file client-secret scan, clean audit and diff check. No Payment or transfer occurred on the rejected attempt. The GitHub Vercel check still requires teammate-fork authorization and the direct Preview is quota-blocked; direct payment/receipt, Agent Pass and CCTP live proof remain open. Keep draft.

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
3. Prove PR #49's four payment-bound routes in a real browser: Privy authentication, exact Stellar passkey/Base wallet, direct/Circle submission, persisted source recovery and verified final recipient/amount. The Base-source authorizations are now wired without duplication.
4. Prove PR #49's protected direct-Stellar confirmation in a real Privy/passkey browser session and signed Testnet payment; it refuses hash-only success and recovers duplicate/interrupted actions without resubmission.
5. Prove PR #65 authenticated browser pagination/refresh and a real Testnet submitted-to-completed timeline/receipt; its integrated head is `8f64801`.
6. Complete the funded direct-Stellar review, passkey authorization, reconciliation and durable receipt on PR #66 `bf800e3`; then run Agent Pass and CCTP live acceptance. After the Vercel 100-deployments/day window resets (or the team limit is raised), deploy/authorize the preview and prove the hidden Vercel sponsor identity through the same protected flow. MoneyGram remains externally blocked.
7. Continue Issue #18 end-to-end route/recovery matrix. Automated AI/manual, voice/text and duplicate/interrupted-response recovery are proven; real browser/provider outage and route evidence remain open.
8. Complete Issue #19/#22, independent teammate testing, bug fixes, demo and submission.

See the [Codex Master Playbook](CODEX-MASTER-PLAYBOOK.md) for the full start-to-finish instructions and the [Execution Tracker](EXECUTION-TRACKER.md) for current task status and human-controlled blockers.

## Submission package progress

[SUBMISSION-PACKAGE.md](SUBMISSION-PACKAGE.md) now gives a stranger a no-wallet evidence path, local setup and truthful Testnet funding guidance, the exact verified direct-Stellar and Agent Pass hashes, architecture, a modular demo script, recording checks and known limitations. It is intentionally marked draft: the integrated browser journey, independent user pass, organizer-confirmed format/cutoff, final video and submission confirmation are not yet verified.

At 03:00 UTC on November 27, the public health endpoint remained ready and Stellar Testnet Horizon returned successful records at the documented ledgers for the direct payment and all four positive Agent Pass transactions. This is a current public-evidence recheck, not proof of the unmerged integrated journey.

[INDEPENDENT-TESTING.md](INDEPENDENT-TESTING.md) now provides the unfamiliar-user script required after engineering acceptance. It gates live actions on ready credentials and prepared Testnet accounts, captures exact recipient/amount/finality/recovery evidence, keeps CCTP disabled until accepted, and includes secret-redacted bug and session-verdict formats. It has not yet been executed, so independent testing remains open.

[EVIDENCE-MANIFEST.md](EVIDENCE-MANIFEST.md) now separates accepted public Testnet proof from live-browser, database, automated, prepared and externally blocked evidence. It preserves the exact verified Stellar hashes while marking the integrated UI, Base, both CCTP directions, MoneyGram and independent testing unverified.

The submission package now includes the exact PR #66 head and commands for reproducing its read-only public Testnet probe. The evidence manifest records Base/Stellar contract readiness separately from financial proof; neither CCTP direction is upgraded without authenticated source and verified destination evidence.

Issue #19's README now gives strangers a no-wallet health/explorer/evidence path before local setup, and the submission package includes the previously missing Mainnet roadmap. Mainnet remains gated on independent review, fresh production contracts/providers, operational controls and exact production acceptance; no Testnet proof is promoted to Mainnet readiness.

[JUDGING-AND-GRANT-READINESS.md](JUDGING-AND-GRANT-READINESS.md) now reflects merged main `2531820` and integrated PR #66 `e2f731a` instead of the obsolete November 25 implementation snapshot. It records PR #48/#53 orchestration, migrations through `0012`, current automated/database/public-network evidence and the remaining authenticated/live-provider gates without claiming Base or CCTP completion.

[CODEX-MASTER-PLAYBOOK.md](CODEX-MASTER-PLAYBOOK.md) now uses the current PR #44/#46/#48/#49/#53/#65/#66 heads and verified migration state. Its phase instructions no longer direct operators to repeat migrations `0007`/`0008` or rebuild already-integrated identity, orchestration and conversational primitives; live authenticated wallet, signed Testnet and destination-finality evidence remains the next acceptance gate.

## November 26 backend progress

Draft [PR #53](https://github.com/Alike001/telya/pull/53) stacks PR #48 without duplication and is at `d20dddd`. All four routes have fail-closed reviews and persisted authorization/first-hash recovery. Definitive finalized Base direct, source-burn and destination-mint mismatches now atomically fail only the exact saved operation/Payment/hash and record the true verification stage; Neon parsed all three guarded transitions. Exact finality, recipient and amount still gate completion. No live browser wallet walkthrough or transaction was performed.
