import type { AuthenticatedUser } from "../auth/privy.ts";

export type AuthenticateRequest = (request: Request) => Promise<AuthenticatedUser>;
export type AuthenticatedHandler = (
  request: Request,
  user: AuthenticatedUser,
) => Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new RequestBodyError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("invalid_body", 400);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("request_too_large", 413);
      }
      chunks.push(value);
    }
  } catch {
    if (totalBytes > maxBytes) throw new RequestBodyError("request_too_large", 413);
    throw new RequestBodyError("invalid_body", 400);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestBodyError("invalid_json", 400);
  }
}

export class RequestBodyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number) {
    super(code);
    this.name = "RequestBodyError";
    this.code = code;
    this.status = status;
  }
}

export function createAuthenticatedHandler(
  authenticate: AuthenticateRequest,
  handler: AuthenticatedHandler,
  mapError: (error: unknown) => Response | null = () => null,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let user: AuthenticatedUser;
    try {
      user = await authenticate(request);
    } catch (error) {
      const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
      if (statusCode === 503) return jsonResponse({ error: "authentication_unavailable" }, 503);
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    try {
      return await handler(request, user);
    } catch (error) {
      if (error instanceof RequestBodyError) return jsonResponse({ error: error.code }, error.status);
      return mapError(error) ?? jsonResponse({ error: "internal_error" }, 500);
    }
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
