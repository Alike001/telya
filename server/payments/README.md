# Contacts, conversations, and payment orchestration

The framework-neutral authenticated handlers exported from `server/api/index.ts` are intended for the app/API runtime:

| Handler | Methods | Behavior |
| --- | --- | --- |
| `createContactsHandler` | `GET`, `POST`, `DELETE` | Lists, saves by active username, and removes the authenticated user's contacts |
| `createConversationsHandler` | `GET`, `POST` | Creates a conversation with the first user message, appends user messages, and reads owned history |
| `createPaymentHandler` | `GET`, `POST` | Reads a user's payment history or one persisted timeline; POST resolves recipient/route, obtains balance/fee quotes, and persists a reviewable payment and initial event |

All handlers verify the Privy bearer session and scope database reads/writes to that user. Conversation history returns only user and assistant messages. Server-only assistant message persistence is available through `appendAssistantMessage`.

`GET /api/payments` returns up to 20 newest payment summaries by default, with `limit` capped at 50 and an optional `before` payment ID cursor. `nextCursor` is the final ID of a page only when more records exist. `GET /api/payments?id=<paymentId>` returns that owned payment's persisted event timeline. History and detail expose only consumer-safe payment fields; they do not infer completion from a hash.

## Recipient resolution and routing

- A literal EVM address is classified as Base; Stellar account, muxed-account, and contract StrKeys are validated with the Stellar SDK.
- A username resolves only to an active registry entry with verified wallets. A saved contact resolves through its stable user ID and verified wallet records.
- Display-name matches must be unique. Missing/ambiguous recipients and absent verified wallets do not produce a payment.
- The route resolver applies explicit network intent, a selected source wallet, destination address network, contact receive preference, then known sufficient balances. It returns a clarification when a choice remains ambiguous.
- Amount and per-wallet balances are compared as decimal strings using integer arithmetic. Client-supplied balances and fees are never accepted.

## Payment flow

Payment creation requires an existing user message ID from the owned conversation and an `Idempotency-Key` header. For text/voice intents, the amount, recipient, and requested networks are checked against that saved message. The selected verified source wallet is also persisted with the structured intent, without adding a database column.

`createPaymentHandler` requires server-side `getBalances` and `quoteFees` adapters. Missing/erroring providers fail closed with 503. An empty fee list is valid only when the trusted quote adapter confirms that there are no displayable fees. Fee details are stored separately and returned for the user review card. `GET` returns only consumer-safe event fields and never includes internal debug messages.

The created payment stays in `awaiting_confirmation`. No confirmation handler is exposed until a real wallet authorization proof is verified. The later execution integration must recheck current balance, fee quote, wallet state, and idempotency before submission. Chain execution and finality verification are outside this handler and must use the existing payment completion invariant.

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
