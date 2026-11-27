# Telya Agent Operating Rules

This repository is the source of truth for Telya. Codex is the primary engineering lead for the remaining Buildathon implementation, testing, integration and submission-preparation work. Hammed (@Alike001) is the product owner.

## Mandatory start-of-session reading

At the start of every new Codex session, read these files in order:

1. `AGENTS.md`
2. `product/CODEX-MASTER-PLAYBOOK.md`
3. `product/EXECUTION-TRACKER.md`
4. `product/STATUS.md`
5. `product/BUILDATHON-EXECUTION-PLAN.md`
6. `product/JUDGING-AND-GRANT-READINESS.md`
7. `product/PRD.md`
8. `product/ARCHITECTURE.md`
9. `product/DECISIONS.md`
10. `product/ACCEPTANCE-TESTS.md`
11. `product/TEAM.md`
12. `product/SETLORA-LESSONS.md`
13. `handoffs/AGENT-HANDOFF.md`
14. The current GitHub PRs/issues and exact source files for the next task.

GitHub and current code are authoritative when a static document is stale. Refresh the tracker after verifying a changed state. Do not rely on chat history or a PR author's comment without inspecting the code and evidence.

## Operating authority

- Codex owns the task queue and implementation execution through the final Buildathon submission package.
- Hammed remains the product owner and final authority on product scope, external identity, secrets, account authorization, organizer answers and real Testnet actions requiring his account.
- Teammates may contribute or independently test when available, but their availability is not a blocker. Continue work on their assigned P0 issues when they are unavailable.
- Fix the existing teammate PR directly where authorized. Preserve the PR number and history. If write access to the PR head fork is unavailable, request the author to enable maintainer edits or ask Hammed to grant access. Do not make a duplicate implementation just to avoid the existing PR.
- Keep the live execution tracker, status, issue state and PR validation notes current after every significant change.
- Do not commit directly to main. Use the existing PR branch or a focused feature branch.
- Codex may merge only when all playbook acceptance, security, CI, database and real Testnet gates have been satisfied.

## Non-negotiable product and financial rules

- Do not rename Telya.
- Do not expand P0 without product approval.
- Do not replace Stellar Smart Account Kit as the Stellar account architecture.
- Do not replace Circle CCTP Standard as the Base ↔ Stellar USDC rail.
- Do not let an LLM sign transactions, hold keys or choose execution logic.
- Do not expose sponsor, AI, database, Privy, Circle, MoneyGram or RPC secrets to the browser or logs.
- Do not use mock financial data in application paths.
- Do not claim a wallet is connected unless provider/SDK state verifies it.
- Do not claim a username is available when the DB/auth service is unavailable.
- Do not mark payment authorized/submitted/completed from a timer, optimistic update, hash alone or source burn alone.
- Do not mark a cross-chain payment complete until destination finality, recipient and amount have been verified.
- Do not silently guess an ambiguous source or destination network; ask the user.
- Usernames remain globally unique and case-insensitive, tied to authenticated identities and verified wallet records.
- Do not add unsupported chains or assets during P0.
- Keep Testnet behavior production-shaped; no Mainnet funds or real payout claims during Buildathon.
- Do not declare a major feature complete without evidence in the execution tracker and judging/readiness document.

## Product principle

At every stage of a financial operation, the user should be able to answer:

**Where is my money right now?**

Before sending, the user knows what will happen. While sending, the user sees real state transitions. After sending, the user sees verified completion. If something fails, the user sees which stage failed.

## Financial execution boundary

AI may parse natural language into a constrained intent only.

Deterministic server code must:
- authenticate the user;
- resolve recipient and verified wallet address;
- resolve source and destination networks;
- obtain real balances and quotes;
- choose the route and explain it;
- validate fees/policy and require clarification when needed;
- create an idempotent payment;
- require the correct wallet/passkey authorization;
- execute through approved chain/provider infrastructure;
- verify finality, recipient and amount;
- persist Payment and PaymentEvent state.

The AI must never bypass those steps.

## Quality gate

For each implementation task:
- inspect exact current branch/PR diff, source, schemas and acceptance criteria first;
- write regression tests for the reported failure;
- keep changes focused;
- run `pnpm test`, `pnpm typecheck`, `pnpm build` and `git diff --check`;
- also run `npx tsc --project tsconfig.server.json --noEmit --pretty false` for server/backend changes;
- report passed, failed, skipped and not-run tests distinctly;
- never treat a skipped DB/Testnet test as a pass;
- keep financial PRs draft until real Testnet and persistence evidence exists.

## Human-controlled blockers

Never ask Hammed to paste secrets into chat. Ask him only to configure credentials in a secure environment, authorize a wallet/test transaction, approve access to teammate PR forks, authorize Vercel, provide organizer/provider replies or decide a genuine product ambiguity. Continue every independent task while waiting.

## Continuity and judging

Read `product/SETLORA-LESSONS.md` before demo preparation. Prefer one complete real user outcome with failure/recovery handling and independently inspectable evidence over a list of half-finished features. Follow `product/CODEX-MASTER-PLAYBOOK.md` for the complete start-to-finish execution sequence.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
