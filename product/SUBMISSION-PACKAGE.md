# Telya Buildathon Submission Package

**Status:** Draft — direct Stellar and Base→Stellar Testnet settlements are verified; Stellar→Base, Base→Base, integrated deployment, independent user test, video format and organizer cutoff remain open.

**Environment:** Testnet only. No transaction or balance in this package represents Mainnet funds.

## What Telya does

Telya turns a payment request into deterministic, verifiable USDC movement. The user sees the resolved recipient, route and fees before authorizing, real persisted stages while money moves, and a receipt only after finality plus recipient and amount verification.

Agent Pass is the secondary differentiator: an agent receives a bounded, expiring and revocable USDC allowance rather than unrestricted wallet access.

## Public entry points

- Application: <https://telya.vercel.app>
- Health: <https://telya.vercel.app/api/health>
- Source: <https://github.com/Alike001/telya>
- Current implementation and blockers: [EXECUTION-TRACKER.md](EXECUTION-TRACKER.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Evidence manifest: [EVIDENCE-MANIFEST.md](EVIDENCE-MANIFEST.md)
- Independent tester runbook: [INDEPENDENT-TESTING.md](INDEPENDENT-TESTING.md)

The public URL currently proves the deployed `main` branch only. Features in draft pull requests are not part of the public acceptance claim until their tested commits are deployed.

Live recheck on November 28, 2026 at 05:40 UTC: the public health endpoint returned HTTP 200 with Testnet/application/database ready. This remains the older deployed `main`, not the integrated draft. Stellar Testnet Horizon had previously returned `successful: true` at the recorded ledger for the direct payment plus all four positive Agent Pass transactions below.

## How to verify without a wallet

1. Open the health endpoint. Expect HTTP `200` with application and database readiness. A healthy response does not prove a payment route.
2. Open the exact Stellar Testnet transaction links in the evidence register below.
3. Confirm that the direct payment transaction is successful and that the account, recipient, amount and ledger match the register.
4. Open the Agent Pass creation, allowed spend, revocation and owner-after-revocation transactions. The rejected overspend and post-revocation attempts intentionally have no transaction hashes.
5. Review the current tracker before testing a draft feature. It distinguishes automated, database, browser and live Testnet evidence.

### Reproduce draft public-network readiness

PR #66 includes a secret-safe, read-only probe for the infrastructure
used by the integrated draft. After checking out current head `9747700` and configuring
the public Testnet values, run:

```bash
pnpm env:check -- --flow=cctp
pnpm testnet:probe
```

The probe must report Base Sepolia chain `84532`, deployed code for the configured
Base USDC/CCTP contracts, a current Stellar Testnet ledger and discoverable
interfaces for every configured Stellar contract. It prints no environment
values and does not read a wallet balance, sign, submit, attest, mint or verify
payment finality. Passing it is infrastructure readiness—not financial completion.

## Local interactive setup

Requirements: Node.js 22 or newer, pnpm 11, a direct Neon Testnet database URL, and the server-only credentials named in `.env.example` for the flow being exercised.

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. Do not paste credentials into an issue, PR, recording or browser-visible `NEXT_PUBLIC_*` variable unless `.env.example` explicitly marks the value public.

The local secure environment passes Privy and localhost WebAuthn configuration checks. The dedicated sponsor's public Testnet identity, 10,000-XLM starting balance and one-stroop self-payment are independently verified, while Vercel lists the sponsor as a hidden Secret in Preview/Production without exposing its value. A later Vercel deployment proves environment-snapshot timing but not that the hidden deployed seed derives the same public key. The authenticated local browser has completed direct Stellar and Base→Stellar payments; the public deployed `main` has not yet accepted that integrated journey.

## Testnet funding

- Native Stellar Testnet XLM is for account/network operations, not USDC. Stellar's official CLI supports `stellar keys generate alice --network testnet --fund` for a funded Testnet account: <https://developers.stellar.org/>.
- Testnet USDC is separate. Circle's public faucet supports both Stellar Testnet and Base Sepolia and states its current per-address/network limit: <https://faucet.circle.com/>.
- Select the exact Testnet network and verify the destination address before requesting funds. Never send Mainnet assets to a Testnet address.
- A Telya Stellar user wallet is a Smart Account Kit `C...` contract address. Do not assume a faucet or third-party wallet accepts a contract address: verify the destination and resulting on-chain balance first. Use a prepared, already verified Testnet account when direct faucet delivery is incompatible.
- Base Sepolia execution also needs Base Sepolia ETH for gas when the connected wallet, rather than Telya sponsorship, pays gas. Telya must show unavailable/insufficient gas instead of inventing a balance.

## Verified primary fallback: direct Stellar USDC

This is the strongest complete, independently inspectable payment evidence currently available. It is the fallback judge demo until the integrated conversational flow and cross-chain routes pass live acceptance.

| Field | Verified value |
| --- | --- |
| Smart account | [`CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3`](https://stellar.expert/explorer/testnet/contract/CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3) |
| Intended and verified recipient | [`GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW`](https://stellar.expert/explorer/testnet/account/GAAGLUBSWZQPKLAKJS62BB3PUH6XGBJRML6SPX5XIPM56XFNGTV4XCCW) |
| Accepted amount | `0.5 USDC` |
| Transaction | [`3e58eab868ebc75e0f0c8c128c8df779fa6f50e8cd6afd37bf8e6c6dc3db1e1e`](https://stellar.expert/explorer/testnet/tx/3e58eab868ebc75e0f0c8c128c8df779fa6f50e8cd6afd37bf8e6c6dc3db1e1e) |
| Ledger | `5915869` |
| Completion rule | Finality, recipient and amount verified before `completed`; receipt restored after refresh |

## Verified Agent Pass evidence

Smart account: [`CBV3RM6TUXSRPG2ZHVVXNKIGJZKOL2KQWPTOHRZFVHW7DIJGTG5U2QLP`](https://stellar.expert/explorer/testnet/contract/CBV3RM6TUXSRPG2ZHVVXNKIGJZKOL2KQWPTOHRZFVHW7DIJGTG5U2QLP)

| Proof | Result | Evidence |
| --- | --- | --- |
| Create allowance | Successful | [`bb683c78b369e43b2cbb91696cf13eecea086a5fb3d0efd14db3386718524f13`](https://stellar.expert/explorer/testnet/tx/bb683c78b369e43b2cbb91696cf13eecea086a5fb3d0efd14db3386718524f13), ledger `5917312` |
| Spend `0.4 USDC` within allowance | Successful | [`4aa9de4971dc8f300b3a4e326daabeeba74a987c9cc3b6969e137eae4b92ed84`](https://stellar.expert/explorer/testnet/tx/4aa9de4971dc8f300b3a4e326daabeeba74a987c9cc3b6969e137eae4b92ed84), ledger `5917322` |
| Exceed cumulative allowance | Rejected | No transaction and no balance movement; merged acceptance evidence in PR #43 |
| Revoke | Successful | [`82039abc17fbb334551fb218b6e050ba7abc9637f96e8605f4a66671409ea58c`](https://stellar.expert/explorer/testnet/tx/82039abc17fbb334551fb218b6e050ba7abc9637f96e8605f4a66671409ea58c), ledger `5917461` |
| Agent spends after revoke | Rejected | No transaction and no balance movement; merged acceptance evidence in PR #43 |
| Owner spends `0.1 USDC` after revoke | Successful | [`249d59b88bdc9ef57d7a99491dfbb78382abe46a087d9265cb9f0b3b23825e28`](https://stellar.expert/explorer/testnet/tx/249d59b88bdc9ef57d7a99491dfbb78382abe46a087d9265cb9f0b3b23825e28), ledger `5917500` |

## Verified local Base→Stellar CCTP acceptance

The corrected payment `b6a469b5-cb8f-4473-8145-fd676ab1d9b1` moved exactly **0.1000000 native Stellar Testnet USDC** to `CB5KD4DQCBNQ7NEJESE5CUBNAZSNEAROEGKN6G4HGO5D265QNHWMSG3R`. The [Base Sepolia source burn](https://sepolia.basescan.org/tx/0xe0c0780dfeaa155eb083b67021bfd738c8cc409c0968c0fa5047b4d3613c065e) finalized in block 64,421,268; Circle attested the exact domain 6→27 message; the [Stellar destination transaction](https://stellar.expert/explorer/testnet/tx/521d913b98b63b1bcae1bf381050cec39670f4d85dc945b1141c61a09a9946a4) succeeded in ledger 5,956,793. Horizon effects independently show the exact recipient credit. Neon records the intended/verified recipient and amount, both transactions and nine durable stages through completion. Circle's USDC fee was 0; actual Base gas was 0.000001725048287508 ETH; the Stellar sponsor paid 44,666 stroops. The owner confirmed the completed local Activity receipt survived browser refresh with both transaction links, 0.1 USDC and the C-address recipient. This is not yet public integrated-deployment acceptance.

The earlier Base burn `0x45c965cb…fe5fe048` used malformed forwarder fields and is durably classified failed with no Stellar recipient credit. Its 0.1 Testnet USDC may be stranded. It is separate from the successful payment and must never be presented as delivered.

The reverse Stellar→Base route has no accepted source burn. Two reviewed confirmations stopped before the relayer. Read-only simulation found that the current smart-account `execute` wrapper traps and that Circle TokenMessenger has zero Stellar USDC allowance; no approval or reverse payment was submitted. This route stays out of the demo until exact approval, signed burn, Circle attestation, Base destination finality and recipient/amount verification are complete.

## Architecture at a glance

```mermaid
flowchart LR
    U[User: text, voice or manual form] --> I[Constrained payment intent]
    I --> S[Authenticated deterministic server]
    S --> R[Verified username and wallet resolution]
    R --> Q[Real balances, route and fee quote]
    Q --> A[Wallet or passkey authorization]
    A --> X[Approved Stellar, Base or CCTP executor]
    X --> V[Finality plus recipient and amount verification]
    V --> P[(Payment and PaymentEvent)]
    P --> UI[Timeline and receipt]
    AP[Agent Pass policy] --> A
```

The AI may parse language into a constrained intent. It never holds keys, signs a transaction, chooses execution policy, or marks a payment complete.

## Thirty-second verified fallback script

This can be recorded from the evidence already accepted on `main`.

1. **0–5 seconds:** “Sending digital dollars should not require understanding wallets, gas and settlement mechanics.” Show the Testnet label.
2. **5–13 seconds:** Show the passkey-controlled smart account and the direct `0.5 USDC` receipt with its persisted completion stages.
3. **13–20 seconds:** Open the exact transaction and recipient links. Point out ledger `5915869`, the verified recipient and the accepted amount.
4. **20–26 seconds:** Show the Agent Pass allowance and its successful `0.4 USDC` bounded spend.
5. **26–30 seconds:** Show the over-limit/revoked rejection evidence and owner-after-revocation transaction: “The agent receives an allowance, not the wallet.”

## Preferred integrated script after live acceptance

Do not record this as a working journey until the integrated browser acceptance pass is complete.

1. **0–5 seconds:** State the user problem and show the Testnet badge plus authenticated user.
2. **5–12 seconds:** Enter “Send 5 USDC to @alice.” Show the verified recipient, source/destination, route, fees and exact receive amount.
3. **12–20 seconds:** Authorize with the correct wallet/passkey. Show persisted stages; do not cut from source submission directly to success.
4. **20–26 seconds:** Open the receipt and explorer evidence. Point out finality, actual recipient and actual amount.
5. **26–30 seconds:** Show a bounded Agent Pass and a rejected over-limit or revoked attempt.

## Recording and pitch checklist

- [ ] Organizer-confirmed deadline, timezone, video duration, format and required links are recorded in `product/DECISIONS.md`.
- [ ] The recorded deployment URL and tested Git commit are shown.
- [ ] Testnet is visible throughout; no Mainnet or production-payout claim is made.
- [ ] No secret, token, database URL, private key, recovery material or personal notification is visible.
- [ ] Every balance, quote, fee, connection and transaction state comes from the real provider/chain path.
- [ ] Source submission is not edited to look like destination completion.
- [ ] Receipt shows exact real hashes, recipient, amount and finality evidence.
- [ ] Refresh/recovery and one truthful failure path are captured.
- [ ] Agent Pass shows limit/expiry, successful bounded spend, rejection and revocation evidence.
- [ ] Captions and narration match what the application actually proves.
- [ ] Final video and public links work in a signed-out browser.
- [ ] An unfamiliar tester completed [the independent runbook](INDEPENDENT-TESTING.md); findings, fixes and retest evidence are recorded.

## Known limitations and blockers

- The current public `main` deployment does not contain the unmerged integrated frontend stack.
- Local Privy configuration and sponsor key control pass preflight/Testnet verification, and Vercel secret presence/scope is confirmed. The current integrated PR #66 head still needs a compatible protected Preview/Production deployment and exact deployed sponsor identity. Some fork-PR Vercel checks require Git authorization; PR #53 previously hit the deployment quota. Local browser evidence exists for direct Stellar, Base→Stellar and bounded Agent Pass spend, but not the full route matrix or unfamiliar-user walkthrough.
- The integrated build's value-redacted client-secret scan passed across 215 emitted browser files; this guards packaging but does not validate the configured secrets.
- Base direct and Stellar→Base CCTP have no accepted signed end-to-end Testnet settlement evidence. The completed Base→Stellar route may be shown with its exact hashes and qualification above; do not present the earlier malformed burn as delivered.
- The public Base/Stellar endpoints and configured CCTP contracts pass the draft read-only probe. That probe is infrastructure readiness only; the route-specific evidence above is separate.
- MoneyGram is unavailable pending partner sandbox access and written Smart Account Kit contract-wallet compatibility confirmation.
- Independent unfamiliar-user testing has not yet been recorded.
- The organizer has not yet confirmed the exact cutoff/timezone, artifacts or video format. No duration is inferred here.
- The documentation preview deploys successfully; teammate-fork previews still require explicit Vercel GitHub authorization.

## Mainnet roadmap

Telya is not Mainnet-ready and this Buildathon package requests no Mainnet
wallet action. A Mainnet release is gated on all of the following rather than a
network-variable switch:

1. Independent security review of the smart-account rules, relayer boundaries,
   payment state machine, database migrations and browser authorization paths,
   with every material finding fixed and retested.
2. Fresh production deployments and verification of the Stellar account WASM,
   WebAuthn/Ed25519 verifiers, spending-limit policy and USDC contracts. No
   Testnet address, passphrase, sponsor or transaction evidence may be reused.
3. Official Circle Mainnet CCTP domains/contracts, fee behavior, attestation and
   both-direction destination verification tested with controlled limits before
   public availability.
4. Production Privy, RPC, database, sponsor and monitoring configuration with
   least-privilege access, secret rotation, alerting, reconciliation and a
   documented incident/rollback procedure.
5. Risk controls including per-user/route limits, rate limits, insufficient-fund
   handling, duplicate/restart recovery and operational review of stuck funds.
6. MoneyGram only after written provider approval, production credentials,
   compliance requirements and Smart Account Kit contract-wallet compatibility.
7. A separate independent-user acceptance pass on the exact production commit,
   followed by staged launch limits. Testnet evidence in this package remains
   historical evidence and never proves Mainnet settlement.

## Final submission gate

The package is ready only when the tested deployment commit, integrated browser walkthrough, required live route evidence, independent test findings and fixes, organizer requirements, final video, public links and submission confirmation are recorded. Until then, this document is a truthful preparation package—not a completion claim.
