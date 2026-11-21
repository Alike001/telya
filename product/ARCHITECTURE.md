# Telya Architecture

## System overview

Telya is one consumer product with several infrastructure layers hidden behind a conversational interface.

### Web application
Owns:
- landing and onboarding,
- auth UI,
- conversation UI,
- voice UI,
- payment preview,
- route explanation,
- live payment timeline,
- receipts/history,
- contacts,
- Agent Pass management,
- add/withdraw flows,
- Testnet demo mode.

### Server/API
Owns:
- authenticated application session verification,
- AI intent parsing,
- deterministic payment routing,
- contact resolution,
- fee policy,
- idempotency,
- payment state machine,
- CCTP coordination,
- ramp adapters,
- database persistence,
- secret-backed operations.

### Stellar layer
Owns:
- Smart Account Kit integration,
- passkey-controlled smart account,
- Stellar USDC,
- fee sponsorship,
- Agent Pass rules,
- Stellar direct transfers,
- Stellar side of CCTP,
- destination finality and verification.

### Base layer
Owns:
- Base wallet/account integration,
- Base USDC direct transfers,
- Base side of CCTP,
- source/destination transaction verification.

### Data layer
PostgreSQL/Neon stores:
- users,
- usernames,
- wallets,
- contacts,
- conversations,
- messages,
- payment intents,
- route decisions,
- payments,
- payment events,
- Agent Pass metadata,
- ramp transactions,
- user preferences.

## Core domain objects

### User
Identity, profile, username, preferences.

### Wallet
Network-specific wallet/account record.

### Contact
Human-readable recipient record containing verified destination addresses and optional preferred network.

### PaymentIntent
Structured representation of what the user asked to do.

### RouteDecision
Why a specific source, destination, and rail were chosen.

### Payment
The overall financial operation.

### PaymentEvent
A durable timeline event for each state transition.

### AgentPass
Metadata describing the Stellar on-chain delegated permission.

### RampTransaction
Provider-backed cash-in/cash-out state.

## Route matrix

| Source | Destination | Route |
|---|---|---|
| Stellar | Stellar | direct Stellar USDC |
| Base | Base | direct Base USDC |
| Base | Stellar | CCTP Standard |
| Stellar | Base | CCTP Standard |

## Routing rules

Priority:
1. explicit source/destination in user intent,
2. selected source wallet,
3. destination address network,
4. contact preference,
5. network with sufficient balance,
6. ask the user if ambiguous.

The system must persist the route decision and its reason.

## Payment state machine

Common states:
- `created`
- `route_resolved`
- `awaiting_confirmation`
- `authorized`
- `submitted`
- `source_confirmed`
- `awaiting_attestation`
- `destination_submitted`
- `destination_confirmed`
- `recipient_verified`
- `completed`
- `failed`

Cross-chain completion requires destination verification.

## Payment event model

Each event should contain:
- payment ID,
- stage,
- status,
- network,
- tx hash where applicable,
- started/completed timestamps,
- public message,
- debug message,
- error code,
- explorer/reference URL where applicable.

The consumer view is concise. The developer/debug view may expose deeper details.

## Idempotency

Every irreversible execution must use an idempotency key derived from the payment/operation.

Repeated button presses or retries must never create duplicate financial execution.

## Refresh/recovery

A browser refresh must reconstruct payment state from durable backend/database state and chain/provider reconciliation.

Never require a user to resubmit an irreversible step merely because the UI refreshed.

## AI boundary

AI produces structured intent only.

It must not:
- sign,
- access secrets,
- choose unsupported rails,
- bypass policy,
- invent wallet addresses.

## Deployment shape

Initial Buildathon target:
- GitHub repository,
- Vercel full-stack web/server deployment,
- Neon Postgres,
- public neutral `*.vercel.app` URL.

Use server-side environment variables for all secrets.

## Configuration

Example environments:

Testnet:
- Stellar Testnet
- Base Sepolia
- Circle test/sandbox configuration
- MoneyGram sandbox

Production:
- Stellar Mainnet
- Base Mainnet
- production provider credentials

Network-specific values must be configuration, not scattered business logic.
