/**
 * Whether the spoken prayer alert is available, and what it says.
 *
 * There is no bundled sheikh recording for these sentences anywhere in the
 * project (the only shipped audio is the adhan clips from `ADHAN_SOUNDS`, and
 * those are the call to prayer, not a "the prayer is near" line). So this is
 * honestly text-to-speech:
 * - on Android, the native `DhikrVoice` plugin (Android's own TTS engine);
 * - on the web, `speechSynthesis` when the browser has an Arabic voice.
 *
 * It is opt-in, never fires by itself, and only runs while the app is in the
 * foreground — see `prePrayerVoiceEnabled` and the note in the settings panel.
 */

import { isTtsSupported, loadSelectedVoiceName, speakText, stopDhikrSpeech } from "./dhikrTts";
import { t, type Locale } from "./locale";
import { PRAYER_LABELS, type PrayerId } from "./prayer";

/** The sentence itself lives in locale.ts in both languages. */
export function prayerVoiceText(prayer: PrayerId, locale: Locale): string {
  return t(locale, "prayer.voiceBody", {
    prayer: t(locale, PRAYER_LABELS[prayer]),
  });
}

/**
 * Speak the alert for `prayer`. Resolves immediately; the engine reports its
 * own end. Must be called from a user-visible moment (the app is open), since
 * Android will not let a background page start speech.
 */
export function speakPrayerAlert(prayer: PrayerId, locale: Locale): boolean {
  if (typeof window === "undefined") return false;
  /* Return false when there is no engine at all, so the caller can fall back
     to the chime instead of leaving the reminder silent. */
  if (!isTtsSupported()) return false;
  try {
    speakText(prayerVoiceText(prayer, locale), {
      lang: locale === "ar" ? "ar-SA" : "en-US",
      rate: locale === "ar" ? 0.9 : 0.95,
      voiceName: locale === "ar" ? loadSelectedVoiceName() : null,
    });
    return true;
  } catch {
    return false;
  }
}

export function stopPrayerVoice(): void {
  try {
    stopDhikrSpeech();
  } catch {
    /* engine unavailable */
  }
}
