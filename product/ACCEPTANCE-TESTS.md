# Telya Acceptance Tests

P0 is not complete until these behaviors are proven.

## Identity
- [ ] New user can complete onboarding.
- [ ] User can claim a unique username.
- [ ] `Alice`, `alice`, and `ALICE` cannot be registered by different users.
- [ ] Username resolves to the correct verified destination record.
- [ ] Reserved usernames are rejected.

## Stellar wallet
- [ ] Stellar smart account can be created/connected with passkey ownership.
- [ ] User can return and restore their application/account state.
- [ ] Sponsor secret is never exposed to the browser.

## Direct payments
- [ ] Stellar -> Stellar USDC succeeds and recipient receives expected amount.
- [ ] Base -> Base USDC succeeds and recipient receives expected amount.
- [ ] Insufficient balance prevents submission.
- [ ] Ambiguous route asks the user instead of guessing.

## Base -> Stellar CCTP
- [ ] Source route is resolved and explained.
- [ ] Base source operation is submitted.
- [ ] Source confirmation is recorded.
- [ ] Circle attestation/status is tracked.
- [ ] Stellar destination operation is submitted.
- [ ] Stellar finality is confirmed.
- [ ] Final recipient is verified.
- [ ] Final amount is verified.
- [ ] Only then is payment marked completed.

## Stellar -> Base CCTP
- [ ] Stellar source operation succeeds.
- [ ] Circle attestation/status is tracked.
- [ ] Base destination operation succeeds.
- [ ] Destination recipient and amount are verified.
- [ ] Only then is payment marked completed.

## Progress/finality UX
- [ ] Consumer sees real state transitions.
- [ ] Elapsed time is displayed without fake countdowns.
- [ ] Refresh during a pending payment restores the same operation.
- [ ] Failure identifies the stage that failed.
- [ ] Completed receipt includes relevant transaction references.

## Voice / AI
- [ ] Voice request and typed equivalent produce the same structured intent.
- [ ] AI cannot produce/sign a transaction directly.
- [ ] AI outage still leaves a manual payment path.
- [ ] Voice outage still leaves typed payment path.

## Agent Pass
- [ ] User can create scoped Stellar USDC Agent Pass.
- [ ] Agent payment within limit succeeds.
- [ ] Cumulative payment above limit is rejected.
- [ ] Owner can revoke Agent Pass.
- [ ] Agent cannot spend after revocation.
- [ ] Owner can still spend after revocation.

## Idempotency
- [ ] Double-clicking Confirm does not duplicate payment.
- [ ] Repeated provider callback/status does not duplicate destination execution.
- [ ] Browser retry after timeout does not create a second irreversible operation.

## Ramps
- [ ] MoneyGram sandbox flow is clearly labelled sandbox.
- [ ] Provider quote/fees are shown honestly.
- [ ] Ramp failure does not break crypto payments.

## Judge/Testnet mode
- [ ] Public URL loads without private credentials.
- [ ] README How to Test is near the top.
- [ ] Testnet mode is clearly visible.
- [ ] Demo contacts/state are realistic.
- [ ] Live payment actions use real Testnet transactions.
