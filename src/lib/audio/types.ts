/**
 * Quran Audio Domain Types
 * Shared types for the Quran audio/recitation system.
 * These types are provider-agnostic so different audio sources
 * can be swapped without touching UI or player logic.
 */

/**
 * A Quran audio reciter (e.g. Mishary Rashid al-Afasy, Abdul Rahman as-Sudais).
 */
export interface AudioReciter {
  id: string;
  name: string;
  englishName: string;
  style: "murattal" | "mujawwad" | "normal" | null;
}

/**
 * A Surah (chapter) for audio purposes — minimal data sufficient
 * for display in a surah list.
 */
export interface AudioSurah {
  number: number;
  name: string;
  englishName: string;
  ayahCount: number;
}

/**
 * A single audio track — either a full surah or a single verse.
 */
export interface AudioTrack {
  /** Surah number (1–114) */
  surah: number;
  /** Verse number within the surah, or undefined for full-surah */
  ayah?: number;
  /** Full URL to the audio file (HTTPS, CORS-enabled) */
  url: string;
  /** Duration in seconds (if known) */
  duration?: number;
}

/**
 * A sequential playback queue for a full surah, composed of individual verse audio tracks.
 * Used for continuous verse-to-verse playback without gapless transitions requiring
 * manual queue management by the provider consumer.
 */
export interface AudioTrackQueue {
  /** The surah this queue belongs to */
  surah: number;
  /** Ordered list of verse-level audio tracks for the entire surah */
  tracks: AudioTrack[];
}

/**
 * Minimal audio provider interface.
 * Each source (Quran.com, mp3quran.net, etc.) implements this.
 */
export interface AudioProviderOps {
  /** Fetch the list of available reciters. */
  getReciters(): Promise<AudioReciter[]>;

  /** Fetch the list of 114 surahs (static, can be cached). */
  getSurahs(): Promise<AudioSurah[]>;

  /**
   * Resolve the streaming URL for the first verse of a surah.
   * @param reciterId  The reciter identifier from getReciters().
   * @param surah      Surah number (1–114).
   * @returns          AudioTrack for the first verse of the surah.
   */
  getSurahAudio(reciterId: string, surah: number): Promise<AudioTrack | null>;

  /**
   * Build a sequential verse playback queue for an entire surah.
   * Each track in the queue is a single verse's audio URL resolved
   * from the Quran.com API, suitable for continuous gapless playback.
   * @param reciterId  The reciter identifier from getReciters().
   * @param surah      Surah number (1–114).
   * @returns          AudioTrackQueue with all verses, or null if unavailable.
   */
  getSurahAudioQueue(reciterId: string, surah: number): Promise<AudioTrackQueue | null>;
}

/**
 * Validation helpers shared across all providers.
 */
export const isValidSurahNumber = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= 114;

export const normalizeSurahNumber = (input: string | number): number | null => {
  const n = Number(input);
  if (!isValidSurahNumber(n)) return null;
  return n;
};
