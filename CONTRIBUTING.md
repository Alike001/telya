# Contributing to Telya

## Workflow

1. Pick or create an issue.
2. Create a focused branch.
3. Implement and test.
4. Open a pull request.
5. Review.
6. Merge only when required checks pass.

## Branch examples

- `feat/ST-07-agent-pass`
- `feat/FE-08-payment-timeline`
- `feat/BE-12-circle-attestation`
- `fix/FE-09-mobile-overflow`

## Main branch rule

`main` should remain deployable.

Avoid direct pushes to `main` during Build Week.

## PR expectations

Describe:
- what changed,
- linked issue,
- how to test,
- screenshots for UI,
- relevant Testnet transaction evidence,
- known limitations.

## Financial correctness

Never merge code that:
- fakes transaction completion,
- retries an irreversible payment without idempotency,
- exposes secrets client-side,
- treats source confirmation as cross-chain completion.
