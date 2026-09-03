/**
 * Audio Provider Abstraction Layer
 *
 * This is the main entry point for the Quran audio system.
 * It exports the primary provider (Quran.com) and the provider interface.
 *
 * A fallback provider (e.g. mp3quran.net) can be added here in the future
 * once its licensing terms are verified. It is NOT enabled for V1 per the
 * project requirements — the fallback mechanism is simply not wired up yet.
 *
 * @example
 * ```ts
 * import { audioProvider, type AudioReciter, type AudioSurah, type AudioTrack } from "@/lib/audio";
 *
 * const reciters = await audioProvider.getReciters();
 * const track = await audioProvider.getSurahAudio("7", 2); // Alafasy, Surah Al-Baqarah
 * ```
 */

export { quranComProvider as audioProvider } from "./quran-com";
export { QuranComProvider } from "./quran-com";
export { resolveAudioUrl, deriveVersePrefix, buildVerseUrl } from "./quran-com";

export type {
  AudioReciter,
  AudioSurah,
  AudioTrack,
  AudioTrackQueue,
  AudioProviderOps,
} from "./types";

export { isValidSurahNumber, normalizeSurahNumber } from "./types";

// The fallback provider is intentionally NOT exported/activated.
// When a future phase verifies mp3quran.net licensing, a
// `FallbackQuranComProvider` or `Mp3QuranProvider` can be added here
// and `audioProvider` can be switched to a failover wrapper.
//
// import { mp3QuranProvider } from "./mp3quran";
// export const fallbackProvider: AudioProviderOps = mp3QuranProvider;
// → left as a TODO comment, not code, to avoid implementing an unverified source.
