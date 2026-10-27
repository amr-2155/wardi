"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeArabic } from "@/lib/arabicSearch";
import { nativeDhikrVoice } from "@/lib/nativeDhikrVoice";

/* Web Speech API types are not in the standard DOM lib. Declared locally so
   the hook compiles without @types for them. */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isVoiceRecognitionSupported(): boolean {
  return nativeDhikrVoice() !== null || getCtor() !== null;
}

export type VoiceDhikrState = {
  supported: boolean;
  listening: boolean;
  error: string | null;
  lastHeard: string;
};

/**
 * Listens to the microphone in Arabic and calls `onCount` whenever the spoken
 * transcript contains the target dhikr. A cooldown prevents the same utterance
 * from being counted twice, and partial results are ignored so a partially
 * spoken dhikr does not fire early.
 *
 * On the phone this runs through the native `DhikrVoice` plugin because
 * Android System WebView has no Web Speech API.
 */
export function useVoiceDhikr({
  targetText,
  onCount,
  enabled,
  cooldownMs = 1200,
}: {
  targetText: string;
  onCount: () => void;
  enabled: boolean;
  cooldownMs?: number;
}) {
  const [state, setState] = useState<VoiceDhikrState>({
    supported: isVoiceRecognitionSupported(),
    listening: false,
    error: null,
    lastHeard: "",
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const nativeHandlesRef = useRef<{ remove(): void }[]>([]);
  const nativeSessionRef = useRef(false);
  const lastCountRef = useRef(0);

  const targetNorm = normalizeArabic(targetText);
  const targetNormRef = useRef(targetNorm);
  const onCountRef = useRef(onCount);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    targetNormRef.current = targetNorm;
    onCountRef.current = onCount;
    enabledRef.current = enabled;
  }, [targetNorm, onCount, enabled]);

  /* Confirm the native engines actually exist on this device before promising
     the feature; some ROMs ship without a speech recognition service. */
  useEffect(() => {
    const native = nativeDhikrVoice();
    if (!native) return;
    let cancelled = false;
    native
      .isAvailable()
      .then((result) => {
        if (!cancelled) setState((s) => ({ ...s, supported: result.recognizer }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (!isFinal) return;
      const norm = normalizeArabic(transcript);
      setState((s) => ({ ...s, lastHeard: transcript }));
      const target = targetNormRef.current;
      if (!norm || !target) return;
      // The spoken phrase must contain the dhikr (or vice versa) to count.
      const matched = norm.includes(target) || target.includes(norm);
      if (!matched) return;
      const now = Date.now();
      if (now - lastCountRef.current < cooldownMs) return;
      lastCountRef.current = now;
      onCountRef.current();
      setState((s) => ({ ...s, lastHeard: transcript + " ✓" }));
    },
    [cooldownMs],
  );

  const stop = useCallback(() => {
    const native = nativeDhikrVoice();
    if (native) {
      nativeSessionRef.current = false;
      for (const handle of nativeHandlesRef.current) {
        try {
          handle.remove();
        } catch {
          /* ignore */
        }
      }
      nativeHandlesRef.current = [];
      native.stopListening().catch(() => {});
      setState((s) => ({ ...s, listening: false }));
      return;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    setState((s) => ({ ...s, listening: false }));
  }, []);

  const start = useCallback(() => {
    const native = nativeDhikrVoice();
    if (native) {
      if (nativeSessionRef.current) return;
      nativeSessionRef.current = true;
      const handles: { remove(): void }[] = [];
      nativeHandlesRef.current = handles;
      native
        .addListener("result", (data) => handleTranscript(data.text, data.isFinal))
        .then((h) => handles.push(h))
        .catch(() => {});
      native
        .addListener("state", (data) =>
          setState((s) => ({ ...s, listening: data.listening })),
        )
        .then((h) => handles.push(h))
        .catch(() => {});
      native
        .addListener("error", (data) => {
          if (data.message && data.message !== "no-match") {
            setState((s) => ({ ...s, error: data.message }));
          }
        })
        .then((h) => handles.push(h))
        .catch(() => {});
      native.startListening({ lang: "ar-SA" }).catch((error) => {
        nativeSessionRef.current = false;
        setState((s) => ({ ...s, listening: false, error: String(error) }));
      });
      setState((s) => ({ ...s, listening: true, error: null }));
      return;
    }

    const Ctor = getCtor();
    if (!Ctor) {
      setState((s) => ({ ...s, error: "unsupported" }));
      return;
    }
    // Restart cleanly if a previous instance lingers.
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    const rec = new Ctor();
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => setState((s) => ({ ...s, listening: true, error: null }));
    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) continue;
        handleTranscript(res[0]?.transcript ?? "", true);
      }
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are normal; surface the rest.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setState((s) => ({ ...s, error: e.error }));
      }
    };
    rec.onend = () => {
      // Auto-restart while still enabled so a single pause does not end the
      // session; the component controls enabled via the toggle.
      if (enabledRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      } else {
        setState((s) => ({ ...s, listening: false }));
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, [handleTranscript]);

  useEffect(() => {
    if (enabled) start();
    else stop();
    return () => stop();
  }, [enabled, start, stop]);

  return { ...state, start, stop };
}
