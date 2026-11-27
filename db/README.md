# Database foundation

`migrations/0001_foundation.sql` is the initial PostgreSQL schema for the
Neon database. It is intentionally server-side only. Never expose
`DATABASE_URL` to browser code. Install dependencies with `npm install`, then
run `npm run db:migrate` from the repository root using a direct (non-pooler)
Neon connection URL. The migration command takes a Postgres advisory lock,
records checksums in `schema_migrations`, and rejects edits to applied files.

The Stellar and Base CCTP operation tables are added by migrations `0006`,
`0007`, and `0008` in order. Migration `0008_base_cctp.sql` persists Base
transaction evidence, Circle message/attestation bytes and hashes, trusted
source burn/fee values, and the Base destination submission lease.

## Identity and sessions

Authenticate requests by verifying a Privy access token on the server. Derive
the application user from the verified Privy DID (`sub`); never accept a user
ID supplied by the browser as proof of identity. Store the verified Privy
session ID (`sid`) and its expiry in `auth_sessions`, but never persist bearer
tokens. Every request verifies the current token expiry with Privy and checks
the stored session revocation state before returning the application user.

## Username registry

Normalize a submitted handle by trimming whitespace, removing one optional
leading `@`, then lowercasing. Store the normalized handle without `@`; the
database accepts 3–30 ASCII letters, digits, and underscores. The registry's
primary key arbitrates simultaneous claims. A uniqueness conflict means the
name is unavailable. Registry rows with status `reserved` block system names;
rows with status `retired` permanently block previously used names. If a user
changes names, retire the previous active row and insert the new row in one
database transaction. Do not delete or transfer registry rows.

The seed list in the migration is a conservative initial set. Add product or
provider names through a reviewed migration before making them claimable.

## Financial records

Payments are idempotent per user. Their route columns are constrained to the
four P0 paths. A payment cannot be stored as completed without a destination
transaction, a verified recipient address, the expected recipient amount, and
a verification timestamp. Preserve provider and chain state in
`payment_events`; event keys make repeated callbacks idempotent.

USDC amounts use PostgreSQL `numeric`, never floating-point columns. Application
code should accept and return decimal strings. Wallet normalized addresses are
lowercase for Base and exact-case for Stellar; validation of an address and
proof of wallet ownership remain application/provider responsibilities.

All SQL must use bound parameters. Run migrations with a server-side credential;
do not run schema SQL from a public request handler.
