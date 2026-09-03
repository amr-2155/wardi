/**
 * Audio Settings Storage — extends the existing Wardi storage abstraction.
 *
 * Uses the same localStorage pattern as the rest of the app (ward:v2:*).
 * Namespaced keys to avoid collisions with ward/Quran data.
 * All reads are wrapped in try/catch to handle malformed values.
 */

export interface AudioSettings {
  /** Selected reciter ID (e.g. "7" for Mishary). Empty if none selected. */
  selectedReciter: string;
  /** Last played surah number (1–114). 0 if none. */
  lastPlayedSurah: number;
  /** Last playback position in seconds. 0 if none. */
  lastPosition: number;
  /** Volume level (0–1). */
  volume: number;
}

export const DEFAULTS: AudioSettings = {
  selectedReciter: "",
  lastPlayedSurah: 0,
  lastPosition: 0,
  volume: 0.5,
};

// Namespaced keys consistent with existing ward:v2: pattern
const KEY = "wardi:audio:settings-v1";

/**
 * Load audio settings from localStorage.
 * Returns defaults if storage is empty or malformed.
 * Never throws.
 */
export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };

    const s = parsed as Record<string, unknown>;

    return {
      selectedReciter:
        typeof s.selectedReciter === "string" ? s.selectedReciter : "",
      lastPlayedSurah: Math.max(
        0,
        Math.min(114, Math.floor(Number(s.lastPlayedSurah) || 0))
      ),
      lastPosition: Math.max(0, Number(s.lastPosition) || 0),
      volume: Math.max(
        0,
        Math.min(1, Number(s.volume) || DEFAULTS.volume)
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save audio settings to localStorage.
 * Silently ignores errors (e.g. quota exceeded, private mode).
 */
export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore — private mode or quota exceeded
  }
}
