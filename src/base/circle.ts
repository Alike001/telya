import { createHash } from "node:crypto";

export const CIRCLE_CCTP_TESTNET_API = "https://iris-api-sandbox.circle.com";

export interface CircleCctpMessage {
  readonly message: string;
  readonly eventNonce: string;
  readonly attestation: string;
  readonly status: string;
  readonly cctpVersion?: number;
}

interface CircleMessagesResponse {
  readonly sourceTxHash?: string;
  readonly messages?: readonly CircleCctpMessage[];
}

export type CircleCctpStatus =
  | { readonly status: "pending"; readonly sourceTransactionHash: string }
  | {
      readonly status: "complete";
      readonly sourceTransactionHash: string;
      readonly message: string;
      readonly attestation: string;
      readonly messageHash: string;
      readonly attestationHash: string;
    };

export class CircleCctpError extends Error {
  constructor(
    readonly code: "INVALID_TRANSACTION" | "API_FAILED" | "INVALID_RESPONSE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CircleCctpError";
  }
}

function normalizeHex(value: string, label: string): string {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new CircleCctpError("INVALID_RESPONSE", `Circle ${label} is not valid hexadecimal bytes`);
  }
  return `0x${normalized}`;
}

function hashHex(value: string): string {
  return createHash("sha256").update(Buffer.from(value.slice(2), "hex")).digest("hex");
}

export async function getCircleCctpStatus(input: {
  readonly sourceDomain: number;
  readonly sourceTransactionHash: string;
  readonly fetcher?: typeof fetch;
  readonly apiBaseUrl?: string;
}): Promise<CircleCctpStatus> {
  const sourceTransactionHash = input.sourceTransactionHash.trim().toLowerCase();
  if (!/^(?:0x)?[0-9a-f]{64}$/.test(sourceTransactionHash)) {
    throw new CircleCctpError("INVALID_TRANSACTION", "Invalid Circle CCTP source transaction hash");
  }
  if (!Number.isSafeInteger(input.sourceDomain) || input.sourceDomain < 0) {
    throw new CircleCctpError("INVALID_TRANSACTION", "Invalid Circle CCTP source domain");
  }
  const apiBaseUrl = input.apiBaseUrl ?? CIRCLE_CCTP_TESTNET_API;
  let url: URL;
  try {
    url = new URL(`/v2/messages/${input.sourceDomain}`, apiBaseUrl);
  } catch {
    throw new CircleCctpError("API_FAILED", "Circle CCTP API URL is invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "iris-api-sandbox.circle.com") {
    throw new CircleCctpError("API_FAILED", "CCTP coordination is restricted to Circle Testnet");
  }
  url.searchParams.set("transactionHash", sourceTransactionHash);
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, { cache: "no-store" });
  } catch (error) {
    throw new CircleCctpError("API_FAILED", "Circle CCTP status request failed", { cause: error });
  }
  if (response.status === 404) {
    return { status: "pending", sourceTransactionHash };
  }
  if (!response.ok) {
    throw new CircleCctpError("API_FAILED", `Circle CCTP API returned HTTP ${response.status}`);
  }
  let payload: CircleMessagesResponse;
  try {
    payload = (await response.json()) as CircleMessagesResponse;
  } catch (error) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle CCTP API returned invalid JSON", { cause: error });
  }
  const sameTransaction = payload.sourceTxHash?.toLowerCase().replace(/^0x/, "") ===
    sourceTransactionHash.replace(/^0x/, "");
  if (!sameTransaction || !Array.isArray(payload.messages)) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle CCTP response does not match the requested source transaction");
  }
  if (payload.messages.length === 0) {
    return { status: "pending", sourceTransactionHash };
  }
  if (payload.messages.length !== 1) {
    throw new CircleCctpError("INVALID_RESPONSE", "A Telya payment must resolve to exactly one CCTP message");
  }
  const entry = payload.messages[0]!;
  if (entry.status !== "complete" || !entry.attestation || !entry.message) {
    return { status: "pending", sourceTransactionHash };
  }
  const message = normalizeHex(entry.message, "message");
  const attestation = normalizeHex(entry.attestation, "attestation");
  return {
    status: "complete",
    sourceTransactionHash,
    message,
    attestation,
    messageHash: hashHex(message),
    attestationHash: hashHex(attestation),
  };
}
