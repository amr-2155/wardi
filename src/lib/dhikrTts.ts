/**
 * Text-to-speech for adhkar. There is no bundled sheikh audio in the app, so
 * the recitation is synthesized: Android's TextToSpeech inside the native app,
 * the browser's SpeechSynthesis on the web. The selected voice is persisted so
 * the choice survives a reload.
 *
 * The Quran-com audio provider only carries Quran verses, never adhkar, so a
 * real sheikh recording would have to ship as bundled assets or come from a
 * dedicated CDN; until then this is the honest "hear it read aloud" path.
 */

import { nativeDhikrVoice } from "@/lib/nativeDhikrVoice";

const KEY = "ward:v2:dhikr-voice:v1";

export type DhikrVoice = { name: string; lang: string };

function webTtsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isTtsSupported(): boolean {
  return nativeDhikrVoice() !== null || webTtsAvailable();
}

/** Arabic voices first, then everything else, so the picker is useful. */
export function listDhikrVoices(): DhikrVoice[] {
  if (!webTtsAvailable()) return [];
  const voices = window.speechSynthesis.getVoices();
  const ar = voices.filter((v) => /^ar/i.test(v.lang));
  const rest = voices.filter((v) => !/^ar/i.test(v.lang));
  return [...ar, ...rest].map((v) => ({ name: v.name, lang: v.lang }));
}

/** Voices from whichever engine backs this platform. */
export async function getDhikrVoices(): Promise<DhikrVoice[]> {
  const native = nativeDhikrVoice();
  if (native) {
    try {
      const { voices } = await native.listVoices();
      const ar = voices.filter((v) => /^ar/i.test(v.lang));
      const rest = voices.filter((v) => !/^ar/i.test(v.lang));
      return [...ar, ...rest];
    } catch {
      return [];
    }
  }
  return listDhikrVoices();
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

export function speakDhikr(text: string, voiceName: string | null, onEnd?: () => void): void {
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
    native.speak({ text, voice: voiceName ?? undefined }).catch(finish);
    // Guard against an engine that never reports completion.
    const guard = Math.max(4000, text.length * 200);
    window.setTimeout(finish, guard);
    return;
  }

  if (!webTtsAvailable()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const chosen =
    (voiceName && voices.find((v) => v.name === voiceName)) ||
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
