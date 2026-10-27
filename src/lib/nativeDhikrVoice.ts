"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Thin JS side of the native `DhikrVoice` plugin (see DhikrVoicePlugin.java).
 * Android System WebView has neither SpeechSynthesis nor SpeechRecognition,
 * so on the phone the adhkar features talk to Android's own engines instead.
 */

export type NativeVoiceInfo = { name: string; lang: string };
export type NativeSpeechResult = { text: string; isFinal: boolean };

type RemoveHandle = { remove(): void };
type Listener<T> = (data: T) => void;

export interface DhikrVoiceNativePlugin {
  isAvailable(): Promise<{ available: boolean; tts: boolean; recognizer: boolean }>;
  listVoices(): Promise<{ voices: NativeVoiceInfo[] }>;
  speak(options: { text: string; lang?: string; rate?: number; voice?: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
  startListening(options?: { lang?: string }): Promise<void>;
  stopListening(): Promise<void>;
  addListener(eventName: "result", listener: Listener<NativeSpeechResult>): Promise<RemoveHandle>;
  addListener(eventName: "error", listener: Listener<{ code: number; message: string }>): Promise<RemoveHandle>;
  addListener(eventName: "state", listener: Listener<{ listening: boolean }>): Promise<RemoveHandle>;
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
