# Backend / AI Handoff

Read:
- `../product/PRD.md`
- `../product/ARCHITECTURE.md`
- `../product/ACCEPTANCE-TESTS.md`

## Own

- API/server architecture,
- Neon/Postgres schema,
- auth/session verification,
- Base wallet/payment backend integration,
- structured AI intent parsing,
- STT/TTS provider integrations,
- conversation persistence,
- contacts,
- payment orchestrator,
- deterministic route engine,
- Base/Circle CCTP side,
- Circle attestation/status tracking,
- MoneyGram sandbox integration,
- payment-event persistence,
- API security.

## AI boundary

AI may return structured intent such as:

```json
{
  "action": "send",
  "recipient": "Alice",
  "amount": "5",
  "asset": "USDC"
}
```

AI must never:
- sign transactions,
- receive private keys,
- invent destination addresses,
- bypass spending policy,
- silently choose an ambiguous route.

## Deterministic routing

Persist:
- source network,
- destination network,
- route,
- reasons for each choice,
- expected recipient amount,
- fee display.

If source/destination is ambiguous, return a clarification state instead of guessing.

## Cross-chain safety

Source burn confirmation is not completion.

Persist all stages and only complete after destination recipient + amount verification.

Use idempotency for irreversible execution and repeated provider callbacks.
