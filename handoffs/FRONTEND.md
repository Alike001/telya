# Frontend / Product Handoff

Read:
- `../product/PRD.md`
- `../product/ARCHITECTURE.md`
- `../product/ACCEPTANCE-TESTS.md`

## Mission

Make Telya feel like a consumer financial product, not a crypto dashboard.

The frontend teammate may choose a stronger design direction than any inspiration reference.

## Own

- landing,
- onboarding/auth UI,
- conversation shell,
- voice states,
- balances,
- contacts,
- payment review,
- route explanation,
- live transaction timeline,
- receipts/history,
- Agent Pass screens,
- add/withdraw screens,
- MoneyGram screens,
- responsive/mobile experience,
- Testnet/Judge mode,
- demo polish.

## UX requirements

Hide blockchain jargon by default.

Do not make the primary navigation about:
- CCTP,
- Soroban,
- RPC,
- gas,
- bridges.

A user should understand:
- who they are paying,
- amount,
- source,
- destination,
- recipient amount,
- fees,
- current payment stage,
- final result.

## Live money movement

Timeline must be driven by real backend state.

Never animate a fake success.

Examples:
- Approved
- Sent from Base
- Waiting for Circle
- Delivering on Stellar
- Delivered

For direct Stellar:
- Approved
- Submitted to Stellar
- Confirming
- Delivered

## Build independently

Use mocked typed responses while backend/blockchain features are incomplete.
Do not wait for other teammates before implementing the UI contracts.
