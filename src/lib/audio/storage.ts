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

/**
 * Saved resume position for manual resume after a fail-stop.
 *
 * Stored under a SEPARATE key from settings so the settings round-trip
 * behavior (and its tests) stays untouched. Written when a verse fails
 * (or is reached during playback); cleared ONLY when a surah genuinely
 * completes. Never throws.
 */
export interface AudioResumePosition {
  /** Surah number (1–114) */
  surah: number;
  /** Verse number within the surah (>= 1) */
  ayah: number;
  /** Reciter ID active when the position was saved */
  reciterId: string;
}

const RESUME_KEY = "wardi:audio:resume-v1";
// Longest surah (Al-Baqarah) — upper sanity bound for ayah numbers.
const MAX_AYAH = 286;

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadAudioResume(): AudioResumePosition | null {
  try {
    if (!storageAvailable()) return null;
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const surah = Math.floor(Number(parsed.surah));
    const ayah = Math.floor(Number(parsed.ayah));
    const reciterId =
      typeof parsed.reciterId === "string" ? parsed.reciterId : "";
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    if (!Number.isInteger(ayah) || ayah < 1 || ayah > MAX_AYAH) return null;
    if (reciterId === "") return null;
    return { surah, ayah, reciterId };
  } catch {
    return null;
  }
}

export function saveAudioResume(pos: AudioResumePosition): void {
  try {
    if (!storageAvailable()) return;
    localStorage.setItem(RESUME_KEY, JSON.stringify(pos));
  } catch {
    // ignore — private mode or quota exceeded
  }
}

export function clearAudioResume(): void {
  try {
    if (!storageAvailable()) return;
    localStorage.removeItem(RESUME_KEY);
  } catch {
    // ignore
  }
}
