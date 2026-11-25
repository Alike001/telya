# Telya Decision Log

## D-001 — Stellar remains the financial core
Privy/auth infrastructure may simplify onboarding and Base access, but Stellar owns the main smart-account, passkey, fee-sponsorship, Agent Pass, Stellar USDC, and Stellar-side settlement experience.

## D-002 — One consumer product, not a crypto dashboard
Users interact through conversational and financial concepts rather than Soroban/CCTP/RPC jargon.

## D-003 — Bidirectional cross-chain is P0
Required routes:
- Base -> Stellar
- Stellar -> Base

Same-chain routes are also P0.

## D-004 — Circle CCTP Standard for Buildathon
Use native USDC cross-chain movement. Do not add broad bridge aggregation in P0.

## D-005 — Exact recipient amount for crypto-to-crypto
The requested transfer amount should be the intended recipient amount. Network/provider costs are displayed separately. Fiat-ramp cash output follows provider quote/fees.

## D-006 — Deterministic routing
AI extracts intent. Deterministic code resolves recipient/network/route and asks for clarification when ambiguous.

## D-007 — Visible finality
The consumer sees real payment movement and elapsed time. No fake countdown or fake success.

## D-008 — Destination verification defines completion
A cross-chain source burn is not completion. Destination finality, recipient, and amount must be verified.

## D-009 — Agent Pass scope
P0 Agent Pass controls direct Stellar USDC only. Autonomous cross-chain agent spending is roadmap.

## D-010 — Unique usernames
Usernames are case-insensitive, globally unique application identifiers that resolve to verified wallet records.

## D-011 — Testnet should be production-shaped
Build on Stellar Testnet and Base Sepolia with configuration boundaries that make Mainnet migration a provider/network change rather than a product rewrite.

## D-012 — Neutral deployment identity
Use a neutral free project URL such as `telya.vercel.app` if available rather than a personal domain.

## D-013 — Deployment architecture
Initial target:
- Vercel full-stack app/server routes
- Neon Postgres
- server-only secrets

Move to dedicated workers/services only if the implementation actually requires them.

## D-014 — Build Week timing
Team Bravo voluntarily begins substantive Telya implementation on **November 25, 2026**. Before then, only preparation/setup work is planned.

## D-015 — Target-user interviews are optional pre-build
Five target-user interviews are not required before Build Week. User feedback may be collected later if practical, but it is not a blocker for implementation.

## D-016 — Smart wallet terminology
Use the exact term **Stellar Smart Account Kit** for Telya's passkey smart-wallet architecture. Do not conflate it with separate Stellar agent tooling.

## D-017 — Final submission date
Hammed confirmed the final submission date as **November 30, 2026**.

The exact cutoff time and timezone still need to be recorded from organizer guidance before Issue #22 is closed. Required artifacts, judging criteria, public-link requirements, and any mandatory demo/video format remain governed by the confirmed organizer instructions and must not be guessed.
