# Server-side AI and voice handlers

These framework-neutral `Request` handlers provide the server logic for issue #14. Mount them behind authenticated `POST` routes in the web/API runtime:

| Route | Request | Success |
| --- | --- | --- |
| `/api/ai/intent` | JSON `{ "text": "Send @alice 5 USDC from Stellar to Base" }` | Structured intent, clarification, or manual fallback JSON |
| `/api/voice/transcription` | Multipart form with an `audio` file | JSON `{ "text": "...", "inputMode": "voice" }` |

The handlers verify the Privy bearer session before reading provider input. `GROQ_API_KEY` is read only on the server. Keep provider errors and credentials out of client responses. The key name is already present in the root `.env.example`; no client-side key or added SDK dependency is needed. Text sent for intent parsing and uploaded audio are sent to Groq for processing.

## Intent safety

- Uses Groq structured JSON output with `openai/gpt-oss-20b` by default.
- The model can extract only send intent for USDC. It never resolves contacts, selects a route, authorizes, or executes a payment.
- Amount and recipient values must be present in the original text; unsupported amounts or ungrounded fields trigger manual entry.
- Networks are retained only when explicitly present in the user's text. Missing networks remain `null` for the deterministic route engine and selected-wallet/contact context to resolve.
- Missing required values return `needs_clarification`. Provider outages and invalid model responses return `manual_fallback`.

The caller must pass the structured intent to deterministic recipient resolution and routing, then show the resulting payment preview for user approval. Never execute a payment from this response alone.

## Voice behavior

- Speech-to-text uses Groq `whisper-large-v3-turbo`, accepts supported audio up to 25 MiB, and times out after 30 seconds.
- Text-to-speech uses `speakResponse` from `src/voice/speech-response.ts`, which speaks locally through browser `speechSynthesis` without another provider or API key. `stopSpeechResponse` supports interruption.
- Voice provider errors return `manualFallback: true`; the caller should keep the transcript/text available and let the user continue by typing. Speech output rejects with `SpeechOutputUnavailableError`; the caller should leave the text visible and readable.
- Submit the returned transcript through the same intent handler used for typed input so voice and text share parsing, validation, clarification, and fallback behavior.

## Local configuration

Set `GROQ_API_KEY` as a server-only runtime secret to enable intent parsing and transcription. With no key configured, these handlers fail safely into manual/typed flows. Browser speech output needs no key. No live provider or financial operation is performed by these modules during build or startup.
