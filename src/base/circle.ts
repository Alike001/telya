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

interface CircleFeeEntry {
  readonly finalityThreshold?: unknown;
  readonly minimumFee?: unknown;
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

export interface CircleCctpStandardFeeQuote {
  readonly sourceDomain: number;
  readonly destinationDomain: number;
  readonly finalityThreshold: 2_000;
  /** Circle's current minimum fee rate in basis points, preserved as a decimal string. */
  readonly minimumFeeBps: string;
}

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

function testnetApiUrl(pathname: string, apiBaseUrl = CIRCLE_CCTP_TESTNET_API): URL {
  let url: URL;
  try {
    url = new URL(pathname, apiBaseUrl);
  } catch {
    throw new CircleCctpError("API_FAILED", "Circle CCTP API URL is invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "iris-api-sandbox.circle.com") {
    throw new CircleCctpError("API_FAILED", "CCTP coordination is restricted to Circle Testnet");
  }
  return url;
}

function minimumFeeBps(value: unknown): string {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "number" && !Number.isFinite(value))) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle Standard Transfer fee is missing");
  }
  const fee = String(value);
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,9})?$/.test(fee) || Number(fee) > 10_000) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle Standard Transfer fee is invalid");
  }
  return fee;
}

/** Fetch Circle's current Standard Transfer fee rate for Telya's two Testnet routes. */
export async function getCircleCctpStandardFeeQuote(input: {
  readonly sourceDomain: number;
  readonly destinationDomain: number;
  readonly fetcher?: typeof fetch;
  readonly apiBaseUrl?: string;
}): Promise<CircleCctpStandardFeeQuote> {
  const supportedRoute =
    (input.sourceDomain === 6 && input.destinationDomain === 27) ||
    (input.sourceDomain === 27 && input.destinationDomain === 6);
  if (!supportedRoute) {
    throw new CircleCctpError("INVALID_TRANSACTION", "Unsupported Telya CCTP fee route");
  }
  const url = testnetApiUrl(
    `/v2/burn/USDC/fees/${input.sourceDomain}/${input.destinationDomain}`,
    input.apiBaseUrl,
  );
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, { cache: "no-store" });
  } catch (error) {
    throw new CircleCctpError("API_FAILED", "Circle CCTP fee request failed", { cause: error });
  }
  if (!response.ok) {
    throw new CircleCctpError("API_FAILED", `Circle CCTP fee API returned HTTP ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle CCTP fee API returned invalid JSON", { cause: error });
  }
  if (!Array.isArray(payload)) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle CCTP fee API did not return a fee list");
  }
  const standard = payload.filter((entry): entry is CircleFeeEntry =>
    typeof entry === "object" && entry !== null &&
    (entry as CircleFeeEntry).finalityThreshold === 2_000);
  if (standard.length !== 1) {
    throw new CircleCctpError("INVALID_RESPONSE", "Circle CCTP fee API must return one Standard Transfer quote");
  }
  return {
    sourceDomain: input.sourceDomain,
    destinationDomain: input.destinationDomain,
    finalityThreshold: 2_000,
    minimumFeeBps: minimumFeeBps(standard[0]!.minimumFee),
  };
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
  const url = testnetApiUrl(`/v2/messages/${input.sourceDomain}`, input.apiBaseUrl);
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
