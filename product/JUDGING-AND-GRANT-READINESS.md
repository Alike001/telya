# Telya Judging and Grant Readiness Baseline

> **Live continuation note — November 26, 2026:** This document is a point-in-time assessment based on November 25 repository state, not the live PR ledger. PR #16 now has implementation work in PR #48; PR #48's latest Circle attestation-field fix is commit 481cbba, while database/Testnet acceptance evidence remains outstanding. PRs #46 and #49 have received further updates and still have blocking identity/payment-flow findings. For current facts, read [product/EXECUTION-TRACKER.md](EXECUTION-TRACKER.md), [product/STATUS.md](STATUS.md), and [product/CODEX-MASTER-PLAYBOOK.md](CODEX-MASTER-PLAYBOOK.md). The current execution sequence supersedes the historical snapshot below.

**Assessment date:** November 25, 2026

**Repository baseline:** `origin/main` at `c04a1ec`

**Assessment scope:** repository code, merged and open pull requests, open issues, automated checks, public Testnet deployment, and linked Testnet transaction evidence

This document is the factual readiness baseline for Telya. It does not replace the PRD, architecture, acceptance tests, or team ownership. A pull request description is not proof that a feature is complete.

## Status labels

- **Implemented and verified:** the implementation exists and its required automated, integration, or Testnet evidence was inspected.
- **Implemented but awaiting integration:** useful implementation exists, but it is not yet connected to the complete product journey or lacks required end-to-end evidence.
- **In progress:** active work exists, but the accepted behavior is incomplete or a blocking review/check remains.
- **Not implemented:** the required product behavior is absent from the inspected repository.
- **Requires external verification:** completion depends on provider access, official program information, user research, an independent review, or another fact outside repository evidence.

## Executive verdict

Telya is **not yet ready to declare the P0 product, the cross-chain demo, or a production launch complete**. It does, however, have substantive and verifiable Stellar depth:

- passkey-controlled Stellar smart accounts with server-side sponsorship;
- direct Stellar Testnet USDC settlement with recipient and amount verification;
- Agent Pass allowance, cumulative-spend, revocation, and owner-control enforcement; and
- a Stellar-side CCTP implementation in draft PR #44 with crash-recovery and idempotency work.

The critical path is now integration rather than invention. Issue #16 remains owned by @Webghost01-NG and has no implementation PR at the assessment date. PR #44 must remain draft until the Base/Circle coordinator is integrated and both CCTP directions have real destination recipient, amount, finality, and retry evidence.

### Evidence register

- Repository baseline: [`c04a1ec`](https://github.com/Alike001/telya/commit/c04a1ec)
- Canonical contracts and backend foundations: [PR #30](https://github.com/Alike001/telya/pull/30), [PR #33](https://github.com/Alike001/telya/pull/33), [PR #36](https://github.com/Alike001/telya/pull/36), and [PR #37](https://github.com/Alike001/telya/pull/37)
- Public shell and deployment readiness: [PR #38](https://github.com/Alike001/telya/pull/38) and [PR #45](https://github.com/Alike001/telya/pull/45)
- Verified Stellar work: [PR #40](https://github.com/Alike001/telya/pull/40), [PR #41](https://github.com/Alike001/telya/pull/41), and [PR #43](https://github.com/Alike001/telya/pull/43)
- Open integration work: draft [PR #44](https://github.com/Alike001/telya/pull/44), [Issue #16](https://github.com/Alike001/telya/issues/16), and [PR #46](https://github.com/Alike001/telya/pull/46)
- External-readiness tracking: [Issue #22](https://github.com/Alike001/telya/issues/22) and [Issue #24](https://github.com/Alike001/telya/issues/24)
- Public Testnet application: [telya.vercel.app](https://telya.vercel.app)

## 1. Official judging criteria

The Buildathon has communicated five criteria. No official numerical weights were supplied, so Telya must not invent weights or imply that any implementation guarantees a win.

1. Integration depth on Stellar.
2. Working demo and product functionality.
3. Real-world usefulness.
4. Innovation and novelty.
5. Pitching and presentation.

These criteria guide prioritization, but do not relax financial correctness or security requirements.

## 2. Current evidence and gaps by criterion

| Criterion | Status | Current evidence | Remaining gap |
| --- | --- | --- | --- |
| Stellar integration depth | **Implemented but awaiting integration** | Real Testnet smart-account creation/reconnection, sponsored direct USDC, durable receipts, and Agent Pass enforcement. Draft PR #44 implements the Stellar CCTP boundary and recovery behavior. | Integrate Issue #16, prove both CCTP directions, retain exact recipient/amount verification, and document external contract dependencies and assumptions. |
| Working demo and product functionality | **In progress** | Public application and health endpoint are live; database health is reported ready; direct Stellar and Agent Pass flows have real transaction evidence. | The account-to-intent-to-route-to-confirmation-to-settlement journey is not integrated in the public UI. PR #46 remains open; Vercel reports authorization is required before it can deploy the fork commit, and no preview build log exists for that attempt. Base, CCTP end-to-end, MoneyGram, and complete recovery UX are unfinished. |
| Real-world usefulness | **Requires external verification** | The PRD identifies freelancers, remote workers, small businesses, and digital-dollar users; the product hides chain mechanics behind usernames, routes, and verified outcomes. | Conduct and record genuine external user testing. Do not claim adoption, customers, volume, partnerships, or testimonials without evidence. |
| Innovation and novelty | **Implemented but awaiting integration** | Agent Pass proves restricted, revocable agent authority instead of unrestricted wallet access. The payment state model is designed around verified destination outcomes. | Demonstrate verified money movement through a complete cross-chain journey and surface Agent Pass controls in the product experience. |
| Pitching and presentation | **In progress** | Direct Stellar and Agent Pass provide credible fallback demonstrations with inspectable Testnet hashes and persistent evidence. | Prepare the single coherent demo, evidence manifest, recovery/failure path, verified official submission requirements, and presentation assets. Cross-chain claims must wait for real evidence. |

## 3. Product capability baseline

| Capability | Status | Evidence and qualification |
| --- | --- | --- |
| Public Testnet application and health | **Implemented and verified** | `https://telya.vercel.app` and `/api/health` returned HTTP 200 during this assessment; application and database checks reported `ok`. |
| Canonical domain contracts | **Implemented and verified** | Merged PR #30 established the shared types and passed its automated tests. |
| Database schema and readiness plumbing | **Implemented and verified** | Migrations through `0005` are represented on `main`; the deployed health endpoint reports database readiness. PR #44 adds later CCTP migrations that are not yet on `main`. |
| Authentication and durable username claiming | **In progress** | Backend schema/auth work exists, and PR #46 adds onboarding. The public end-to-end authenticated claim/reconnect flow is not yet accepted. PR #46 also contains a mock availability fallback on database failure and tests a duplicated validator rather than production code. Its Vercel status is an authorization blocker, not evidence of a build failure; no deployment record or build log was produced for the current fork commit. Its separate GitGuardian check flags a high-entropy value in public Stellar configuration and requires disposition before merge; the check alone is not proof that a secret was committed. |
| Stellar smart account lifecycle | **Implemented and verified** | Merged PR #40 includes real Testnet create, reconnect, silent restore, prompted passkey reconnect, sponsorship, and failure evidence. |
| Direct Stellar USDC payment | **Implemented and verified** | Merged PR #41 includes a real 0.5 USDC Testnet payment, finality, exact recipient verification, amount verification, durable events, and receipt restoration. |
| Agent Pass | **Implemented and verified** | Merged PR #43 includes real Testnet creation, allowed spend, overspend rejection, revocation, post-revocation rejection, and continued owner control. P0 remains direct Stellar USDC only. |
| AI and voice intent handlers | **Implemented but awaiting integration** | Framework-neutral handlers exist, but no mounted App Router endpoints, production-code tests, provider-outage proof, or complete UI fallback were found on `main`. AI remains parse-only. |
| Contacts, routing, fee preview, and payment orchestration | **Implemented but awaiting integration** | Merged server handlers and fail-closed provider boundaries exist. The handlers are not mounted in the public application, lack automated coverage, and intentionally exclude chain execution. Issue #15 remains open. |
| Payment movement and receipt UI | **In progress** | The shell communicates truthful states, but the complete live progression, refresh recovery, failure recovery, and receipt journey are not integrated for every P0 route. |
| Base-to-Base execution | **Not implemented** | No accepted Base execution implementation or real Base Sepolia settlement evidence was found. |
| Stellar-side CCTP | **Implemented but awaiting integration** | Draft PR #44 implements Stellar burn/mint verification, evidence reservation, replay recovery, and the shared Issue #16 seam. It is intentionally not complete end to end. |
| Base/Circle coordinator | **Not implemented** | Issue #16 remains open with no implementation PR. It is owned by @Webghost01-NG and must not be duplicated. |
| Bidirectional CCTP settlement | **Not implemented** | There is no real Base Sepolia-to-Stellar Testnet and Stellar Testnet-to-Base Sepolia destination evidence yet. Source confirmation alone is never completion. |
| MoneyGram provider access and smart-account compatibility | **Requires external verification** | Partner access has not been obtained. New widget integrations require partner sandbox credentials, and registration requires a company email. MoneyGram's Stellar non-custodial documentation passes a G-address, while Telya uses Smart Account Kit contract accounts; compatibility requires explicit provider confirmation. |
| MoneyGram sandbox flow | **Not implemented** | No provider implementation or accepted sandbox transaction evidence was found. No fake provider response or simulated completed payment may substitute for access. This external blocker does not interrupt direct Stellar, CCTP, or the core product journey. |
| External user validation | **Requires external verification** | No verified interviews, usability sessions, testimonials, customers, or usage metrics were found. |
| Official submission rules and cutoff | **Requires external verification** | Issue #22 remains open; exact cutoff/timezone, artifacts, rubric details, and video requirements must be confirmed from official sources. |

## 4. Competitive differentiation

Telya should be positioned as a verified money-movement product, not as an AI chatbot that happens to call payment APIs.

### Verified money movement

Telya joins natural-language intent to deterministic recipient resolution, route selection, fee presentation, explicit authorization, execution, destination finality, exact recipient/amount verification, and durable receipts. The user value is confidence about the outcome without needing to understand wallets, gas, bridges, or settlement mechanics.

### Controlled autonomous payments

Agent Pass gives an agent bounded authority: an owner-defined allowance and expiry, cumulative-spend enforcement, observable usage, and revocation. The owner does not hand unrestricted wallet authority to the model or agent. The real Testnet rejection and owner-control evidence is a meaningful advantage, but the product UI must make those controls understandable.

These pillars reinforce one another: Telya limits who may authorize money movement and verifies where the money actually arrived.

## 5. Stellar integration evidence and outstanding work

### Verified smart-account evidence

- Smart-account deployment: [`CD4TKTI6AOYCMVE5U2G6HQNWPLAP36ND3SXM4OLQMTD47AR6CL2C62YM`](https://stellar.expert/explorer/testnet/contract/CD4TKTI6AOYCMVE5U2G6HQNWPLAP36ND3SXM4OLQMTD47AR6CL2C62YM)
- Deployment transaction: [`6427d999de057f8745c096581f1eaf0451be09bbd29acd5754f5f5b321e85036`](https://stellar.expert/explorer/testnet/tx/6427d999de057f8745c096581f1eaf0451be09bbd29acd5754f5f5b321e85036), ledger `5914961`
- Re-login smart account: [`CBMK6GY4FJO6LFC2CBA7TAK4H76ZJOSPBIHEMWKVPNEF6QRYOT7AQP4P`](https://stellar.expert/explorer/testnet/contract/CBMK6GY4FJO6LFC2CBA7TAK4H76ZJOSPBIHEMWKVPNEF6QRYOT7AQP4P)
- Re-login deployment transaction: [`78ced56972c8c0c22873b46fe85c4c537dd1ce0deb5c9c8bf0af11da3af72b2f`](https://stellar.expert/explorer/testnet/tx/78ced56972c8c0c22873b46fe85c4c537dd1ce0deb5c9c8bf0af11da3af72b2f), ledger `5915005`
- The same sponsor funded both operations without exposing its key to the browser.

### Verified direct-USDC evidence

- Smart account: [`CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3`](https://stellar.expert/explorer/testnet/contract/CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3)
- Intended and verified recipient: [`GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW`](https://stellar.expert/explorer/testnet/account/GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW)
- Accepted amount: `0.5 USDC`
- Transaction: [`3e58eab868ebc75e0f0c8c128c8df779fa6f50e8cd6afd37bf8e6c6dc3db1e1e`](https://stellar.expert/explorer/testnet/tx/3e58eab868ebc75e0f0c8c128c8df779fa6f50e8cd6afd37bf8e6c6dc3db1e1e), ledger `5915869`
- Durable progression reached `completed` only after destination confirmation and recipient verification; the receipt restored after refresh.

### Verified Agent Pass evidence

- Smart account: [`CBV3RM6TUXSRPG2ZHVVXNKIGJZKOL2KQWPTOHRZFVHW7DIJGTG5U2QLP`](https://stellar.expert/explorer/testnet/contract/CBV3RM6TUXSRPG2ZHVVXNKIGJZKOL2KQWPTOHRZFVHW7DIJGTG5U2QLP)
- Allowance creation transaction: [`bb683c78b369e43b2cbb91696cf13eecea086a5fb3d0efd14db3386718524f13`](https://stellar.expert/explorer/testnet/tx/bb683c78b369e43b2cbb91696cf13eecea086a5fb3d0efd14db3386718524f13), ledger `5917312`
- Allowed `0.4 USDC` transfer: [`4aa9de4971dc8f300b3a4e326daabeeba74a987c9cc3b6969e137eae4b92ed84`](https://stellar.expert/explorer/testnet/tx/4aa9de4971dc8f300b3a4e326daabeeba74a987c9cc3b6969e137eae4b92ed84), ledger `5917322`
- Overspend was rejected with no transaction or balance movement.
- Revocation transaction: [`82039abc17fbb334551fb218b6e050ba7abc9637f96e8605f4a66671409ea58c`](https://stellar.expert/explorer/testnet/tx/82039abc17fbb334551fb218b6e050ba7abc9637f96e8605f4a66671409ea58c), ledger `5917461`
- Post-revocation agent spend was rejected with no movement.
- Owner post-revocation `0.1 USDC` transfer: [`249d59b88bdc9ef57d7a99491dfbb78382abe46a087d9265cb9f0b3b23825e28`](https://stellar.expert/explorer/testnet/tx/249d59b88bdc9ef57d7a99491dfbb78382abe46a087d9265cb9f0b3b23825e28), ledger `5917500`

### Independent ledger verification

The identifiers above are copied exactly from the merged evidence in PRs #40, #41, and #43. On November 25, 2026, Stellar Expert's Testnet API returned records for all five contract/account addresses and all seven transaction hashes at the ledgers shown above. Stellar Horizon independently returned `successful: true` for every transaction. The negative Agent Pass cases have no transaction by design and remain supported by the merged PR evidence rather than an explorer hash.

### CCTP boundary and required proof

PR #44 exposes the agreed seam:

- `settleBaseToStellarCctp(...)` accepts the trusted Base source hash plus Circle message and attestation, submits Stellar `mint_and_forward`, and may complete only after finalized exact-transfer verification.
- `reconcileStellarCctpSource(...)` verifies a finalized Stellar burn and records `source_confirmed` only. Issue #16 must still obtain the attestation, mint on Base, and verify the final Base recipient and amount.

Before PR #44 may be ready:

1. Issue #16 must persist and supply trusted burn amount and maximum fee separately from recipient amount.
2. Both directions must use real Circle CCTP Standard Testnet operations with Base domain `6`, Stellar domain `27`, and finality threshold `2000`.
3. Evidence must include source transaction, Circle message, attestation status, destination transaction, finality, exact recipient, accepted amount, and durable event sequence.
4. Duplicate callbacks, process restarts, and stale `destination_submitting` reservations must prove safe replay without duplicate financial execution.
5. Migration state must be verified in the configured environment. The handoff records `0006_stellar_cctp.sql` as applied; PR #44 also contains `0007_stellar_cctp_crash_recovery.sql`, which still requires environment-specific application and verification.

### MoneyGram external blocker

MoneyGram partner access has not been obtained, so Telya has no sandbox credentials and cannot truthfully implement or prove a provider transaction yet.

- MoneyGram's [Ramps overview](https://xramps.moneygram.com/ops/developer) says widget partners need sandbox API keys, and its [Stellar guide](https://xramps.moneygram.com/ops/developer/guides/web-stellar) describes distinct sandbox public/secret keys and a server-created session.
- The [partner registration form](https://xramps.moneygram.com/ops/partner/register) requires a company email and explicitly rejects personal email providers.
- The documented [non-custodial Stellar quickstart](https://xramps.moneygram.com/ops/developer/quickstarts/web-stellar) passes an end-user `G...` address into the session and expects the wallet to sign a USDC transfer to MoneyGram's deposit G-address.
- Telya's user wallet architecture is a Smart Account Kit Soroban contract account (`C...`), not a classic G-address. Contract-wallet support, signing callback expectations, memo handling, and cash-in destination compatibility require explicit confirmation from MoneyGram before implementation is accepted.

Until access and compatibility are confirmed, MoneyGram remains **Not implemented** and externally blocked. Telya must not use fake provider responses or simulated completed payments. This dependency does not block direct Stellar, CCTP, or the core product journey.

## 6. End-to-end demo acceptance requirements

The primary demo is accepted only when an unfamiliar user can complete this sequence without developer-only intervention:

1. Create or sign in to an account and claim a unique, case-insensitive username.
2. Create or reconnect the same Stellar smart account using a passkey.
3. Type or speak a request such as “Send 5 USDC to @alice.”
4. Review the resolved recipient, source, destination network, amount, route, fees, and explanation.
5. Explicitly confirm and complete the appropriate wallet/passkey authorization.
6. Observe real persisted states rather than timers or simulated success.
7. Reach `completed` only after destination finality and exact recipient/amount verification.
8. Refresh or reopen the application and recover the same payment and receipt.
9. Retry an interrupted callback or submission without creating a duplicate transfer.
10. Use a safe manual path when AI or voice is unavailable.

The evidence package for the demonstrated route must contain:

- public deployment URL and tested commit;
- Testnet source and destination hashes;
- explorer/provider links where available;
- sender, intended recipient, actual recipient, requested amount, fees, and accepted destination amount;
- persisted state/event transcript and final receipt;
- screenshots or recording of the normal path, refresh recovery, and one truthful failure path;
- automated test, typecheck, build, and security-check results; and
- a clear Testnet disclaimer.

The direct Stellar payment is the fallback demo if external cross-chain infrastructure is unreliable. That fallback must be described honestly and must not be presented as proof of CCTP completion.

## 7. OpenZeppelin and security readiness

### Current contract boundary

No Rust source or `Cargo.toml` was found in Telya. Telya currently invokes deployed smart-account, policy, token, and Circle contracts through TypeScript and the Stellar SDK; it does not own a custom Soroban contract in this repository. A custom contract must not be added merely to satisfy a judging criterion.

The official [OpenZeppelin Stellar Contracts repository](https://github.com/OpenZeppelin/stellar-contracts) labels the library experimental and provided as-is. The [Stellar Contracts documentation](https://docs.openzeppelin.com/stellar-contracts) includes account, access, ownership, pausing, upgrade, and utility modules, and notes that developers remain responsible for instance-storage lifetime. The [access-control documentation](https://docs.openzeppelin.com/stellar-contracts/access/access-control) distinguishes macros that enforce authorization from membership-only checks and describes a two-step administrative transfer. OpenZeppelin's [securing onchain systems guidance](https://www.openzeppelin.com/faqs/securing-onchain-systems) treats contracts, relayers, backends, and key management as one security scope and does not equate an internal review or library import with an independent audit.

### Required security work before an audit request

- Document all deployed contract IDs, networks, code/version provenance, privileges, upgrade controls, audit references, and security assumptions.
- Produce an authorization and trust-boundary model covering passkeys, smart accounts, sponsor, relayer, Agent Pass, Base wallet, Circle messages/attestations, and database writers.
- Inventory privileged roles and server-only secrets; verify rotation, least privilege, logging redaction, and incident procedures.
- Threat-model replay, duplicate callbacks, stale reservations, tampered XDR, mismatched recipient/amount, fee manipulation, forged Circle evidence, provider timeouts, and database partial failure.
- Keep sponsor and relayer allowlists, fee ceilings, rate limits, authenticated request binding, payload validation, idempotency keys, and fail-closed behavior under automated negative tests.
- Add integration and recovery tests for every financial state transition; add fuzz/property tests and invariants where financial rules benefit from generated inputs.
- Run dependency, secret, static-analysis, build, and deployment-configuration checks and record results against the tested commit.
- Prepare architecture, state-machine, dependency, known-limitations, and deployment-configuration documents for an independent reviewer.

If Telya later owns a custom Soroban contract, the team must first verify exact OpenZeppelin Stellar crate maturity, compatibility, and audit status; pin dependencies; enforce authorization at the contract level; use safe ownership/admin transfer; address storage lifetime and migration; treat upgradeability as privileged; and add contract-specific negative, fuzz, and invariant tests. Importing OpenZeppelin code does not make the resulting contract audited.

## 8. Long-term production and grant-funded milestones

### Stage 1 — Testnet product

**In progress.** Complete the P0 journey, all four supported route classes, real Testnet evidence, recovery and financial invariants, truthful UI, security baseline, and early user testing.

### Stage 2 — Controlled pilot

**Requires external verification.** Define supported users and corridors; satisfy provider onboarding; complete an independent security review; establish monitoring, reconciliation, support, incident response, key-management procedures, and explicit transaction/usage limits.

### Stage 3 — Limited production launch

**Not implemented.** Configure production networks and providers; complete relevant legal, regulatory, compliance, consumer-protection, and provider requirements; deploy production key custody and operational controls; use a controlled rollout with clear limitations.

### Stage 4 — Sustainable expansion

**Not implemented.** Expand only from demonstrated demand and operational evidence. Measure reliability, settlement time, support burden, retention, and unit economics before adding corridors or features.

Grant funding should be tied to measurable work: integration reliability, independent security review, controlled-pilot operations, user research, support tooling, provider readiness, and production hardening—not speculative feature count.

## 9. Prioritized implementation roadmap

1. **Protect the financial truth boundary.** Keep PR #44 draft. @Webghost01-NG completes Issue #16 on his branch; @Alike001 integrates only through the agreed seam. No competing Circle coordinator.
2. **Make onboarding truthful and durable.** Review PR #46 with @Prudentdev-xyz: authorize or otherwise obtain a real preview deployment, resolve the separate security gate, remove the silent mock username-availability fallback, exercise production validation code, and prove authenticated claim/reconnect persistence before merge. The current Vercel failure says authorization is required; it is not evidence that the production build failed.
3. **Connect existing backend capability.** Mount and test the AI/manual intent, contacts, routing, fee-preview, and payment APIs with authenticated, fail-closed provider adapters. Preserve the manual path when AI/voice is unavailable.
4. **Complete the visible payment journey.** Connect frontend confirmation, real state progression, refresh recovery, failures, and receipts to durable events—first for the already verified direct Stellar route.
5. **Prove bidirectional CCTP.** After Issue #16 is available, test both directions, exact destination values, duplicate callbacks, stale reservations, and process restarts; attach the evidence to PR #44 before marking it ready.
6. **Complete remaining P0 providers without blocking the core.** Implement and verify Base-to-Base within its owner's scope. Resume MoneyGram only after partner sandbox access and explicit Smart Account Kit contract-wallet compatibility confirmation. Do not imply provider availability before verification.
7. **Run external usability sessions.** Test the full journey with target users, record consented observations and failures, and prioritize fixes without fabricating testimonials or adoption.
8. **Package the demo and submission.** Confirm Issue #22 from official sources, create an evidence manifest, rehearse primary and fallback demos, and record a truthful Testnet presentation.
9. **Prepare controlled-pilot security.** Complete the threat model, operational controls, independent review scope, monitoring, and incident/reconciliation procedures before any production claim.

Work that does not improve one of these outcomes should be challenged before entering P0.

## 10. Evidence required before major features are complete

| Feature | Required completion evidence |
| --- | --- |
| Account, authentication, and username | Automated uniqueness/normalization and authorization tests using production code; database migration proof; authenticated claim and reconnect across sessions; database/provider failure that fails closed; no browser secrets. |
| Stellar smart account | Real Testnet creation, same-account reconnect, silent and prompted recovery, owner authorization, sponsor accounting/limits, failure behavior, durable mapping, and server-only sponsor key. |
| Direct Stellar USDC | Testnet hash, finality, token/asset identity, exact sender/recipient/amount, authorization, durable events, restored receipt, idempotent retry, and negative mismatch tests. |
| Agent Pass | On-chain/config evidence for allowance and expiry; cumulative-spend enforcement; allowed spend; overspend, expiry, revocation, and post-revocation rejection; owner control; transaction/balance evidence; no unrestricted AI key access. |
| AI and voice | Production-code schema tests, ambiguity and injection resistance, provider-outage behavior, no signing/key access, authenticated rate limits, and an equivalent manual flow. |
| Routing and fee review | Deterministic route-matrix tests, explicit ambiguous-network clarification, trusted balances/fees, provider failure that blocks confirmation, displayed fee/amount agreement, and authenticated recipient resolution. |
| Base-to-Base | Real Base Sepolia source and destination evidence, wallet authorization, finality, exact recipient/amount, fees, durable events, receipt recovery, and safe retry. |
| Base-to-Stellar CCTP | Confirmed Base burn/source, Circle message and attestation, Stellar destination transaction/finality, exact recipient/accepted amount, persisted state sequence, duplicate callback/restart/stale-reservation recovery, and no completion before destination verification. |
| Stellar-to-Base CCTP | Finalized Stellar burn with trusted burn amount/max fee, Circle message and attestation, Base mint/finality, exact recipient/accepted amount, persisted state sequence, duplicate callback/restart recovery, and source confirmation that remains nonterminal. |
| MoneyGram | Provider-issued sandbox credentials; explicit confirmation that the selected flow supports Telya's Smart Account Kit contract accounts or an approved production-shaped account boundary; verified corridor and terms; authenticated quote and consent; real sandbox lifecycle/webhooks; truthful cash-in/out state; failure/reconciliation; receipt; and no unsupported availability claim. |
| Public product demo | Tested deployed commit; unfamiliar-user completion; real state transitions; refresh/interruption recovery; manual fallback; accessible/responsive behavior; evidence manifest; no mocked financial success. |
| Production readiness | Independent security review and remediation, provider agreements, regulatory/compliance assessment, production key management, monitoring/alerts, reconciliation, incident response, support ownership, rollout limits, and controlled-pilot evidence. |

## Current verification record

On the assessed `main` commit:

- 5 test files and 40 tests passed;
- Next.js route type generation and TypeScript checking passed;
- the production build passed; and
- the public deployment and database health endpoint responded successfully.

These gates prove repository health for the tested commit. They do not prove the unmerged PRs, unavailable providers, cross-chain routes, or production readiness.
