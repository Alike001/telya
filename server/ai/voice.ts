import { authenticateRequest } from "../auth/privy.ts";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/flac",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
]);

type VoiceHandlerOptions = {
  readonly authenticate?: (request: Request) => Promise<unknown>;
  readonly fetch?: typeof fetch;
  readonly apiKey?: () => string | undefined;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function authFailure(error: unknown): Response {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  if (statusCode === 503) return jsonResponse({ error: "authentication_unavailable" }, 503);
  return jsonResponse({ error: "unauthorized" }, 401);
}

function providerUnavailable(): Response {
  return jsonResponse({
    error: "voice_provider_unavailable",
    manualFallback: true,
    message: "Voice is unavailable. You can continue by typing your request.",
  }, 503);
}

/** Create an authenticated Whisper transcription handler; accepts multipart `audio` files. */
export function createTranscriptionHandler(options: VoiceHandlerOptions = {}) {
  const authenticate = options.authenticate ?? authenticateRequest;
  const fetchImpl = options.fetch ?? fetch;
  const getApiKey = options.apiKey ?? (() => process.env.GROQ_API_KEY);

  return async function handleTranscription(request: Request): Promise<Response> {
    try {
      await authenticate(request);
    } catch (error) {
      return authFailure(error);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) return jsonResponse({ error: "audio_too_large" }, 413);
    const apiKey = getApiKey();
    if (!apiKey) return providerUnavailable();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ error: "invalid_multipart_body" }, 400);
    }
    const audio = form.get("audio");
    if (!(audio instanceof File)) return jsonResponse({ error: "audio_file_required" }, 400);
    if (audio.size === 0) return jsonResponse({ error: "audio_file_empty" }, 400);
    if (audio.size > MAX_AUDIO_BYTES) return jsonResponse({ error: "audio_too_large" }, 413);
    if (!SUPPORTED_AUDIO_TYPES.has(audio.type.toLowerCase())) {
      return jsonResponse({ error: "unsupported_audio_type" }, 415);
    }

    const providerForm = new FormData();
    providerForm.append("file", audio, audio.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "recording.webm");
    providerForm.append("model", "whisper-large-v3-turbo");
    providerForm.append("response_format", "json");
    providerForm.append("temperature", "0");

    try {
      const response = await fetchImpl(GROQ_TRANSCRIPTION_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: providerForm,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return providerUnavailable();
      const payload: unknown = await response.json();
      const text = (payload as { text?: unknown } | null)?.text;
      if (typeof text !== "string" || !text.trim() || text.length > 10_000) return providerUnavailable();
      return jsonResponse({ text: text.trim(), inputMode: "voice" });
    } catch {
      return providerUnavailable();
    }
  };
}
