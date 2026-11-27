# Telya Independent Test Runbook

**Status:** Prepared, not yet executed.

**Purpose:** Let an unfamiliar tester evaluate Telya without a team member explaining hidden setup, while keeping every financial claim tied to real Testnet evidence.

This runbook does not authorize Mainnet activity. Testers must use prepared Testnet accounts and small Testnet USDC amounts only.

## Before inviting a tester

The engineering lead must complete this gate. Do not ask the tester to diagnose infrastructure or supply credentials.

- [ ] Record the exact tested Git commit and deployment URL.
- [ ] Confirm the deployment displays **Testnet** and `/api/health` reports application/database ready.
- [ ] Run the branch's secret-safe environment preflight. Every requirement for the selected flow must report `READY`.
- [ ] Confirm the tester's Privy sign-in method works without sharing a team account.
- [ ] Prepare two distinct, verified users with unique usernames and verified destination wallets.
- [ ] Prepare small real Testnet USDC balances and enough native Testnet gas/sponsorship for the intended actions.
- [ ] Record starting balances privately. Do not put secrets, OTPs, passkey material or recovery data in this document.
- [ ] Select only routes already accepted for live testing. Disable or label every other route unavailable.
- [ ] Verify the browser recording area excludes password managers, notifications, developer tokens and unrelated tabs.

If any item is false, postpone the interactive session. The no-wallet public-evidence review may still run.

## Tester context

Ask the tester to complete these fields before starting:

| Field | Tester response |
| --- | --- |
| Session date/time and timezone |  |
| Tester identifier or consented pseudonym |  |
| Prior stablecoin experience | None / some / frequent |
| Browser and version |  |
| Device and operating system |  |
| Deployment URL |  |
| Tested Git commit |  |
| Approved Testnet routes |  |

Do not collect a private key, passkey, OTP, access token, database URL or provider credential.

## Part A — unaided comprehension and public evidence

The tester should receive only the deployment URL and [submission package](SUBMISSION-PACKAGE.md).

1. Open the application in a signed-out browser.
2. State, in your own words, what Telya does and whether it is Testnet or Mainnet.
3. Find the health/evidence instructions without verbal help.
4. Open the documented direct Stellar payment and Agent Pass transactions.
5. Identify which capabilities are verified, which are draft, and which are externally blocked.

Record:

- Time until the tester can explain Telya correctly.
- Any wording that implies real funds, production availability or unsupported route completion.
- Any broken link or evidence field the tester cannot independently interpret.
- Whether the tester understands that rejected Agent Pass attempts intentionally have no successful transaction hash.

## Part B — authenticated onboarding

Run only after the pre-session gate is complete.

1. Sign in using the enabled Privy method.
2. Enter a valid new username; observe database-backed availability.
3. Try the same username with different letter casing from the second prepared user. It must not appear available or become claimable.
4. Create the Stellar smart account with a device passkey.
5. Record the resulting `C...` account and real deployment transaction.
6. Refresh. The same authenticated user and smart account must restore.
7. Sign out, choose reconnect, complete the passkey prompt and verify the same account returns.
8. Cancel one passkey prompt. The UI must show cancellation/failure and must not claim connection or deployment.

Evidence:

| Field | Result |
| --- | --- |
| Username claimed |  |
| Case-insensitive collision rejected | Yes / No |
| Smart account |  |
| Deployment transaction |  |
| Refresh restored same account | Yes / No |
| Reconnect restored same account | Yes / No |
| Cancelled prompt stayed unconnected | Yes / No |

## Part C — recipient, review and payment

Use the strongest accepted route. Until cross-chain acceptance exists, use direct Stellar Testnet USDC.

1. Save the second prepared user as a contact.
2. Enter a typed payment request such as “Send 0.1 USDC to @recipient.”
3. Before confirming, explain aloud:
   - resolved recipient;
   - source and destination networks;
   - route;
   - sender cost and recipient amount;
   - sponsorship or gas responsibility.
4. Confirm only after those values match the prepared recipient.
5. Complete the wallet/passkey authorization.
6. Observe persisted stages. A source hash alone must not appear as completed.
7. Refresh once while the payment is nonterminal, if timing permits. The same payment must restore without another signature or transfer.
8. Open the final receipt and explorer/provider references.
9. Compare expected and actual recipient, amount, finality and balances.
10. Click Confirm twice during a separate prepared attempt. There must be at most one irreversible transfer.

Evidence:

| Field | Expected | Actual |
| --- | --- | --- |
| Payment ID | One durable ID |  |
| Source network |  |  |
| Destination network |  |  |
| Intended recipient |  |  |
| Verified recipient | Same as intended |  |
| Requested amount |  |  |
| Accepted amount |  |  |
| Fee and payer |  |  |
| Source transaction | Real Testnet hash |  |
| Destination transaction, if distinct | Real Testnet hash |  |
| Final state | Completed only after verification |  |
| Refresh caused another submission | No |  |
| Duplicate confirm caused another transfer | No |  |

## Part D — truthful failure and fallback paths

Perform only actions that cannot risk an unintended transfer.

1. Enter an unknown username. Submission must remain blocked.
2. Enter an amount above the real available balance. Submission must remain blocked; the UI must not substitute another network.
3. Enter an ambiguous request with no determinable source/destination. Telya must ask for clarification.
4. Deny microphone permission or stop an empty recording. Typed/manual entry must remain usable, and no sample request may be injected or submitted.
5. Cancel wallet/passkey authorization. The payment must remain unsubmitted unless a real provider result proves otherwise.
6. Reopen an existing failed or pending payment. The displayed failure/pending stage must come from persisted events.
7. Open MoneyGram. Until partner acceptance exists, it must remain explicitly unavailable and must show no invented fee, reference or success.

For each case, record the exact input, expected behavior, actual behavior and whether any transaction or balance movement occurred.

## Part E — Agent Pass

Run with a funded, verified Stellar smart account and a small cumulative allowance.

1. Create a USDC-only Agent Pass with a visible limit and expiry; authorize with the owner passkey.
2. Record the rule and creation transaction.
3. Submit an agent payment below the remaining cumulative allowance.
4. Verify the real transfer, cumulative spend and current-ledger expiry state.
5. Attempt an amount that would exceed the cumulative allowance. It must be rejected with no successful transfer.
6. Revoke using the owner passkey and record the revocation transaction.
7. Attempt another agent payment. It must be rejected with no movement.
8. Make a small owner-authorized payment. The owner must retain control after revocation.

Evidence:

| Field | Result |
| --- | --- |
| Smart account |  |
| Limit and expiry ledger |  |
| Creation transaction |  |
| Allowed-spend transaction and amount |  |
| Cumulative overspend rejected with no transfer | Yes / No |
| Revocation transaction |  |
| Post-revocation attempt rejected with no transfer | Yes / No |
| Owner-after-revocation transaction |  |

## Cross-chain extension

Do not run this section until both CCTP directions have accepted live evidence and the tested deployment contains that code.

For each enabled Base Sepolia ↔ Stellar Testnet direction, capture:

- source and destination transaction hashes;
- Circle message and attestation status/reference;
- expected and actual source address;
- expected and actual recipient;
- gross amount, fee, expected net amount and actual received amount;
- source and destination finality;
- persisted PaymentEvent sequence;
- one interrupted-response/restart recovery using the same operation;
- proof that duplicate confirmation/callback caused no duplicate transfer.

Source burn or submission alone is a nonterminal result.

## Bug report format

Create one report per distinct problem:

```text
Title:
Severity: P0 financial/security | P1 blocks journey | P2 confusing/polish
Deployment URL and Git commit:
Browser/device:
Starting state:
Exact steps:
Expected result:
Actual result:
Payment ID (if safe to share):
Public Testnet transaction hash (if applicable):
Did funds move? Yes / No / Unknown
Screenshot or recording (secrets and personal data redacted):
Console/network evidence (tokens, cookies and credentials removed):
Can reproduce? Always / Sometimes / Once
```

Stop the session immediately for a wrong recipient/amount, duplicate transfer, unauthorized action, false completion, exposed secret, cross-user data access or Mainnet prompt. Preserve evidence and do not retry the financial action until engineering reviews it.

## Session verdict

The tester chooses one:

- **Pass:** the approved journey completed with exact evidence and no P0/P1 finding.
- **Pass with findings:** the journey completed, but reproducible nonblocking findings remain.
- **Fail:** the journey or a financial/security invariant failed.
- **Blocked:** external setup prevented the test before a wallet action; no product-pass claim.

Record the verdict, findings/issues, retest commit and final disposition in the execution tracker. A team member's walkthrough does not count as independent testing.
