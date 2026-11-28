export type VoiceCaptureOutcome =
  | { readonly status: "submit"; readonly text: string }
  | { readonly status: "typed_fallback" };

/** A failed/empty capture never becomes a payment instruction. */
export function finishVoiceCapture(input: {
  readonly failed: boolean;
  readonly transcript: string;
}): VoiceCaptureOutcome {
  const text = input.transcript.trim();
  if (input.failed || !text) return { status: "typed_fallback" };
  return { status: "submit", text };
}
