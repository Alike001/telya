import { describe, expect, it } from "vitest";

import { finishVoiceCapture } from "./voice-fallback";

describe("voice capture fallback", () => {
  it("never submits a partial transcript after speech recognition fails", () => {
    expect(finishVoiceCapture({ failed: true, transcript: "Send 5 USDC to" }))
      .toEqual({ status: "typed_fallback" });
  });

  it("keeps an empty capture on the typed path", () => {
    expect(finishVoiceCapture({ failed: false, transcript: "   " }))
      .toEqual({ status: "typed_fallback" });
  });

  it("submits only a successful non-empty transcript", () => {
    expect(finishVoiceCapture({ failed: false, transcript: " Send 5 USDC to @alice " }))
      .toEqual({ status: "submit", text: "Send 5 USDC to @alice" });
  });
});
