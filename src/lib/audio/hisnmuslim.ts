/**
 * Hisn al-Muslim audio (حصن المسلم من أذكار الكتاب والسنة).
 *
 * The hadith adhkar have no per-verse recordings to look up, so they play the
 * per-dhikr recitation published with the book. Every entry in the book's API
 * carries its own mp3 — one file per dhikr, e.g.
 *
 *   https://www.hisnmuslim.com/api/ar/husn_ar.json   → chapters
 *   https://www.hisnmuslim.com/api/ar/{chapter}.json → the dhikr + "AUDIO"
 *   https://www.hisnmuslim.com/audio/ar/{id}.mp3     → that dhikr, recited
 *
 * Identity of the reciter is NOT guessed: the mp3s carry ID3 tags, and every
 * file checked names the reader in `TPE1` ("قراءة الأخ حمد الدريهم") with the
 * album `TPE2` = "حصن المسلم". The dataset only attaches an id after the
 * recording's words have been matched to the card's (see `hisnId` and
 * `audioNote` in `src/data/adhkar.ts`), so nothing here invents a reciter and
 * nothing plays a file that is not this dhikr.
 *
 * No TTS lives here or anywhere in the playback path: the only voices are the
 * real recordings. A card with no verified recording is simply not playable.
 */

/** The published base for the per-dhikr Arabic recordings. */
export const HISN_AUDIO_BASE = "https://www.hisnmuslim.com/audio/ar/";

/**
 * Build the recording URL from the dhikr's book id. Pure, so the tests can pin
 * the exact file a card will request without touching the network.
 */
export function hisnAudioUrl(id: number): string {
  return `${HISN_AUDIO_BASE}${id}.mp3`;
}
