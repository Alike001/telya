# Telya Problem & Ecosystem Validation

## What is already supported by ecosystem evidence

Telya's direction is aligned with current Stellar capabilities and ecosystem activity.

### Stellar is actively focused on payments and stablecoins
Stellar's developer platform currently emphasizes tokens, payments, fee sponsorship, ramps, smart accounts, passkeys, delegated authorization, and spending limits.

### Cross-chain USDC is a current Stellar capability
Circle CCTP recently went live on Stellar, enabling native USDC movement between Stellar and CCTP-enabled networks including Base.

### Smart-account UX is a current Stellar direction
Stellar highlights passkeys, smart wallets, delegated authorization, and spending-limit policies as first-class developer primitives.

### Ramps are a core Stellar product surface
Stellar's developer materials explicitly position open-access ramps such as MoneyGram as a way to connect applications to local cash and payment methods.

### Existing funded/recognized products validate the market
Recent Stellar ecosystem examples include:
- products using human-readable payment handles,
- cross-chain CCTP products,
- African stablecoin payout/payment products,
- neobank-style products,
- passkey consumer wallets.

This is validation that the market is real, but it also means Telya cannot win merely by saying "we send stablecoins."

## What remains a hypothesis

We still need direct user evidence for:

1. Users want conversational payment initiation.
2. Users value route abstraction enough to switch from an existing wallet.
3. Visible money movement/finality materially increases trust.
4. Bidirectional Base <-> Stellar routing solves a frequent enough problem.
5. Users understand and value constrained Agent Pass permissions.
6. The combined experience is simpler than using a wallet + bridge + ramp separately.

These must be tested with target users before or during Build Week.

## The problem Telya should own

Do not position the problem as:

> "There is no way to send stablecoins."

That is false.

Position it as:

> "Moving digital dollars across wallets, networks, ramps and agent workflows still exposes users to infrastructure decisions they should not need to understand."

Telya aims to reduce that cognitive burden while preserving verification and user control.

## Why Stellar matters

Stellar should not be a sponsor logo bolted onto the app.

Stellar provides:
- USDC settlement,
- fast finality,
- fee sponsorship,
- passkey smart accounts,
- delegated authorization/spending limits,
- fiat-ramp ecosystem,
- CCTP interoperability.

The user-facing abstraction should be powered by these primitives.

## Competitive risk

Telya risks becoming too broad if it tries to be:
- wallet,
- neobank,
- remittance company,
- bridge aggregator,
- AI assistant,
- merchant platform,
- ramp provider,
all at once.

Buildathon P0 must prove one coherent thesis:

**A user can tell Telya what payment outcome they want, safely review the route, execute it across Stellar/Base when needed, watch real finality, and optionally delegate bounded Stellar spending to an agent.**

## Validation success criteria

Before Build Week ends, we want evidence that:
- at least 5 target users understand the problem without explanation,
- at least 3 say current chain/bridge/gas flows are frustrating or confusing,
- at least 3 prefer the proposed review + visible-progress interaction,
- at least 2 find bounded Agent Pass meaningfully safer than unrestricted wallet access,
- no repeated feedback reveals a fatal misunderstanding in the core flow.

Record interview notes without personal/sensitive data.
