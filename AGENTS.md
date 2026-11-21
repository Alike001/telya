# Telya Agent Operating Rules

This repository is the source of truth for Telya.

Before making changes, read:
1. `product/PRD.md`
2. `product/ARCHITECTURE.md`
3. `product/BUILD-PLAN.md`
4. `product/TEAM.md`
5. The handoff for your assigned area.

## Non-negotiable rules

- Do not rename Telya.
- Do not expand P0 without product approval.
- Do not replace Stellar Smart Account Kit as the Stellar account architecture.
- Do not replace Circle CCTP as the Base <-> Stellar USDC cross-chain rail.
- Do not let an LLM sign transactions or access private keys.
- Do not expose sponsor, AI, database, Circle, or MoneyGram secrets to the browser.
- Do not fake financial success states.
- Do not mark a cross-chain payment complete until the destination recipient and amount are verified.
- Do not silently guess an ambiguous source or destination network; ask the user.
- Do not change the rule that usernames are globally unique and case-insensitive.
- Do not add unsupported chains or assets during P0.
- Keep Testnet behavior production-shaped so Mainnet is primarily a configuration/provider transition.

## Product principle

At every stage of a financial operation, the user should be able to answer:

**Where is my money right now?**

Before sending, the user knows what will happen.
While sending, the user sees real state transitions.
After sending, the user sees verified completion.
If something fails, the user sees which stage failed.

## Financial execution boundary

The AI may understand language and produce structured intent.

The deterministic payment system must:
- resolve recipient,
- resolve source,
- choose route,
- calculate/display fees,
- validate policy,
- request authorization,
- execute,
- verify finality,
- persist state.

The AI must never bypass those steps.
