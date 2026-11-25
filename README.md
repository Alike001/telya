# Telya

**Conversational money movement on Stellar.**

Telya lets people speak or type what they want to do with USDC, then safely routes payments across Stellar and Base, exposes real transaction progress until finality, supports fiat ramp flows, and enables limited, revocable AI-agent spending through Stellar smart accounts.

> Team Bravo — Stellar Buildathon 2026

## How to Test

Telya is now in Build Week implementation. The public shell is intentionally
honest about its current state: it shows the frozen Testnet route matrix and a
route preview, but never displays a fake completed transaction.

Local development:

Node.js 22 or newer and pnpm 11 are required.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The readiness endpoint is available at
`http://localhost:3000/api/health`; it returns HTTP `200` only when the app can
reach Neon and HTTP `503` with a sanitized `degraded` response otherwise.

Stellar passkey account flow:

1. Configure the public Stellar Testnet values from `.env.example` and keep
   `STELLAR_FEE_SPONSOR_SECRET` server-only. Never use a `NEXT_PUBLIC_*` name for
   the sponsor secret.
2. Apply the database migrations with the direct Neon connection so relayer
   reservations and rate limits fail closed: `pnpm db:migrate`.
3. Open the passkey account panel on `http://localhost:3000` (localhost is a
   valid WebAuthn secure context), enter a passkey label, and create the account.
4. Verify that the resulting contract and deployment transaction links open on
   Stellar Expert Testnet.
5. Refresh the page and verify the same contract restores silently.
6. Sign out on this browser, choose **Reconnect existing account**, complete the
   passkey prompt, and verify the same contract reconnects.
7. Fund the smart-account contract with Circle Testnet USDC, enter a distinct
   Stellar Testnet recipient and amount, then choose **Authorize and send**.
8. Approve the exact transfer with the account passkey. Verify the receipt shows
   `completed` only after Stellar finality and exact recipient/amount matching.
9. Refresh the page and verify the last receipt and its event timeline restore.

Agent Pass flow (direct Stellar USDC only):

1. Keep the passkey account connected and funded with Testnet USDC.
2. Enter a cumulative allowance and choose **Create Agent Pass**. Approve the
   owner prompt and verify the creation transaction on Stellar Expert.
3. Enter a recipient and an amount below the allowance, then choose **Send as
   agent**. Verify the receipt is completed under the displayed context rule
   and the on-chain cumulative spend increases.
4. Attempt another agent payment whose cumulative total exceeds the allowance.
   Verify Smart Account Kit reports the genuine on-chain spending-limit
   rejection and no successful transfer is claimed.
5. Choose **Revoke with passkey**, approve the owner prompt, and verify the
   revocation transaction.
6. Choose **Prove agent is blocked** and verify the revoked agent is rejected.
7. Use the owner **Authorize and send** control above to verify the passkey
   owner can still pay after agent revocation.

The demo agent key is generated in the browser and retained only in memory for
the current page. It is never sent to the AI, database, relayer, or browser
storage. The database stores public rule metadata, cumulative verified spend,
and transaction references; the Stellar context rule and spending-limit policy
remain the authorization source of truth.

The UI reports deployment as connected only after the relayer returns a real
transaction hash and Smart Account Kit verifies the confirmed deployment. A
relayer, network, or on-chain failure remains visible as a failure and is never
presented as account creation success.

Direct Stellar payments use the configured `STELLAR_USDC_SAC` only. Smart
Account Kit signs the exact token invocation with the user's passkey; the
server relayer allowlists and revalidates its token, sender, recipient, amount,
and authorization before paying the network fee. Durable events record
authorization, submission, destination finality, recipient verification, and
completion. `GET /api/stellar/transfers/<transaction-hash>` returns the
consumer-safe receipt used for refresh recovery. It never returns passkey data,
the sponsor key, database credentials, or internal diagnostics.

Agent Pass administration is also narrowly allowlisted by the relayer: only an
owner-passkey-authorized `CallContract` rule for the configured USDC contract,
one configured Ed25519 verifier signer, one configured spending-limit policy,
and owner-authorized removal of a recorded Agent Pass rule are sponsored.

Runtime behavior:

- local and preview environments use Testnet configuration;
- the production branch is `main` and deploys to the existing Vercel project;
- `NEXT_PUBLIC_*` values are browser-safe and build-time inlined;
- `DATABASE_URL` and all sponsor/provider secrets remain server-only;
- the health endpoint never returns connection strings or provider errors.

Public Testnet deployment: [telya.vercel.app](https://telya.vercel.app)

Production readiness is available at
[telya.vercel.app/api/health](https://telya.vercel.app/api/health). The exact
judge walkthrough will be added after the end-to-end Testnet payment flow is
verified.

Planned test environment:
- Stellar Testnet
- Base Sepolia
- Circle CCTP test configuration
- MoneyGram sandbox

The final judge flow will include:
1. Open the public Testnet app.
2. Use a prepared Testnet profile/contact.
3. Send USDC on a same-chain or cross-chain route.
4. Watch real payment-state transitions.
5. Open the final receipt and transaction references.
6. Try Agent Pass spending and limit/revocation behavior.

## Problem

A simple stablecoin payment should not require users to understand wallets, networks, gas tokens, bridges, and settlement mechanics.

AI agents also need safer wallet permissions than unrestricted access.

## What Telya does

- Conversational text and voice payment intent.
- Stellar passkey smart account.
- Stellar USDC payments with fee sponsorship.
- Base USDC payments.
- Bidirectional Base <-> Stellar USDC through Circle CCTP Standard.
- Visible money movement and finality.
- Persistent history and receipts.
- Unique human-readable usernames mapped to verified wallet records.
- Agent Pass: limited, expiring, revocable Stellar agent spending.
- MoneyGram sandbox cash-in/cash-out integration.

## Required payment routes

| Source | Destination | Rail |
|---|---|---|
| Stellar | Stellar | Direct Stellar USDC |
| Base | Base | Direct Base USDC |
| Base | Stellar | Circle CCTP Standard |
| Stellar | Base | Circle CCTP Standard |

## Trust rule

Telya never marks a cross-chain payment complete because the source transaction succeeded.

Completion requires destination finality plus recipient and amount verification.

## Documentation

If you are a developer or AI agent joining the project, start here:

- [Current project status](product/STATUS.md)
- [Judging and grant readiness baseline](product/JUDGING-AND-GRANT-READINESS.md)
- [Universal agent handoff](handoffs/AGENT-HANDOFF.md)
- [Product requirements](product/PRD.md)
- [Architecture](product/ARCHITECTURE.md)
- [Build plan](product/BUILD-PLAN.md)
- [Acceptance tests](product/ACCEPTANCE-TESTS.md)
- [Team responsibilities](product/TEAM.md)
- [Decision log](product/DECISIONS.md)
- [Roadmap](product/ROADMAP.md)
- [Database setup and migrations](db/README.md)
- [Agent operating rules](AGENTS.md)

## Development status

Foundation planning is complete and stored in the repository so all three contributors and their coding agents work from the same source of truth.

Build Week begins November 25, 2026. Until then, keep work to preparation, accounts, documentation, deployment plumbing, and Testnet setup unless organizers explicitly permit earlier substantive feature implementation.

Feature implementation begins from the shared contracts and acceptance criteria defined in this repository.
