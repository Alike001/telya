# Telya Buildathon Evidence Manifest

**Status:** Draft and append-only for accepted evidence.

**Network scope:** Stellar Testnet and Base Sepolia only. No entry represents Mainnet funds or production payout availability.

**November 28 update:** The integrated draft has independently verified a 0.1-USDC Base→Stellar settlement; the route matrix below has been advanced accordingly. Stellar→Base remains blocked before the relayer with no source hash, and the deployed public `main` remains older than the integrated draft.

This manifest separates evidence types so a unit test, source hash or UI screenshot cannot be mistaken for verified financial completion.

## Evidence levels

| Level | Meaning | May prove financial completion? |
| --- | --- | --- |
| Public chain/provider | Independently retrievable finalized network record | Only with exact intended/actual recipient and amount verification |
| Live browser acceptance | Real authenticated wallet/passkey action on the tested deployment | Only when backed by persisted state and public/provider evidence |
| Database integration | Real PostgreSQL constraints/transitions exercised | No; proves persistence behavior only |
| Automated unit/component | Deterministic code path and regressions | No; proves covered logic only |
| Prepared/unverified | Script, UI or integration exists without required live evidence | No |
| External blocker | Provider/organizer/user-controlled prerequisite absent | No |

## Public deployment evidence

| Item | Evidence | Last verified | Qualification |
| --- | --- | --- | --- |
| Public application | <https://telya.vercel.app> | November 27, 2026 | Deployed `main`, not the open draft frontend stack |
| Health endpoint | <https://telya.vercel.app/api/health> | 03:00 UTC, November 27, 2026 | Returned Testnet `ready` with application/database `ok`; health is not payment proof |
| Source repository | <https://github.com/Alike001/telya> | November 27, 2026 | Open draft PRs are not part of deployed `main` |

The final submission must replace this section's qualification with the exact deployed Git commit and a signed-out verification after the accepted build is deployed.

## Smart-account lifecycle

| Proof | Account | Transaction | Ledger | Public result |
| --- | --- | --- | --- | --- |
| Initial passkey smart-account deployment | [`CD4TKTI6AOYCMVE5U2G6HQNWPLAP36ND3SXM4OLQMTD47AR6CL2C62YM`](https://stellar.expert/explorer/testnet/contract/CD4TKTI6AOYCMVE5U2G6HQNWPLAP36ND3SXM4OLQMTD47AR6CL2C62YM) | [`6427d999de057f8745c096581f1eaf0451be09bbd29acd5754f5f5b321e85036`](https://stellar.expert/explorer/testnet/tx/6427d999de057f8745c096581f1eaf0451be09bbd29acd5754f5f5b321e85036) | `5914961` | Successful Testnet record |
| Re-login account deployment | [`CBMK6GY4FJO6LFC2CBA7TAK4H76ZJOSPBIHEMWKVPNEF6QRYOT7AQP4P`](https://stellar.expert/explorer/testnet/contract/CBMK6GY4FJO6LFC2CBA7TAK4H76ZJOSPBIHEMWKVPNEF6QRYOT7AQP4P) | [`78ced56972c8c0c22873b46fe85c4c537dd1ce0deb5c9c8bf0af11da3af72b2f`](https://stellar.expert/explorer/testnet/tx/78ced56972c8c0c22873b46fe85c4c537dd1ce0deb5c9c8bf0af11da3af72b2f) | `5915005` | Successful Testnet record |

Merged acceptance evidence: [PR #40](https://github.com/Alike001/telya/pull/40). These records prove the earlier accepted Smart Account Kit lifecycle, not the unmerged Privy-bound onboarding UI.

## Direct Stellar USDC payment

| Field | Evidence |
| --- | --- |
| Smart account | [`CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3`](https://stellar.expert/explorer/testnet/contract/CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3) |
| Intended recipient | [`GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW`](https://stellar.expert/explorer/testnet/account/GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW) |
| Verified recipient | Same exact address |
| Requested/accepted amount | `0.5 USDC` |
| Transaction | [`3e58eab868ebc75e0f0c8c128c8df779fa6f50e8cd6afd37bf8e6c6dc3db1e1e`](https://stellar.expert/explorer/testnet/tx/3e58eab868ebc75e0f0c8c128c8df779fa6f50e8cd6afd37bf8e6c6dc3db1e1e) |
| Ledger | `5915869` |
| Persisted result | `completed` only after finality plus recipient/amount verification; receipt restored after refresh |
| Merged acceptance evidence | [PR #41](https://github.com/Alike001/telya/pull/41) |

Stellar Testnet Horizon returned `successful: true` for the transaction at the recorded ledger during the November 27 recheck. This is the accepted fallback payment demo.

## Agent Pass

Account: [`CBV3RM6TUXSRPG2ZHVVXNKIGJZKOL2KQWPTOHRZFVHW7DIJGTG5U2QLP`](https://stellar.expert/explorer/testnet/contract/CBV3RM6TUXSRPG2ZHVVXNKIGJZKOL2KQWPTOHRZFVHW7DIJGTG5U2QLP)

| Invariant | Evidence | Result |
| --- | --- | --- |
| Owner creates bounded allowance | [`bb683c78b369e43b2cbb91696cf13eecea086a5fb3d0efd14db3386718524f13`](https://stellar.expert/explorer/testnet/tx/bb683c78b369e43b2cbb91696cf13eecea086a5fb3d0efd14db3386718524f13), ledger `5917312` | Successful |
| Agent spends `0.4 USDC` within allowance | [`4aa9de4971dc8f300b3a4e326daabeeba74a987c9cc3b6969e137eae4b92ed84`](https://stellar.expert/explorer/testnet/tx/4aa9de4971dc8f300b3a4e326daabeeba74a987c9cc3b6969e137eae4b92ed84), ledger `5917322` | Successful |
| Cumulative overspend | No successful transaction; merged negative acceptance in PR #43 | Rejected with no balance movement |
| Owner revokes | [`82039abc17fbb334551fb218b6e050ba7abc9637f96e8605f4a66671409ea58c`](https://stellar.expert/explorer/testnet/tx/82039abc17fbb334551fb218b6e050ba7abc9637f96e8605f4a66671409ea58c), ledger `5917461` | Successful |
| Agent spends after revocation | No successful transaction; merged negative acceptance in PR #43 | Rejected with no balance movement |
| Owner spends `0.1 USDC` after revocation | [`249d59b88bdc9ef57d7a99491dfbb78382abe46a087d9265cb9f0b3b23825e28`](https://stellar.expert/explorer/testnet/tx/249d59b88bdc9ef57d7a99491dfbb78382abe46a087d9265cb9f0b3b23825e28), ledger `5917500` | Successful; owner retained control |

Merged acceptance evidence: [PR #43](https://github.com/Alike001/telya/pull/43). Horizon returned successful records at the documented ledgers for all four positive transactions during the November 27 recheck. Negative cases intentionally cannot have a successful transaction hash.

## Current route matrix

| Route/capability | Public live proof | Automated/database evidence | Submission status |
| --- | --- | --- | --- |
| Stellar → Stellar direct USDC | Accepted transaction, exact recipient/amount, persisted completion/refresh | Merged PR #41 plus later protected-execution regressions | **Verified fallback** |
| Passkey smart-account lifecycle | Accepted deployment/reconnect evidence | Merged PR #40 plus draft Privy-bound regressions | **Verified foundation; new onboarding UI pending** |
| Agent Pass direct Stellar USDC | Accepted create/spend/reject/revoke/owner-control evidence | Merged PR #43 plus PR #66 owner-bound one-use administration, exact Payment review, memory-only delegated execution, ledger-expiry and idempotent-spend tests | **Verified foundation; draft integrated UI not live-verified** |
| Username/contact resolution | None for current authenticated browser UI | Neon owner/collision/contact tests in draft PRs #46/#66 | **Prepared, not live-verified** |
| Conversational/manual payment journey | Authenticated local direct Stellar and Base→Stellar Testnet executions; public integrated deployment pending | Draft PR #49 and stacked regressions | **Locally live-verified for two routes; deployed journey pending** |
| Timeline/history/receipt UI | Owner-observed direct receipt refresh and completed Base→Stellar Activity; exact cross-chain receipt fields after a second reload not explicitly confirmed | Draft PR #65 persistence/refresh tests | **Partial live acceptance** |
| Base → Base direct USDC | None | Draft backend/browser authorization and mismatch tests | **Not live-verified** |
| Base Sepolia → Stellar Testnet CCTP | Payment `b6a469b5-cb8f-4473-8145-fd676ab1d9b1`: finalized [Base burn](https://sepolia.basescan.org/tx/0xe0c0780dfeaa155eb083b67021bfd738c8cc409c0968c0fa5047b4d3613c065e), Circle attestation and successful [Stellar mint/forward](https://stellar.expert/explorer/testnet/tx/521d913b98b63b1bcae1bf381050cec39670f4d85dc945b1141c61a09a9946a4); Horizon exact 0.1000000 native USDC credit to `CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R`; nine durable Neon events | Draft guarded state, Circle evidence and recovery tests | **Settlement verified; browser receipt reload and deployment pending** |
| Stellar Testnet → Base Sepolia CCTP | No source hash, no burn, no destination mint. Two reviewed handoffs expired before relayer. Read-only simulation found smart-account wrapper failure and zero TokenMessenger USDC allowance | Draft guarded burn/attestation/mint/finality tests | **Blocked before broadcast; not live-verified** |
| MoneyGram cash-in/out | None | Unavailable-state UI only | **External blocker; not implemented** |
| Independent unfamiliar-user pass | None | Runbook prepared | **Not executed** |

## Draft implementation evidence

These heads demonstrate code/test state only. They are not accepted financial completion evidence.

| Pull request | Head at manifest refresh | Strongest verified evidence | Missing acceptance |
| --- | --- | --- | --- |
| [#44 Stellar CCTP](https://github.com/Alike001/telya/pull/44) | `af68df4` | Guarded Neon source/destination/failure/completion transitions; full local gates | Real bidirectional settlement and retry/restart |
| [#48 Base/Circle CCTP](https://github.com/Alike001/telya/pull/48) | `05531f5` | 150 configured tests including PostgreSQL; strict Circle Standard quote; guarded evidence | Signed Base/Stellar source and destination proof |
| [#46 onboarding](https://github.com/Alike001/telya/pull/46) | `dd69a3d` | 72 configured tests; Neon wallet-bound username claim | Real Privy/passkey/browser claim and reconnect |
| [#53 backend orchestration](https://github.com/Alike001/telya/pull/53) | `d20dddd` | 224 configured tests; guarded finalized mismatch persistence | Real browser authorization and route execution |
| [#49 conversational UI](https://github.com/Alike001/telya/pull/49) | `64ab352` | 294 configured tests; four protected route paths | Real authenticated browser and signed transactions |
| [#65 timeline/receipts](https://github.com/Alike001/telya/pull/65) | `8f64801` | 310 configured tests; persisted exact failure stages | Real browser refresh and completed/failed receipt |
| [#66 Agent Pass/contacts/Judge UI](https://github.com/Alike001/telya/pull/66) | `e2f731a` (`b8c3315` tested feature parent) | 387 configured tests; Neon contacts/Agent Pass; one-use execution; initiating-owner auth hardening; clean production dependency audit; emitted-client-secret scan; local Privy preflight/login-modal proof; Vercel key presence; read-only Base/Stellar contract probe | Local sponsor, secret validity, fork preview and authenticated live browser/payment/Agent Pass acceptance |

PR #66's latest live probe at ledger `5,947,268` verified Base Sepolia chain `84532`,
non-empty deployed bytecode at the configured Base USDC, TokenMessenger and
MessageTransmitter, and discoverable interfaces for all seven configured Stellar
contracts. This is prepared public-infrastructure evidence only. It contains no
wallet balance, allowance, signature, transaction, attestation, mint, recipient,
amount or finality proof and therefore cannot upgrade either CCTP route above.

Read [EXECUTION-TRACKER.md](EXECUTION-TRACKER.md) for current heads and checks before relying on this snapshot.

## Evidence still required before final submission

- Exact accepted deployed Git commit and signed-out public verification.
- Real Privy sign-in, username claim, passkey create/reconnect and authenticated wallet ownership.
- One integrated payment from intent/manual entry through review, authorization, persisted movement, final verification and restored receipt.
- Actual failure/recovery evidence on the accepted deployment, including no duplicate irreversible action.
- Live Base direct and both CCTP directions if claimed as supported; otherwise explicit unavailable states and limitations.
- Independent tester identity/pseudonym with consent, environment, findings, fixes and retest verdict.
- Organizer-confirmed cutoff/timezone, artifacts, video format and required public links.
- Final video URL and submission confirmation.

Never add an entry from a PR description alone. Record the exact tested commit, environment, time, expected and actual values, public references, persistence evidence and limitations.
