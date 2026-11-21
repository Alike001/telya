# Telya Product Requirements Document

## Product

**Name:** Telya  
**Team:** Bravo  
**Working positioning:** Conversational money movement on Stellar.

## Problem

Stablecoin payments still force ordinary users to understand wallets, networks, gas tokens, bridges, and settlement flows before they can make a simple payment.

At the same time, AI agents can increasingly act for users, but unrestricted wallet access is unsafe.

## Solution

Telya lets a user speak or type what they want to do with USDC. The application converts that request into a structured intent, resolves the recipient and networks, chooses a deterministic route, shows exactly what will happen, requests the correct authorization, executes the payment, and exposes real transaction progress until finality.

Telya also supports limited, expiring, revocable AI-agent spending on Stellar through smart-account rules.

## Target users

Primary:
- freelancers,
- remote workers,
- small businesses,
- consumers who use digital dollars but do not want to understand blockchain mechanics.

## P0 MVP

### Identity and onboarding
- Easy signup/login.
- Unique case-insensitive `@username`.
- Username resolves to verified wallet records; the username itself is never the on-chain destination.
- Consumer-friendly onboarding without seed phrases.
- Stellar smart account controlled by a passkey.
- Base wallet support for Base payment routes.

### Conversational interface
- Text input.
- Press-to-talk voice input.
- Structured AI intent extraction.
- Interactive conversation that explains payment decisions.
- Action cards for review, progress, receipts, and failures.
- Typed/manual payment fallback if AI or voice is unavailable.

### Payments
Required route matrix:
- Stellar -> Stellar USDC.
- Base -> Base USDC.
- Base -> Stellar USDC using Circle CCTP Standard.
- Stellar -> Base USDC using Circle CCTP Standard.

For ordinary crypto-to-crypto transfers, the amount the user enters is the amount the recipient should receive. Network/provider costs are shown separately.

### Routing
Routing priority:
1. Explicit user instruction.
2. User-selected source wallet/network.
3. Destination address network.
4. Contact preferred receive network.
5. Only network with sufficient balance.
6. If still ambiguous, ask the user.

The AI does not choose blockchain execution logic.

### Stellar
- Smart Account Kit.
- Passkey ownership.
- Stellar USDC.
- Fee sponsorship.
- Agent Pass.
- Spending limits.
- Expiry.
- Revocation.
- Owner retains control after agent revocation.

### Agent Pass scope for Buildathon
Agent Pass P0 is scoped to direct Stellar USDC spending. Cross-chain autonomous agent execution is not required in P0.

### Cross-chain
- Bidirectional Base <-> Stellar.
- Circle CCTP Standard.
- Base -> Stellar must verify final Stellar recipient and amount.
- Stellar -> Base must verify final Base recipient and amount.
- Source burn success alone is never completion.

### Fiat ramps
- MoneyGram sandbox integration.
- Cash-in and cash-out flows where sandbox capabilities permit.
- All sandbox behavior must be labeled honestly.
- Do not claim unsupported production corridors.

### Trust and finality UX
Every payment exposes a visible progress timeline driven by real backend state.

Examples:
- payment approved,
- submitted,
- source confirmed,
- waiting for attestation,
- destination submitted,
- destination confirmed,
- recipient verified,
- completed.

The UI must show elapsed time, not fake countdowns.

### History and receipts
- Persistent conversation history.
- Persistent payment history.
- Route explanation.
- Source/destination transaction references where relevant.
- Expected vs actual recipient amount.
- Failure stage and reason.

### Judge/Testnet mode
- Public Testnet URL.
- Clearly labeled Testnet mode.
- Prepared contacts and pre-funded Testnet state are allowed.
- Live financial actions must use real Testnet infrastructure.
- Never fake completed blockchain transactions.

## Payment invariant

A payment is `COMPLETED` only after:
- destination transaction finality is verified,
- recipient matches the expected recipient,
- received amount satisfies the route's acceptance policy.

## Username rules

- Globally unique.
- Case-insensitive.
- Normalize before storage.
- Database uniqueness constraint is authoritative.
- Reserved system names are blocked.
- A formerly used payment username should not be automatically reassigned to a different person.

## Testnet -> Mainnet principle

Buildathon:
- Stellar Testnet,
- Base Sepolia,
- Circle sandbox/test configuration,
- MoneyGram sandbox,
- disposable sponsor infrastructure.

Mainnet:
- Stellar Mainnet,
- Base Mainnet,
- production providers,
- production sponsor/relayer controls.

Business logic should not be rewritten just to change networks.

## P1 / roadmap

Not Buildathon blockers:
- production NGN bank-account payout provider,
- card onramp/offramp,
- additional chains,
- additional stablecoins,
- CCTP Fast Transfer,
- recurring/scheduled payments,
- merchant accounts,
- team/business accounts,
- QR payments,
- richer autonomous-agent policies,
- native mobile apps,
- Mainnet launch.

## Demo goal

A judge should be able to understand Telya in under 30 seconds:

1. User speaks or types a payment request.
2. Telya explains the chosen route.
3. User reviews exact recipient amount and fees.
4. Payment executes.
5. User watches real progress/finality.
6. Receipt proves what happened.
7. Agent Pass demonstrates limited and revocable agent spending.
