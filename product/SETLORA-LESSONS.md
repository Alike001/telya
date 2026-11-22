# Setlora Lessons Applied to Telya

## Purpose

This document preserves lessons from the previous Setlora hackathon so future Telya agents and teammates do not repeat the same mistakes.

**This does not change Telya's frozen P0 MVP.**
It changes how we prioritize, prove, test, and present the existing product.

## Previous hackathon lesson

Setlora was technically functional and verifiable but did not win.

Judges praised:
- practical real-world use case,
- real on-chain transactions instead of mocks,
- public verification,
- strong technical completeness,
- important business rules enforced at the contract layer rather than only the frontend.

Judges criticized:
- limited commercial depth,
- weak adoption/community contribution,
- a product limitation that reduced realistic usage,
- a business workflow narrower than stronger competitors.

The key lesson:

**Do not merely demonstrate integrations or transactions. Demonstrate a complete user outcome, including failure/recovery behavior and proof that the intended result happened.**

## What this means for Telya

Telya must not present itself as a list of technologies.

Bad framing:
- Smart Account Kit
- CCTP
- Base
- AI
- voice
- MoneyGram
- Neon
- Privy

Strong framing:

> A user tells Telya the payment outcome they want. Telya resolves the recipient and route, explains what will happen, moves the money, shows where it is while it moves, and verifies that the intended recipient received the right amount.

Agent Pass is the secondary differentiator:

> AI agents get bounded, expiring, revocable spending authority instead of unrestricted wallet access.

## Hero persona for judging

Lead with one persona:

**A remote freelancer who holds USDC on one network and needs to pay another freelancer/vendor who receives on another network.**

Other supported users remain in the product. This persona only leads the story.

## Hero workflow

Primary judge-facing flow:

1. User says: "Send @alice 5 USDC."
2. Telya resolves `@alice` to verified wallet records.
3. Telya determines source and destination deterministically.
4. Telya explains why the route was chosen.
5. User sees exact recipient amount and fees.
6. User authorizes.
7. Telya shows real payment stages.
8. Destination finality is verified.
9. Recipient and amount are verified.
10. Receipt shows real transaction references.

Preferred cross-chain demo if stable:
- user has USDC on Base,
- Alice receives on Stellar,
- route uses Circle CCTP Standard.

Fallback:
- Stellar -> Stellar real Testnet payment.

## Agent Pass secondary demo

After the main payment:

1. Show a USDC-only Agent Pass.
2. Show its limit and expiry.
3. Agent spends within the limit -> succeeds.
4. Agent tries to exceed the cumulative limit -> rejected.
5. Owner revokes.
6. Agent tries again -> rejected.
7. Owner remains able to spend.

The product message:

**The agent receives an allowance, not the wallet.**

## P0 stays unchanged

All previously frozen P0 features remain:

- Stellar -> Stellar USDC
- Base -> Base USDC
- Base -> Stellar CCTP
- Stellar -> Base CCTP
- Stellar Smart Account Kit + passkeys
- Stellar fee sponsorship
- unique usernames and contacts
- text interaction
- voice interaction
- structured AI intent extraction
- deterministic routing and route explanation
- visible real payment/finality state
- persistent history and receipts
- Agent Pass
- MoneyGram sandbox
- Judge/Testnet mode
- public deployment
- refresh/recovery and idempotency protections

Do not remove these merely because some are lower demo priority.

## Build priority under time pressure

This is prioritization, not scope deletion.

### Essential to protect first
- Stellar direct payment
- Base -> Stellar hero cross-chain flow
- passkey smart account
- username/recipient resolution
- deterministic routing
- fee handling/sponsorship
- real payment-state tracking
- destination recipient/amount verification
- receipts/history
- recovery/idempotency

### Important supporting proof
- Stellar -> Base
- Base -> Base
- Agent Pass
- AI intent extraction
- contacts

### Polish only after core reliability
- voice UX polish
- MoneyGram sandbox polish
- non-essential visual flourishes

If time becomes constrained, do not delete P0 automatically. First reduce polish and protect the complete financial outcome.

## Evidence rule

Every financial claim must have evidence.

Real Testnet proof should capture where applicable:
- payment ID,
- source network,
- destination network,
- transaction hash,
- explorer/reference URL,
- expected recipient,
- actual recipient,
- expected amount,
- actual amount,
- final status,
- elapsed time.

Required evidence areas:
- Stellar -> Stellar
- Base -> Base
- Base -> Stellar
- Stellar -> Base
- pending-payment refresh/recovery
- duplicate-confirm/idempotency protection
- Agent Pass valid spend
- Agent Pass overspend rejection
- Agent Pass revocation
- post-revocation rejection
- owner still controls account
- receipt/history verification

Automated tests should cover routing, state transitions, idempotency, username uniqueness, stale recipient handling, failure recovery, and malformed AI output.

Sandbox/demo-only behavior must be clearly labeled. Never present simulation as a real financial transaction.

## Failure paths judges should see reflected in the product

Handle visibly and safely:
- CCTP attestation delay
- source success but destination delay/failure
- refresh while pending
- ambiguous network
- insufficient USDC
- low sponsor balance
- insufficient Base gas
- duplicate confirmation
- repeated provider callback
- AI failure
- voice failure
- provider outage
- stale recipient resolution
- balance changing after preview
- app/server crash after source success

A payment must never be marked complete merely because the source transaction succeeded.

## Judge experience

The first 30 seconds should answer:

1. Who has this problem?
2. What is frustrating today?
3. What does Telya remove?
4. What real outcome did the user get?

Recommended opening concept:

> Sending digital dollars should not require understanding bridges, gas and destination networks.

Then show one real payment, visible finality, a verifiable receipt, and Agent Pass.

Do not make judges learn every integration.

## Adoption/community proof

Do not invent traction.

If practical during Build Week, collect lightweight genuine evidence:
- a few external testers,
- real Testnet transactions from different users,
- usability observations,
- short anonymized feedback,
- issues discovered and fixed from testing.

This is helpful but not a pre-build blocker.

## What NOT to build because of this feedback

Do not react to Setlora by expanding scope.

Do not add:
- extra chains,
- extra stablecoins,
- bridge aggregation,
- CCTP Fast Transfer,
- cards,
- production bank payouts,
- merchant/team dashboards,
- scheduled payments,
- QR payments,
- trading,
- multi-agent orchestration,
- native mobile apps,
- Mainnet launch.

The lesson is **complete outcomes over feature count**.

## Rule for future agents

When choosing between:
- polishing a secondary integration, or
- fixing the complete payment outcome / recovery / evidence,

protect the complete payment outcome first.

If unsure, follow the frozen P0 issues and acceptance tests rather than inventing new work.
