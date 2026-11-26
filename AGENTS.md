# Telya Agent Operating Rules

This repository is the source of truth for Telya.

Before making changes, read:
1. `product/STATUS.md`
2. `product/JUDGING-AND-GRANT-READINESS.md`
3. `handoffs/AGENT-HANDOFF.md`
4. `product/PRD.md`
5. `product/ARCHITECTURE.md`
6. `product/DECISIONS.md`
7. `product/BUILD-PLAN.md`
8. `product/TEAM.md`
9. `product/ACCEPTANCE-TESTS.md`
10. `product/SETLORA-LESSONS.md`
11. `product/BUILD-WEEK-DAY1.md` when Build Week implementation begins
12. The handoff for your assigned area.

If these files conflict with an agent's assumptions, the repository files win.

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
- Do not declare a major feature complete without the evidence required by `product/JUDGING-AND-GRANT-READINESS.md`.

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


## New-agent safety rule

A replacement AI agent must not invent a new task, restart planning, or broaden scope simply because prior chat context is unavailable.

If the next action is unclear:
1. read `product/STATUS.md`;
2. read `product/BUILD-WEEK-DAY1.md`;
3. inspect open assigned GitHub issues;
4. continue the highest-priority assigned P0 issue.

Architecture changes require a documented blocker or explicit team decision.


## Hackathon execution lesson

Read `product/SETLORA-LESSONS.md` before Build Week execution. It preserves judging lessons from a previous hackathon and changes prioritization/evidence strategy only. It does **not** remove or alter the frozen Telya P0 scope.
