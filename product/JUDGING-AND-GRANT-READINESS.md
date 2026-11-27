# Telya Judging and Grant Readiness

**Last refreshed:** November 27, 2026

**Merged baseline:** `origin/main` at `2531820`

**Integrated draft baseline:** PR #66 at `f3f4870`

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

The critical path is now authenticated live acceptance rather than missing product code. PR #48 implements the Base/Circle boundary; PR #53 mounts deterministic orchestration; PRs #46/#49/#65/#66 carry the integrated onboarding, conversational, timeline and Agent Pass stack. These PRs remain draft because Privy/sponsor credentials, preview authorization and real signed Testnet evidence are still missing. PRs #44/#48 must remain draft until both CCTP directions have exact destination recipient, amount, finality and retry/restart evidence.

### Evidence register

- Merged baseline: [`2531820`](https://github.com/Alike001/telya/commit/2531820e3ebe831c4b914d1e023a10f1cdc6d87f)
- Canonical contracts and backend foundations: [PR #30](https://github.com/Alike001/telya/pull/30), [PR #33](https://github.com/Alike001/telya/pull/33), [PR #36](https://github.com/Alike001/telya/pull/36), and [PR #37](https://github.com/Alike001/telya/pull/37)
- Public shell and deployment readiness: [PR #38](https://github.com/Alike001/telya/pull/38) and [PR #45](https://github.com/Alike001/telya/pull/45)
- Verified Stellar work: [PR #40](https://github.com/Alike001/telya/pull/40), [PR #41](https://github.com/Alike001/telya/pull/41), and [PR #43](https://github.com/Alike001/telya/pull/43)
- Open integration work: draft [PR #44](https://github.com/Alike001/telya/pull/44), [PR #48](https://github.com/Alike001/telya/pull/48), [PR #53](https://github.com/Alike001/telya/pull/53), [PR #46](https://github.com/Alike001/telya/pull/46), [PR #49](https://github.com/Alike001/telya/pull/49), [PR #65](https://github.com/Alike001/telya/pull/65), and [PR #66](https://github.com/Alike001/telya/pull/66)
- Submission evidence: [submission package](SUBMISSION-PACKAGE.md), [evidence manifest](EVIDENCE-MANIFEST.md), and [independent tester runbook](INDEPENDENT-TESTING.md)
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
| Stellar integration depth | **Implemented but awaiting live integration proof** | Real Testnet smart-account creation/reconnection, sponsored direct USDC, durable receipts and Agent Pass enforcement. PR #44 implements the Stellar CCTP boundary/recovery; PR #53 and PR #66 bind the exact reviewed Payment to protected relayer execution. | Prove the integrated passkey/browser flow and both CCTP directions with exact recipient/amount/finality evidence. |
| Working demo and product functionality | **In progress** | Public application and health endpoint are live; direct Stellar and Agent Pass foundations have real transaction evidence. The integrated draft includes authenticated onboarding, deterministic intent/review, all four routes, persisted timelines/receipts, contacts and Agent Pass administration/spending. | The integrated stack is not deployed or live-accepted. Privy/sponsor values and teammate-fork Vercel authorization are absent. Base, CCTP and current browser journeys have no signed end-to-end evidence; MoneyGram is externally blocked. |
| Real-world usefulness | **Requires external verification** | The PRD identifies freelancers, remote workers, small businesses, and digital-dollar users; the product hides chain mechanics behind usernames, routes, and verified outcomes. | Conduct and record genuine external user testing. Do not claim adoption, customers, volume, partnerships, or testimonials without evidence. |
| Innovation and novelty | **Implemented but awaiting current-browser proof** | Agent Pass has real restricted/revocable Testnet evidence. PR #66 adds owner-bound one-use administration, current-ledger expiry and exact reviewed Payment execution with a memory-only delegated signer. | Demonstrate the current UI in one authenticated browser session and retain the exact rejection/revocation evidence. |
| Pitching and presentation | **In progress** | Direct Stellar and Agent Pass provide credible fallback demonstrations with inspectable hashes. A submission package, evidence manifest, architecture, no-wallet path, independent-test runbook and 30-second fallback script exist. | Confirm organizer cutoff/artifacts/video format, run independent testing, record the exact deployed commit and produce the final video/submission links. Cross-chain claims must wait for real evidence. |

## 3. Product capability baseline

| Capability | Status | Evidence and qualification |
| --- | --- | --- |
| Public Testnet application and health | **Implemented and verified** | `https://telya.vercel.app` and `/api/health` returned HTTP 200 during this assessment; application and database checks reported `ok`. |
| Canonical domain contracts | **Implemented and verified** | Merged PR #30 established the shared types and passed its automated tests. |
| Database schema and readiness plumbing | **Implemented and database-verified in drafts** | Main retains migrations through `0005`; Neon has recorded PR #44/#48 CCTP migrations `0006`–`0008`, PR #53 Payment handoffs `0009`–`0010`, and PR #66 Agent Pass/deployment handoffs `0011`–`0012`. Their PostgreSQL regressions passed. Unmerged schema is not yet part of the public deployment. |
| Authentication and durable username claiming | **In progress** | PR #46 requires a verified Privy session, exact server-re-fetched Base wallet and fresh passkey assertion against the live Stellar smart account. Username checks fail closed on DB/auth failure; Neon proves case-insensitive uniqueness and that another owner cannot claim through the verified wallet. Its exact head passes tests, build and GitGuardian. **Remaining:** real Privy wallet link/switch, passkey binding, authenticated claim/reconnect and deployed preview; Vercel requires fork authorization. |
| Stellar smart account lifecycle | **Implemented and verified** | Merged PR #40 includes real Testnet create, reconnect, silent restore, prompted passkey reconnect, sponsorship, and failure evidence. |
| Direct Stellar USDC payment | **Implemented and verified** | Merged PR #41 includes a real 0.5 USDC Testnet payment, finality, exact recipient verification, amount verification, durable events, and receipt restoration. |
| Agent Pass | **Implemented and verified** | Merged PR #43 includes real Testnet creation, allowed spend, overspend rejection, revocation, post-revocation rejection, and continued owner control. P0 remains direct Stellar USDC only. |
| AI and voice intent handlers | **Implemented but awaiting live browser proof** | PR #49 mounts authenticated intent/voice endpoints, constrained parsing, injection/ambiguity tests, manual fallback and a typed path when providers are unavailable. AI remains parse-only and never signs. **Remaining:** no authenticated live voice/provider outage session has been recorded. |
| Contacts, routing, fee preview, and payment orchestration | **Implemented but awaiting live proof** | PR #53 mounts contacts/conversations/payment APIs with real owner-scoped balances, deterministic routing, Standard CCTP quotes, Base gas estimates, one-use authorization, idempotency and guarded failure/completion persistence. PR #66 adds Neon contact ownership/resolution evidence. **Remaining:** prove exact providers, balances, fees and signed routes in the accepted browser deployment. |
| Payment movement and receipt UI | **Implemented but awaiting live proof** | PRs #49/#65 integrate protected execution for all four routes, persisted Payment/PaymentEvent timelines, exact receipt gating, pagination and refresh-only recovery without resubmission. **Remaining:** no current authenticated browser has demonstrated a real submitted-to-completed/failed timeline and restored receipt. |
| Base-to-Base execution | **Implemented but awaiting live proof** | PR #48/#53 encode and authorize the exact ERC-20 transfer, verify Base Sepolia, persist the first hash, require receipt/finality and exact transfer evidence, and guard mismatch failure. **Remaining:** no real Base Sepolia wallet signature, balance/fee review or settlement evidence exists. |
| Stellar-side CCTP | **Implemented but awaiting live settlement** | PR #44 implements Stellar burn/mint verification, evidence reservation, guarded Payment transitions and replay/restart recovery. PR #53 binds its exact reviewed burn to an authenticated one-use handoff. **Remaining:** real source/destination hashes, Circle evidence and exact final recipient/amount. |
| Base/Circle coordinator | **Implemented but awaiting live settlement** | PR #48 at `05531f5` implements guarded Base/Stellar state, Circle Testnet Standard quotes, canonical hashes, attestation/mint evidence and owner-scoped Base balance reads. It is stacked through PR #53 rather than duplicated. **Remaining:** authenticated Base balance/browser proof and real bidirectional settlement/recovery evidence; Vercel fork authorization is required. |
| Bidirectional CCTP settlement | **Not live-verified** | Both code paths and automated/database recovery safeguards exist in the integrated draft. A read-only probe verifies Base Sepolia chain `84532`, deployed Base CCTP code, a current Stellar ledger and configured Stellar contract interfaces. **Remaining:** no signed Base Sepolia→Stellar Testnet or Stellar Testnet→Base Sepolia destination proof. Public RPC/contract readiness is not financial completion. |
| MoneyGram provider access and smart-account compatibility | **Requires external verification** | Partner access has not been obtained. New widget integrations require partner sandbox credentials, and registration requires a company email. MoneyGram's Stellar non-custodial documentation passes a G-address, while Telya uses Smart Account Kit contract accounts; compatibility requires explicit provider confirmation. |
| MoneyGram sandbox flow | **Not implemented** | No provider implementation or accepted sandbox transaction evidence was found. No fake provider response or simulated completed payment may substitute for access. This external blocker does not interrupt direct Stellar, CCTP, or the core product journey. |
| External user validation | **Requires external verification** | A consent-aware independent tester runbook and redacted findings/retest format are prepared. No unfamiliar user has executed it. |
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

The identifiers above are copied exactly from the merged evidence in PRs #40, #41, and #43. On November 27, 2026 at 03:00 UTC, Stellar Horizon returned `successful: true` for the direct payment and all four positive Agent Pass transactions at the recorded ledgers. The negative Agent Pass cases have no transaction by design and remain supported by merged acceptance evidence rather than an explorer hash.

### CCTP boundary and required proof

PR #44 and PR #48 expose the agreed seam, and PR #53 mounts it into the protected Payment journey:

- `settleBaseToStellarCctp(...)` accepts the trusted Base source hash plus Circle message and attestation, submits Stellar `mint_and_forward`, and may complete only after finalized exact-transfer verification.
- `reconcileStellarCctpSource(...)` verifies a finalized Stellar burn and records `source_confirmed` only. PR #48 obtains and persists the Circle evidence, submits/verifies Base `receiveMessage`, and can complete only after Base finality plus exact recipient/amount verification.
- Protected browser authorization binds the authenticated owner, verified wallet, stored route, burn amount and maximum fee to a one-use server handoff before either source operation can be broadcast.

Before PR #44 may be ready:

1. Use the persisted trusted burn amount and maximum fee separately from recipient amount; do not replace them with browser values.
2. Both directions must use real Circle CCTP Standard Testnet operations with Base domain `6`, Stellar domain `27`, and finality threshold `2000`.
3. Evidence must include source transaction, Circle message, attestation status, destination transaction, finality, exact recipient, accepted amount, and durable event sequence.
4. Duplicate callbacks, process restarts, and stale `destination_submitting` reservations must prove safe replay without duplicate financial execution.
5. Preserve the verified Neon migration chain: CCTP `0006`–`0008`, Payment handoffs `0009`–`0010`, and Agent Pass/deployment handoffs `0011`–`0012`. Reverify checksums and PostgreSQL regressions after any migration change.

The public-network probe on PR #66 verifies Base Sepolia chain `84532`, non-empty deployed code for configured USDC/TokenMessenger/MessageTransmitter, a current Stellar Testnet ledger and all configured Stellar contract interfaces. It deliberately reads no wallet balance, allowance, transaction, attestation or finality and therefore is not settlement evidence.

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

1. **Unlock authenticated acceptance.** Configure Privy app ID/secret and a usable Testnet sponsor only in the secure environment; authorize the exact teammate-fork Vercel preview. Prove PR #46 sign-in, wallet ownership, username claim and reconnect before merge.
2. **Prove the integrated direct-Stellar journey first.** On PR #66, complete intent/manual review, exact recipient/amount/fee display, passkey authorization, real submission, persisted timeline, completion verification and receipt restoration. Capture interruption and duplicate protection without resubmission.
3. **Prove Base and bidirectional CCTP.** Use real Base Sepolia wallet authorization and both Circle Standard directions. Retain exact destination recipient/amount/finality, duplicate callback, stale reservation and restart evidence; keep PRs #44/#48/#53 draft until complete.
4. **Prove current Agent Pass UI.** In one authenticated session, create a bounded pass, execute the exact reviewed allowed Payment, show cumulative over-limit rejection, expiry or revocation, post-revoke rejection and continued owner control. A page refresh must discard the memory-only delegated signer.
5. **Keep MoneyGram unavailable until approved.** Resume only after partner sandbox access and written Smart Account Kit contract-wallet compatibility. Do not substitute a simulated provider lifecycle.
6. **Run independent usability acceptance.** Have an unfamiliar tester execute the prepared runbook, record consented findings, fix defects and record the retest verdict without fabricating testimonials or adoption.
7. **Finish the demo and submission.** Confirm Issue #22 from official sources, deploy the exact accepted commit, record the truthful primary or fallback Testnet video, verify links signed out, and save submission confirmation.
8. **Prepare controlled-pilot security.** Complete the threat model, operational controls, independent review scope, monitoring, dependency/secret scanning and incident/reconciliation procedures before any production claim.

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

Merged `main` at `2531820` remains the public deployment baseline. The public health endpoint most recently returned HTTP 200 with Testnet application/database readiness; the recorded merged direct-Stellar and positive Agent Pass transactions were independently rechecked on Stellar Testnet.

On integrated draft PR #66 head `f3f4870`:

- secure environment: 76 files / 381 tests passed with no skips;
- plain environment: 65 files / 363 tests passed, while 11 files / 18 credential/database-gated tests were explicitly skipped;
- client TypeScript, server TypeScript, production build and `git diff --check` passed; the prior dependency-only head also passed frozen install;
- exact-head GitHub checks are pending; GitGuardian passed on the prior head;
- `pnpm audit --prod` reported no known vulnerabilities after resolving transitive Zod to patched `4.6.7`;
- the read-only public-network probe passed at Stellar ledger `5,946,104`; and
- mobile/desktop unauthenticated acceptance proved no financial controls or substituted data appear without sign-in, while protected reads return 401; and
- the conversational client consumes the existing owner-scoped Base balance endpoint, replacing only the matching unavailable Base entry and preserving independently verified Stellar state if Base RPC fails.
- browser-only Base wallet verification is cleared on Privy sign-out or wallet removal and cannot carry a previous identity's display claim into the next session.
- one shared fail-closed owner check gates locally restored Stellar state in Conversation and Account Tools; Agent Pass and MoneyGram receive no C-address or kit on mismatch, missing identity, sign-out or lookup failure.
- sign-out/auth loss clears the prior conversation ID, payment-review messages, recipient labels, balances and restored kit; a new owner check begins with blank identity-bound state.
- Contacts and Activity cancel identity-scoped initial loads and reject late success/error/finally writes after an auth change, preventing an earlier session response from repopulating cleared state.

Vercel did not build PR #66 because the teammate fork requires team authorization. The checks above prove automated, database, public-infrastructure and unavailable-state behavior only. They do not prove authenticated browser ownership, real balances, wallet signatures, Base/CCTP settlement, MoneyGram, independent-user acceptance or production readiness.
