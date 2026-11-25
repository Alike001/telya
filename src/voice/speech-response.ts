export class SpeechOutputUnavailableError extends Error {
  constructor(message = "Speech output is unavailable in this browser") {
    super(message);
    this.name = "SpeechOutputUnavailableError";
  }
}

const MAX_SPOKEN_RESPONSE_LENGTH = 500;

/** Speak a short response locally with the browser's built-in speech engine. */
export function speakResponse(
  text: string,
  speech: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): Promise<void> {
  const response = text.trim();
  if (
    !response ||
    response.length > MAX_SPOKEN_RESPONSE_LENGTH ||
    typeof SpeechSynthesisUtterance === "undefined" ||
    !speech
  ) {
    return Promise.reject(new SpeechOutputUnavailableError());
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(response);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new SpeechOutputUnavailableError());
    speech.cancel();
    speech.speak(utterance);
  });
}

/** Stop the current utterance when the user interrupts or navigates away. */
export function stopSpeechResponse(
  speech: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): void {
  speech?.cancel();
}
