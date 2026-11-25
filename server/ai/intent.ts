import { authenticateRequest } from "../auth/privy.js";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_INTENT_MODEL = "openai/gpt-oss-20b";
const MAX_INPUT_LENGTH = 2_000;

type Network = "stellar" | "base";

export type ParsedPaymentIntent = {
  readonly action: "send";
  readonly amount: string;
  readonly asset: "USDC";
  /** User-provided name/username/address text; never a resolved wallet address. */
  readonly recipientInput: string;
  readonly requestedSourceNetwork: Network | null;
  readonly requestedDestinationNetwork: Network | null;
};

export type IntentResult =
  | { readonly status: "parsed"; readonly intent: ParsedPaymentIntent }
  | {
      readonly status: "needs_clarification";
      readonly question: string;
      readonly intent: ParsedPaymentIntent | null;
    }
  | {
      readonly status: "manual_fallback";
      readonly reason: "provider_unavailable" | "invalid_output";
      readonly message: string;
    };

type ModelIntent = {
  action: "send" | "other";
  amount: string | null;
  asset: "USDC" | null;
  recipient: string | null;
  sourceNetwork: Network | null;
  destinationNetwork: Network | null;
  clarificationQuestion: string | null;
};

type IntentHandlerOptions = {
  readonly authenticate?: (request: Request) => Promise<unknown>;
  readonly fetch?: typeof fetch;
  readonly apiKey?: () => string | undefined;
  readonly model?: () => string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function authFailure(error: unknown): Response {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  if (statusCode === 503) return jsonResponse({ error: "authentication_unavailable" }, 503);
  return jsonResponse({ error: "unauthorized" }, 401);
}

function hasExactAmount(value: string, amount: string): boolean {
  const escapedAmount = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^0-9.])${escapedAmount}(?=$|[^0-9.])`).test(value);
}

function hasExactRecipient(value: string, recipient: string): boolean {
  const normalizedRecipient = recipient.trim().replace(/^@/, "");
  if (!normalizedRecipient) return false;
  const escapedRecipient = normalizedRecipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])@?${escapedRecipient}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(value);
}

function extractExplicitNetworks(input: string): { source: Network; destination: Network } | null {
  const direct = input.match(/\b(stellar|base)\s*(?:to|->)\s*(stellar|base)\b/i);
  if (direct?.[1] && direct[2]) {
    return { source: direct[1].toLowerCase() as Network, destination: direct[2].toLowerCase() as Network };
  }

  const fromOn = input.match(/\bfrom\s+(stellar|base)\b[\s\S]{0,100}?\bon\s+(stellar|base)\b/i);
  if (fromOn?.[1] && fromOn[2]) {
    return { source: fromOn[1].toLowerCase() as Network, destination: fromOn[2].toLowerCase() as Network };
  }

  return null;
}

function isValidAmount(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) return false;
  return /[1-9]/.test(value);
}

function normalizeModelIntent(value: unknown): ModelIntent | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const validNetwork = (network: unknown): network is Network | null =>
    network === null || network === "stellar" || network === "base";

  if (
    (candidate.action !== "send" && candidate.action !== "other") ||
    !(candidate.amount === null || typeof candidate.amount === "string") ||
    !(candidate.asset === null || candidate.asset === "USDC") ||
    !(candidate.recipient === null || typeof candidate.recipient === "string") ||
    !validNetwork(candidate.sourceNetwork) ||
    !validNetwork(candidate.destinationNetwork) ||
    !(candidate.clarificationQuestion === null || typeof candidate.clarificationQuestion === "string")
  ) return null;

  return {
    action: candidate.action,
    amount: candidate.amount,
    asset: candidate.asset,
    recipient: candidate.recipient,
    sourceNetwork: candidate.sourceNetwork,
    destinationNetwork: candidate.destinationNetwork,
    clarificationQuestion: candidate.clarificationQuestion,
  };
}

function validateModelIntent(input: string, candidate: ModelIntent): IntentResult {
  if (candidate.action === "other") {
    return {
      status: "needs_clarification",
      question: candidate.clarificationQuestion?.trim() || "Do you want to send USDC?",
      intent: null,
    };
  }

  const amount = candidate.amount?.trim() ?? "";
  const recipientInput = candidate.recipient?.trim() ?? "";
  if (!amount || !recipientInput || candidate.asset === null) {
    return {
      status: "needs_clarification",
      question:
        candidate.clarificationQuestion?.trim() ||
        (!recipientInput
          ? "Who should receive the USDC?"
          : !amount
            ? "How much USDC should I send?"
            : "Telya currently supports USDC. Should I prepare a USDC payment?"),
      intent: null,
    };
  }
  if (
    !isValidAmount(amount) ||
    /^(?:usdc|stellar|base|send|transfer|payment)$/i.test(recipientInput) ||
    !hasExactAmount(input, amount) ||
    !hasExactRecipient(input, recipientInput)
  ) {
    return {
      status: "manual_fallback",
      reason: "invalid_output",
      message: "I couldn't safely read the amount or recipient. Enter the payment details manually.",
    };
  }

  const intent: ParsedPaymentIntent = {
    action: "send",
    amount,
    asset: "USDC",
    recipientInput,
    requestedSourceNetwork: extractExplicitNetworks(input)?.source ?? null,
    requestedDestinationNetwork: extractExplicitNetworks(input)?.destination ?? null,
  };

  return { status: "parsed", intent };
}

async function parseIntent(
  input: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  model: string,
): Promise<IntentResult> {
  const response = await fetchImpl(GROQ_CHAT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract only a USDC send request explicitly stated by the user. Return no invented details. " +
            "Recipient must be an exact name, @username, or address substring from the user's text; never resolve a name or invent an address. " +
            "Amount must be copied exactly from the text. Use null for missing networks or fields. " +
            "Supported networks are stellar and base. Set action=other for anything other than sending USDC. " +
            "AI output is an untrusted draft; it never authorizes or executes a payment.",
        },
        { role: "user", content: input },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "payment_intent",
          strict: true,
          schema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["send", "other"] },
              amount: { type: ["string", "null"] },
              asset: { type: ["string", "null"], enum: ["USDC", null] },
              recipient: { type: ["string", "null"] },
              sourceNetwork: { type: ["string", "null"], enum: ["stellar", "base", null] },
              destinationNetwork: { type: ["string", "null"], enum: ["stellar", "base", null] },
              clarificationQuestion: { type: ["string", "null"] },
            },
            required: [
              "action",
              "amount",
              "asset",
              "recipient",
              "sourceNetwork",
              "destinationNetwork",
              "clarificationQuestion",
            ],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) throw new Error("AI provider request failed");
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) throw new Error("Invalid AI provider response");
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || typeof choices[0] !== "object" || choices[0] === null) {
    throw new Error("Invalid AI provider response");
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof message?.content !== "string") throw new Error("Invalid AI provider response");

  let decoded: unknown;
  try {
    decoded = JSON.parse(message.content);
  } catch {
    throw new Error("Invalid AI provider response");
  }
  const modelIntent = normalizeModelIntent(decoded);
  if (!modelIntent) return {
    status: "manual_fallback",
    reason: "invalid_output",
    message: "I couldn't safely read that request. Enter the payment details manually.",
  };
  return validateModelIntent(input, modelIntent);
}

/** Create an authenticated, framework-neutral handler for structured intent extraction. */
export function createIntentHandler(options: IntentHandlerOptions = {}) {
  const authenticate = options.authenticate ?? authenticateRequest;
  const fetchImpl = options.fetch ?? fetch;
  const getApiKey = options.apiKey ?? (() => process.env.GROQ_API_KEY);
  const getModel = options.model ?? (() => process.env.GROQ_INTENT_MODEL || DEFAULT_INTENT_MODEL);

  return async function handleIntent(request: Request): Promise<Response> {
    try {
      await authenticate(request);
    } catch (error) {
      return authFailure(error);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_INPUT_LENGTH + 1_024) return jsonResponse({ error: "request_too_large" }, 413);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }
    const input = (body as { text?: unknown } | null)?.text;
    if (typeof input !== "string" || !input.trim() || input.length > MAX_INPUT_LENGTH) {
      return jsonResponse({ error: "invalid_text" }, 400);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return jsonResponse({
        status: "manual_fallback",
        reason: "provider_unavailable",
        message: "AI parsing is unavailable. Enter the payment details manually.",
      } satisfies IntentResult);
    }

    try {
      return jsonResponse(await parseIntent(input.trim(), apiKey, fetchImpl, getModel()));
    } catch {
      return jsonResponse({
        status: "manual_fallback",
        reason: "provider_unavailable",
        message: "AI parsing is unavailable. Enter the payment details manually.",
      } satisfies IntentResult);
    }
  };
}
