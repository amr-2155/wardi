"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Thin JS side of the native `DhikrVoice` plugin (see DhikrVoicePlugin.java).
 *
 * Android System WebView has no SpeechSynthesis, so the app's spoken text —
 * the automatic reading of the hadith adhkar and the prayer reminder — talks to
 * Android's own TextToSpeech engine through this bridge.
 */

type RemoveHandle = { remove(): void };
type Listener<T> = (data: T) => void;

export interface DhikrVoiceNativePlugin {
  isAvailable(): Promise<{ available: boolean; tts: boolean }>;
  speak(options: { text: string; lang?: string; rate?: number; voice?: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
  addListener(eventName: "speakEnd", listener: Listener<void>): Promise<RemoveHandle>;
}

let cached: DhikrVoiceNativePlugin | null | undefined;

export function nativeDhikrVoice(): DhikrVoiceNativePlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (cached === undefined) {
    try {
      cached = registerPlugin<DhikrVoiceNativePlugin>("DhikrVoice");
    } catch {
      cached = null;
    }
  }
  return cached;
}
