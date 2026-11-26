# Telya Current Status

**Date:** November 26, 2026  
**Team:** Bravo  
**Product:** Telya  
**Repository:** Alike001/telya  
**Execution plan:** [Buildathon Execution Plan — November 26–30](BUILDATHON-EXECUTION-PLAN.md)

## Readiness verdict

Telya has real, independently inspectable Stellar Testnet foundations, but the integrated P0 consumer journey and bidirectional cross-chain demo are not complete. The final submission date recorded in decision D-017 is **November 30, 2026**; the exact cutoff/timezone is still unconfirmed in Issue #22.

Hammed is actively coordinating and driving the remaining P0 work. Existing contributors may continue to contribute, but implementation proceeds in the documented dependency order and no financial feature is accepted from a PR description alone.

## Verified on main

- Public Testnet application and health endpoint.
- Canonical domain contracts and database migrations through 0005.
- Passkey-controlled Stellar Smart Account Kit creation/reconnect and server-side sponsorship.
- Direct Stellar Testnet USDC with finality, recipient/amount verification, durable events, and receipt restoration.
- Agent Pass allowed spend, cumulative-limit rejection, revocation, post-revocation rejection, and continued owner control.
- PR #47 judging/grant readiness documentation merged on November 26.
- Main-branch baseline remains the previously recorded 5 test files / 40 tests, with type generation, TypeScript checking, and production build passing. This is not the test count for the unmerged PR branches.

## Open pull requests and acceptance state

### PR #44 — Stellar CCTP (Issue #12)
Open draft, based on main. Implements Stellar-side burn/mint-forward, destination verification, durable operations, idempotency, and recovery. Keep draft until the Base/Circle coordinator is integrated and both directions have real Testnet destination-finality, recipient, amount, and retry evidence.

### PR #48 — Base/Circle coordinator (Issue #16)
Open PR from Webghost01-NG's fork, based on PR #44's branch. The latest reported local checks are 86 tests, TypeScript checks, and production build passing; one PostgreSQL test was skipped without DATABASE_URL. The latest review identified an attestation message comparison issue: Circle-assigned nonce and fee/expiration/finality fields must be the only permitted differences from the source event, with source placeholders checked as zero and executed fee bounded by maxFee. Required migrations 0007 and 0008 and real bidirectional Base Sepolia ↔ Stellar Testnet evidence are still outstanding. Although GitHub currently shows this PR as ready for review, it must be returned to draft until all acceptance evidence is attached.

### PR #46 — onboarding/auth/username (Issue #5)
Open, changes requested. Remaining blockers: mock username fallback on missing/failed DB, no durable authenticated atomic username claim, returning-user state relying on local browser state, unverified Base-connected UI state, and a GitGuardian alert requiring investigation/disposition. Vercel has asked for team authorization before deployment; this is not proof of a code build failure, but it is not a successful preview check either.

### PR #49 — conversational home/voice/payment review (Issue #6)
Open, changes requested. The current implementation still includes hardcoded balances/fees and a local-timer payment-success path, does not prove real authorization/submission/persistence, needs verified recipient resolution, and must return explicit insufficient-funds behavior rather than defaulting to Stellar. The PR contains/inherits onboarding code and must not bypass PR #46's identity/security requirements.

## Open P0 issues

- Issue #15: contacts, conversation persistence, deterministic recipient resolution/routing, payment orchestrator, trusted fees, durable PaymentEvents, idempotency.
- Issue #7: real progress timeline, refresh recovery, activity/history, receipts.
- Issue #8: Agent Pass UI, verified contacts, add/withdraw surfaces, Testnet/Judge mode.
- Issue #18: full route matrix, retry/idempotency, refresh and failure recovery.
- Issue #17: MoneyGram Ramps sandbox; blocked on provider access and wallet compatibility.
- Issue #19: README How to Test, test instructions, demo/evidence, limitations, and submission docs.
- Issue #22: confirm exact submission cutoff/timezone and required artifacts with the organizers.

## MoneyGram status

Hammed submitted the official MoneyGram Ramps contact enquiry on November 25, 2026; no reply had arrived by November 26. Do not send duplicate enquiries immediately; check inbox/spam and request a direct introduction from the Buildathon admin/organizers.

The current widget onboarding requires partner access and sandbox API keys. The documented non-custodial Stellar web flow asks for a Stellar G-address and a signing callback, while Telya uses Stellar Smart Account Kit C-address accounts. Written provider confirmation is required before choosing the integration wallet model. Do not fake sandbox responses, claim unsupported corridors, or let this external dependency block direct Stellar, CCTP, or the core experience.

## Immediate execution priorities

1. Fix the latest PR #48 Circle attestation comparison and regression tests; verify Neon migrations 0007/0008 and the database-backed constraint test.
2. Fix PR #46's durable, authenticated, fail-closed username identity path.
3. Rework PR #49 so it consumes real backend/account data and cannot show a false payment success.
4. Connect Issue #15 orchestration to the direct Stellar experience; build Issue #7 timeline/receipt from persisted Payment + PaymentEvent state.
5. Connect real Agent Pass and contacts into Issue #8; keep MoneyGram clearly unavailable until approved credentials and wallet compatibility exist.
6. Run Issue #18's route/recovery matrix and complete Issue #19/22 submission readiness.

See [the active execution plan](BUILDATHON-EXECUTION-PLAN.md) for task-by-task acceptance criteria and the November 26–30 sequence.
