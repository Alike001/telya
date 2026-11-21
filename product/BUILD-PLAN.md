# Telya Build Plan

## Pre-Build-Week foundation

Complete before feature work:
- repository source-of-truth docs,
- teammate access,
- branch/PR workflow,
- public Vercel deployment,
- Neon database,
- environment contract,
- API/type contracts,
- Testnet funding/setup,
- provider sandbox registrations.

## Build Week order

### Day 1 — Foundation + public URL
- deploy public Telya shell,
- establish shared types,
- database schema,
- auth skeleton,
- frontend design system,
- Stellar network configuration.

### Day 2 — Core money primitives
- Stellar smart account/passkey,
- Stellar USDC direct payment,
- Base account/payment setup,
- conversational shell,
- structured intent endpoint.

### Day 3 — Money experience
- fee sponsorship,
- voice STT/TTS,
- transaction history,
- route decision engine,
- visible payment-progress component.

### Day 4 — Agent Pass + ramps
- integrate validated Agent Pass pattern,
- create/spend/limit/revoke UX,
- MoneyGram sandbox session/flow,
- failure-state UI.

### Day 5 — Bidirectional CCTP
- Base -> Stellar end to end,
- Stellar -> Base end to end,
- source/destination verification,
- refresh/recovery behavior.

### Day 6 — Integration
- full acceptance matrix,
- mobile/responsive fixes,
- README How to Test,
- docs,
- seeded contacts/Testnet setup,
- demo rehearsal.

### Final day — Submission only
- no major new features,
- bug fixes,
- stability,
- video,
- README,
- final demo/pitch,
- submission.

## Pivot / feature cutoff

After the agreed feature-freeze point, no new major features.
Only:
- fixes,
- tests,
- UX,
- docs,
- deployment,
- demo.

## Parallel-work rule

Frontend builds against mock contracts immediately.
Blockchain code accepts deterministic typed inputs and does not depend on AI.
AI/backend returns structured intent and never signs transactions.

No teammate should wait for another teammate before building their own interface.

## Definition of done

A feature is not done because the UI exists.
It is done when:
- real Testnet behavior works,
- failure paths are handled,
- state survives refresh where required,
- acceptance tests pass,
- docs/how-to-test are updated.
