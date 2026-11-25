# Contacts, conversations, and payment orchestration

The framework-neutral authenticated handlers exported from `server/api/index.ts` are intended for the app/API runtime:

| Handler | Methods | Behavior |
| --- | --- | --- |
| `createContactsHandler` | `GET`, `POST`, `DELETE` | Lists, saves by active username, and removes the authenticated user's contacts |
| `createConversationsHandler` | `GET`, `POST` | Creates a conversation with the first user message, appends user messages, and reads owned history |
| `createPaymentHandler` | `GET`, `POST` | Reads a payment timeline or resolves recipient/route, obtains balance/fee quotes, and persists a reviewable payment and initial event |
| `createPaymentConfirmationHandler` | `POST` | Records the user's confirmation and an authorization event |

All handlers verify the Privy bearer session and scope database reads/writes to that user. Conversation history returns only user and assistant messages. Server-only assistant message persistence is available through `appendAssistantMessage`.

## Recipient resolution and routing

- A literal EVM address is classified as Base; Stellar account, muxed-account, and contract StrKeys are validated with the Stellar SDK.
- A username resolves only to an active registry entry with verified wallets. A saved contact resolves through its stable user ID and verified wallet records.
- Display-name matches must be unique. Missing/ambiguous recipients and absent verified wallets do not produce a payment.
- The route resolver applies explicit network intent, a selected source wallet, destination address network, contact receive preference, then known sufficient balances. It returns a clarification when a choice remains ambiguous.
- Amount and per-wallet balances are compared as decimal strings using integer arithmetic. Client-supplied balances and fees are never accepted.

## Payment flow

Payment creation requires an existing user message ID from the owned conversation and an `Idempotency-Key` header. For text/voice intents, the amount, recipient, and requested networks are checked against that saved message. The selected verified source wallet is also persisted with the structured intent, without adding a database column.

`createPaymentHandler` requires server-side `getBalances` and `quoteFees` adapters. Missing/erroring providers fail closed with 503. An empty fee list is valid only when the trusted quote adapter confirms that there are no displayable fees. Fee details are stored separately and returned for the user review card. `GET` returns only consumer-safe event fields and never includes internal debug messages.

The created payment stays in `awaiting_confirmation`; confirmation records user consent and an event but does not submit or sign a transaction. The later execution integration must recheck current balance, fee quote, wallet state, and idempotency before submission. Chain execution and finality verification are outside this handler and must use the existing payment completion invariant.

## Stellar / Circle CCTP integration seam

Issue #12 exposes the Stellar half without replacing Issue #16's Base/Circle
coordinator:

- `submitStellarCctpBurn` creates the owner-authorized Stellar `deposit_for_burn`
  call for Base domain `6` with Standard finality `2000`. The relayer allowlists
  the exact token messenger, Stellar USDC contract, recipient, amount, and fee.
- `reconcileStellarCctpSource` verifies the finalized transaction envelope and
  persists only `source_confirmed`. It never completes the payment.
- Issue #16 obtains the Circle message/attestation from that source transaction
  and passes attested bytes to `settleBaseToStellarCctp` for the reverse route.
- `settleBaseToStellarCctp` reserves the Circle message idempotently, prepares
  and durably stores the signed `mint_and_forward` envelope and hash before
  broadcast, verifies Stellar finality plus the exact USDC transfer event, and
  only then writes `destination_confirmed`, `recipient_verified`, and
  `completed` PaymentEvents.

`stellar_cctp_operations` is the durable reconciliation record. Reusing a
payment with different source/message/attestation evidence fails closed, and a
second worker does not create a different destination operation. A stale worker
lease can replay only the exact persisted transaction hash; a legacy hashless
reservation is failed for manual reconciliation instead of being resubmitted.

## Example request

```http
POST /api/payments
Authorization: Bearer <Privy access token>
Idempotency-Key: 2dd0eb87-6a1e-4f14-a2bd-...
Content-Type: application/json

{
  "conversationId": "...",
  "intentMessageId": "...",
  "inputMode": "text",
  "selectedSourceWalletId": "...",
  "intent": {
    "amount": "5",
    "asset": "USDC",
    "recipientInput": "@alice",
    "requestedSourceNetwork": "base",
    "requestedDestinationNetwork": "stellar"
  }
}
```

Use the conversation handler to persist the user's original text first. The payment response contains the route, destination, fee display, and reason codes needed for review; it is not an execution instruction.
