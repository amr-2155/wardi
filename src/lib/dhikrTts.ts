/**
 * Text-to-speech for the app's own sentences.
 *
 * Every adhkar recording is now a real reciter (see `adhkarAudio.ts`), so the
 * only thing left that is honestly synthesized is the app's own copy: the
 * prayer reminder sentence. Nothing here ever voices the words of a dhikr or
 * the Quran, and nothing here is attributed to a sheikh.
 *
 * Android's TextToSpeech backs it inside the native app, the browser's
 * SpeechSynthesis on the web. The chosen system voice is still remembered for
 * that use, but it is not offered as a list in any screen.
 */

import { nativeDhikrVoice } from "@/lib/nativeDhikrVoice";

const KEY = "ward:v2:dhikr-voice:v1";

function webTtsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isTtsSupported(): boolean {
  return nativeDhikrVoice() !== null || webTtsAvailable();
}

export function loadSelectedVoiceName(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSelectedVoiceName(name: string | null): void {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export type SpeakOptions = {
  lang?: string;
  rate?: number;
  voiceName?: string | null;
};

/**
 * Speak arbitrary text with whichever engine this platform has. Used for the
 * prayer reminder sentence, through the same native bridge (Android WebView
 * has no SpeechSynthesis).
 */
export function speakText(text: string, options: SpeakOptions = {}, onEnd?: () => void): void {
  const lang = options.lang ?? "ar-SA";
  const rate = options.rate ?? 0.9;
  const voiceName = options.voiceName ?? null;
  const native = nativeDhikrVoice();
  if (native) {
    let settled = false;
    let handle: { remove(): void } | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        handle?.remove();
      } catch {
        /* ignore */
      }
      onEnd?.();
    };
    native
      .addListener("speakEnd", finish)
      .then((h) => {
        handle = h;
      })
      .catch(() => {});
    native
      .speak({ text, lang, rate, voice: voiceName ?? undefined })
      .catch(finish);
    // Guard against an engine that never reports completion.
    const guard = Math.max(4000, (text.length * 200) / Math.max(0.5, rate));
    window.setTimeout(finish, guard);
    return;
  }

  if (!webTtsAvailable()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const chosen =
    (voiceName && voices.find((v) => v.name === voiceName)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) ||
    voices.find((v) => /^ar/i.test(v.lang)) ||
    null;
  if (chosen) utterance.voice = chosen;
  if (onEnd) utterance.onend = onEnd;
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopDhikrSpeech(): void {
  const native = nativeDhikrVoice();
  if (native) {
    native.stopSpeaking().catch(() => {});
    return;
  }
  if (webTtsAvailable()) window.speechSynthesis.cancel();
}
