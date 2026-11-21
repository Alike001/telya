# Telya Roadmap

## P0 — Stellar Buildathon

Identity and onboarding:
- easy login,
- unique username,
- Stellar passkey smart account,
- Base account support.

Conversation:
- text,
- press-to-talk,
- interactive clarification,
- payment action cards,
- route explanation.

Payments:
- Stellar -> Stellar USDC,
- Base -> Base USDC,
- Base -> Stellar CCTP,
- Stellar -> Base CCTP,
- fee display/sponsorship where supported,
- visible finality,
- receipts/history.

Stellar:
- Smart Account Kit,
- passkeys,
- fee sponsorship,
- Agent Pass,
- spending limits,
- expiry/revocation.

Fiat:
- MoneyGram sandbox flows.

Reliability:
- idempotency,
- refresh recovery,
- durable PaymentEvents,
- explicit failure stages.

Judge experience:
- public Testnet URL,
- How to Test near top of README,
- prepared contacts/Testnet state,
- real Testnet execution.

## P1 — Post-hackathon hardening

- dedicated production domain,
- production-grade background jobs/workers,
- stronger monitoring/observability,
- richer contact verification,
- improved risk controls,
- production provider onboarding,
- CCTP Fast Transfer evaluation,
- richer fee-sponsorship policy.

## P2 — Local fiat and broader money movement

- production NGN bank-transfer adapter,
- supported Ghana/local-bank adapters,
- card onramp/offramp provider,
- provider abstraction by region,
- more settlement options.

## P3 — Business and automation

- merchant/business accounts,
- payment requests/links,
- scheduled/recurring payments,
- QR payments,
- richer Agent Pass policies,
- business teams,
- agent-specific budgets and categories.

## P4 — Expansion

- additional CCTP-supported chains where justified,
- more stablecoins only where there is a real rail/use case,
- native mobile apps,
- production Mainnet rollout across supported regions.

## Scope rule

Roadmap items must not enter Buildathon P0 unless they fix a blocker in the frozen MVP.
