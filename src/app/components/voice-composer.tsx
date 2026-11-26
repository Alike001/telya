"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Mic, MicOff, Sparkles, Volume2 } from "lucide-react";

import { finishVoiceCapture } from "./voice-fallback";

export type VoiceState = "idle" | "listening" | "transcribing" | "error";

interface VoiceComposerProps {
  readonly onSend: (text: string, inputMode: "text" | "voice") => void;
  readonly isProcessing?: boolean;
  readonly disabled?: boolean;
}

const QUICK_PROMPTS = [
  { label: "Where is my money right now?", text: "Where is my money right now?" },
  { label: "Check my balances", text: "Check my balances" },
  { label: "View active Agent Passes", text: "View my active Agent Passes" },
  { label: "Payment activity", text: "View payment activity" },
  { label: "Open contacts", text: "Open my contacts" },
  { label: "MoneyGram status", text: "Add money with MoneyGram" },
] as const;

export function VoiceComposer({ onSend, isProcessing = false, disabled = false }: VoiceComposerProps) {
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [speechSupported, setSpeechSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceFailedRef = useRef(false);

  useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        voiceFailedRef.current = false;
        setVoiceState("listening");
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join("");
        setInput(transcript);
      };

      recognition.onerror = () => {
        voiceFailedRef.current = true;
        setVoiceState("error");
        inputRef.current?.focus();
      };

      recognition.onend = () => {
        const outcome = finishVoiceCapture({
          failed: voiceFailedRef.current,
          transcript: inputRef.current?.value ?? "",
        });
        if (outcome.status === "typed_fallback") {
          setVoiceState("error");
          inputRef.current?.focus();
          setTimeout(() => setVoiceState("idle"), 2500);
          return;
        }
        setVoiceState("transcribing");
        setTimeout(() => {
          setVoiceState("idle");
          onSend(outcome.text, "voice");
          setInput("");
        }, 500);
      };

      recognitionRef.current = recognition;
    }
  }, [onSend]);

  useEffect(() => {
    function prefill(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string" || !detail.trim() || detail.length > 200) return;
      setInput(detail.trim());
      inputRef.current?.focus();
    }
    window.addEventListener("telya:prefill-payment", prefill);
    return () => window.removeEventListener("telya:prefill-payment", prefill);
  }, []);

  function handleVoiceToggle() {
    if (!speechSupported) {
      setVoiceState("error");
      setTimeout(() => setVoiceState("idle"), 2500);
      inputRef.current?.focus();
      return;
    }

    if (voiceState === "listening") {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch {
        recognitionRef.current?.stop();
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isProcessing || disabled) return;
    onSend(trimmed, "text");
    setInput("");
  }

  return (
    <div className="voice-composer-container">
      {/* Quick Action Prompt Chips */}
      <div className="quick-prompts-bar" role="toolbar" aria-label="Suggested prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            className="quick-chip"
            onClick={() => {
              setInput(prompt.text);
              inputRef.current?.focus();
            }}
            disabled={disabled || isProcessing}
          >
            <span>{prompt.label}</span>
          </button>
        ))}
      </div>

      {/* Main Composer Box */}
      <form
        className={`composer-box ${voiceState === "listening" ? "listening-active" : ""}`}
        onSubmit={handleSubmit}
      >
        {/* Press-to-Talk Voice Button */}
        <button
          type="button"
          className={`voice-mic-btn ${voiceState}`}
          onClick={handleVoiceToggle}
          title={speechSupported ? "Press to talk with voice" : "Voice input unavailable; type instead"}
          aria-label={
            voiceState === "listening"
              ? "Stop listening"
              : "Start voice input"
          }
          disabled={disabled || isProcessing}
        >
          {voiceState === "listening" ? (
            <span className="voice-listening-pulse" aria-hidden="true" />
          ) : null}
          {voiceState === "transcribing" ? (
            <Loader2 className="mic-icon spinner" />
          ) : voiceState === "error" ? (
            <MicOff className="mic-icon error" />
          ) : (
            <Mic className="mic-icon" />
          )}
        </button>

        {/* Text Input Field */}
        <input
          ref={inputRef}
          type="text"
          className="composer-input"
          placeholder={
            voiceState === "listening"
              ? "Listening to your voice..."
              : "Tell Telya what you want to do (e.g. Send @alice 5 USDC)..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || isProcessing || voiceState === "listening"}
        />

        {/* Send Action */}
        <button
          type="submit"
          className="composer-send-btn"
          disabled={!input.trim() || isProcessing || disabled}
          aria-label="Send payment instruction"
        >
          {isProcessing ? (
            <Loader2 className="send-icon spinner" />
          ) : (
            <ArrowUp className="send-icon" />
          )}
        </button>
      </form>

      {/* Live Audio Waveform Indicator */}
      {voiceState === "listening" && (
        <div className="voice-waveform-bar" aria-live="polite">
          <span className="wave-bar bar-1" />
          <span className="wave-bar bar-2" />
          <span className="wave-bar bar-3" />
          <span className="wave-bar bar-4" />
          <span className="wave-label">Listening... Speak now</span>
        </div>
      )}
      {voiceState === "error" && (
        <div className="voice-waveform-bar" role="status" aria-live="polite">
          <MicOff className="mic-icon error" />
          <span className="wave-label">Voice is unavailable. Type your payment request instead.</span>
        </div>
      )}
    </div>
  );
}
