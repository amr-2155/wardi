/**
 * Quran.com API Client (v4) — API-Driven Audio Provider
 *
 * Source: https://api.quran.com/api/v4
 * License: Freely available for personal and commercial use.
 *          Audio files are produced by the Quran Foundation and distributed
 *          via their CDN (audio.qurancdn.com).
 *          Attribution to reciters is recommended in the UI.
 *
 * Audio URLs are obtained dynamically from the Quran.com API:
 *   GET /api/v4/verses/by_key/{surah}:{ayah}?audio={recitationId}
 *
 * The API returns a RELATIVE audio.url (e.g. "Alafasy/mp3/001001.mp3")
 * which must be resolved against the CDN base: https://audio.qurancdn.com/
 *
 * Note: Some reciters (ids 6, 11, 12) return protocol-relative URLs
 * (e.g. "//mirrors.quranicaudio.com/everyayah/...") which are served from a
 * different CDN. These must NOT be prepended with the audio.qurancdn.com base;
 * instead the protocol is resolved to https:.
 *
 * The Quran.com public REST API does NOT provide full-surah audio files.
 * Only per-verse (per-ayah) audio URLs are available. To support continuous
 * full-surah playback, the verse queue is constructed by deriving verse URLs
 * from the first verse's audio URL pattern:
 *   "{reciterDir}/[/{style}/]mp3/{surah3}{verse3}.mp3"
 * — the first fetch yields verse 1's URL (e.g. "Alafasy/mp3/001001.mp3"),
 * and subsequent verses are constructed by replacing the 6-digit suffix.
 *
 * No API key is required for basic usage (recitations, chapters, audio metadata).
 * The API is rate-limited (~300 requests/min anonymous, ~1000/min with key);
 * streaming audio is served from CDN and does NOT count against the quota.
 *
 * ⚠️  This client is browser-safe: it does NOT expose any secrets.
 *     All requests are direct HTTPS fetches from the browser to the public API.
 *
 * @see AudioProviderOps for the interface contract.
 */

import type {
  AudioProviderOps,
  AudioReciter,
  AudioSurah,
  AudioTrack,
  AudioTrackQueue,
} from "./types";

const API_BASE = "https://api.quran.com/api/v4";
const AUDIO_CDN_BASE = "https://audio.qurancdn.com";

/**
 * Fixed list of 114 surahs with Arabic names, English transliteration, and verse counts.
 * This data is static and sourced from the Quran.com API (chapters endpoint).
 */
const SURAH_DATA: AudioSurah[] = [
  { number: 1, name: "الفاتحة", englishName: "Al-Fatihah", ayahCount: 7 },
  { number: 2, name: "البقرة", englishName: "Al-Baqarah", ayahCount: 286 },
  { number: 3, name: "آل عمران", englishName: "Ali 'Imran", ayahCount: 200 },
  { number: 4, name: "النساء", englishName: "An-Nisa", ayahCount: 176 },
  { number: 5, name: "المائدة", englishName: "Al-Ma'idah", ayahCount: 120 },
  { number: 6, name: "الأنعام", englishName: "Al-An'am", ayahCount: 165 },
  { number: 7, name: "الأعراب", englishName: "Al-A'raf", ayahCount: 206 },
  { number: 8, name: "الأنفال", englishName: "Al-Anfal", ayahCount: 75 },
  { number: 9, name: "التوبة", englishName: "At-Tawbah", ayahCount: 129 },
  { number: 10, name: "يونس", englishName: "Yunus", ayahCount: 109 },
  { number: 11, name: "هود", englishName: "Hud", ayahCount: 123 },
  { number: 12, name: "يوسف", englishName: "Yusuf", ayahCount: 111 },
  { number: 13, name: "الرعد", englishName: "Ar-Ra'd", ayahCount: 43 },
  { number: 14, name: "ابراهيم", englishName: "Ibrahim", ayahCount: 52 },
  { number: 15, name: "الحجر", englishName: "Al-Hijr", ayahCount: 99 },
  { number: 16, name: "النحل", englishName: "An-Nahl", ayahCount: 128 },
  { number: 17, name: "الإسراء", englishName: "Al-Isra", ayahCount: 111 },
  { number: 18, name: "الكهف", englishName: "Al-Kahf", ayahCount: 110 },
  { number: 19, name: "مريم", englishName: "Maryam", ayahCount: 98 },
  { number: 20, name: "طه", englishName: "Taha", ayahCount: 135 },
  { number: 21, name: "الأنبياء", englishName: "Al-Anbiya", ayahCount: 112 },
  { number: 22, name: "الحج", englishName: "Al-Hajj", ayahCount: 78 },
  { number: 23, name: "المؤمنون", englishName: "Al-Mu'inun", ayahCount: 118 },
  { number: 24, name: "النور", englishName: "An-Nur", ayahCount: 64 },
  { number: 25, name: "الفرقان", englishName: "Al-Furqan", ayahCount: 77 },
  { number: 26, name: "الشعراء", englishName: "Ash-Shu'ara", ayahCount: 227 },
  { number: 27, name: "النمل", englishName: "An-Naml", ayahCount: 93 },
  { number: 28, name: "القصص", englishName: "Al-Qasas", ayahCount: 88 },
  { number: 29, name: "العنكبوث", englishName: "Al-'Ankabut", ayahCount: 69 },
  { number: 30, name: "الروم", englishName: "Ar-Rum", ayahCount: 60 },
  { number: 31, name: "لقمان", englishName: "Luqman", ayahCount: 34 },
  { number: 32, name: "السجدة", englishName: "As-Sajdah", ayahCount: 30 },
  { number: 33, name: "الأحزاب", englishName: "Al-Ahzab", ayahCount: 73 },
  { number: 34, name: "سبأ", englishName: "Saba", ayahCount: 54 },
  { number: 35, name: "فاطر", englishName: "Fatir", ayahCount: 45 },
  { number: 36, name: "يس", englishName: "Ya-Sin", ayahCount: 83 },
  { number: 37, name: "الصافات", englishName: "As-Saffat", ayahCount: 182 },
  { number: 38, name: "ص", englishName: "Sad", ayahCount: 88 },
  { number: 39, name: "الزمر", englishName: "Az-Zumar", ayahCount: 75 },
  { number: 40, name: "غافر", englishName: "Ghafir", ayahCount: 85 },
  { number: 41, name: "فصلت", englishName: "Fussilat", ayahCount: 54 },
  { number: 42, name: "الشورى", englishName: "Ash-Shura", ayahCount: 53 },
  { number: 43, name: "الزخرف", englishName: "Az-Zukhruf", ayahCount: 89 },
  { number: 44, name: "الدخان", englishName: "Ad-Dukhan", ayahCount: 59 },
  { number: 45, name: "الجاثية", englishName: "Al-Jathiyah", ayahCount: 37 },
  { number: 46, name: "الأحقاف", englishName: "Al-Ahqaq", ayahCount: 35 },
  { number: 47, name: "محمد", englishName: "Muhammad", ayahCount: 38 },
  { number: 48, name: "الفتح", englishName: "Al-Fath", ayahCount: 29 },
  { number: 49, name: "الحجراج", englishName: "Al-Hujurat", ayahCount: 18 },
  { number: 50, name: "ق", englishName: "Qaf", ayahCount: 45 },
  { number: 51, name: "الذاريات", englishName: "Adh-Dhariyat", ayahCount: 60 },
  { number: 52, name: "الطور", englishName: "At-Tur", ayahCount: 49 },
  { number: 53, name: "النجم", englishName: "An-Najm", ayahCount: 62 },
  { number: 54, name: "القمر", englishName: "Al-Qamar", ayahCount: 55 },
  { number: 55, name: "الرحمن", englishName: "Ar-Rahman", ayahCount: 78 },
  { number: 56, name: "الواقعة", englishName: "Al-Waqi'ah", ayahCount: 96 },
  { number: 57, name: "الحديد", englishName: "Al-Hadid", ayahCount: 29 },
  { number: 58, name: "المجادلة", englishName: "Al-Mujadila", ayahCount: 22 },
  { number: 59, name: "الحشر", englishName: "Al-Hashr", ayahCount: 24 },
  { number: 60, name: "الممتحنة", englishName: "Al-Mumtahanah", ayahCount: 13 },
  { number: 61, name: "الصف", englishName: "As-Saf", ayahCount: 14 },
  { number: 62, name: "الجمعة", englishName: "Al-Jumu'ah", ayahCount: 11 },
  { number: 63, name: "المنافقون", englishName: "Al-Munafiqun", ayahCount: 11 },
  { number: 64, name: "التغابن", englishName: "At-Taghabun", ayahCount: 18 },
  { number: 65, name: "الطلاق", englishName: "At-Talaq", ayahCount: 12 },
  { number: 66, name: "التحريم", englishName: "At-Tahrim", ayahCount: 12 },
  { number: 67, name: "الملك", englishName: "Al-Mulk", ayahCount: 30 },
  { number: 68, name: "القلم", englishName: "Al-Qalam", ayahCount: 52 },
  { number: 69, name: "الحاقة", englishName: "Al-Haqqah", ayahCount: 52 },
  { number: 70, name: "المعارج", englishName: "Al-Ma'arij", ayahCount: 44 },
  { number: 71, name: "نوح", englishName: "Nuh", ayahCount: 28 },
  { number: 72, name: "الجن", englishName: "Al-Jinn", ayahCount: 28 },
  { number: 73, name: "المزمل", englishName: "Al-Muzzammil", ayahCount: 20 },
  { number: 74, name: "المدثر", englishName: "Al-Muddaththir", ayahCount: 56 },
  { number: 75, name: "القيامة", englishName: "Al-Qiyamah", ayahCount: 40 },
  { number: 76, name: "الإنسان", englishName: "Al-Insan", ayahCount: 31 },
  { number: 77, name: "المرسلات", englishName: "Al-Mursalat", ayahCount: 50 },
  { number: 78, name: "النبأ", englishName: "An-Naba", ayahCount: 40 },
  { number: 79, name: "النازعات", englishName: "An-Nafi", ayahCount: 46 },
  { number: 80, name: "عبس", englishName: "'Abasa", ayahCount: 42 },
  { number: 81, name: "التكوير", englishName: "At-Takwir", ayahCount: 29 },
  { number: 82, name: "الإنفطار", englishName: "Al-Infitar", ayahCount: 19 },
  { number: 83, name: "المطفين", englishName: "At-Tafilah", ayahCount: 36 },
  { number: 84, name: "الإنشقاق", englishName: "Al-Inshiqaq", ayahCount: 25 },
  { number: 85, name: "البروج", englishName: "Al-Buruj", ayahCount: 22 },
  { number: 86, name: "الطارق", englishName: "At-Tariq", ayahCount: 17 },
  { number: 87, name: "الأعلى", englishName: "Al-A'la", ayahCount: 19 },
  { number: 88, name: "الغاشية", englishName: "Al-Gashiyah", ayahCount: 26 },
  { number: 89, name: "الفجر", englishName: "Al-Fajr", ayahCount: 30 },
  { number: 90, name: "البلد", englishName: "Al-Balad", ayahCount: 20 },
  { number: 91, name: "الشمس", englishName: "Ash-Shams", ayahCount: 15 },
  { number: 92, name: "الليل", englishName: "Al-Layl", ayahCount: 21 },
  { number: 93, name: "الضحى", englishName: "Ad-Duhaa", ayahCount: 11 },
  { number: 94, name: "الشرح", englishName: "Ash-Sharh", ayahCount: 8 },
  { number: 95, name: "التين", englishName: "At-Tin", ayahCount: 8 },
  { number: 96, name: "العلق", englishName: "Al-'Alaq", ayahCount: 19 },
  { number: 97, name: "القدر", englishName: "Al-Qadr", ayahCount: 5 },
  { number: 98, name: "البينة", englishName: "Al-Bayyinah", ayahCount: 8 },
  { number: 99, name: "الزلزلة", englishName: "Az-Zalzalah", ayahCount: 8 },
  { number: 100, name: "العاديات", englishName: "Al-'Adiyat", ayahCount: 11 },
  { number: 101, name: "القارعة", englishName: "Al-Qari'ah", ayahCount: 11 },
  { number: 102, name: "التكاثر", englishName: "At-Takathur", ayahCount: 8 },
  { number: 103, name: "العصر", englishName: "Al-'Asr", ayahCount: 3 },
  { number: 104, name: "الهمزة", englishName: "Al-Humazah", ayahCount: 9 },
  { number: 105, name: "الفيل", englishName: "Al-Fil", ayahCount: 5 },
  { number: 106, name: "قريش", englishName: "Quraysh", ayahCount: 4 },
  { number: 107, name: "الماعون", englishName: "Al-Ma'un", ayahCount: 7 },
  { number: 108, name: "الكوثر", englishName: "Al-Kawthar", ayahCount: 3 },
  { number: 109, name: "الكافرون", englishName: "Al-Kafirun", ayahCount: 6 },
  { number: 110, name: "النصر", englishName: "An-Nasr", ayahCount: 3 },
  { number: 111, name: "المسد", englishName: "Al-Masad", ayahCount: 5 },
  { number: 112, name: "الإخلاص", englishName: "Al-Ikhlas", ayahCount: 4 },
  { number: 113, name: "الفلق", englishName: "Al-Falaq", ayahCount: 5 },
  { number: 114, name: "الناس", englishName: "An-Nas", ayahCount: 6 },
];

/**
 * Mapping from Quran.com recitation IDs to display names and recitation styles.
 * Sourced from the Quran.com API `/resources/recitations` endpoint.
 * Only the 11 major reciters are included for V1 — the full list (250+)
 * can be fetched dynamically in a future phase.
 */
const RECITER_MAP: Record<
  number,
  { name: string; englishName: string; style: AudioReciter["style"] }
> = {
  1: { name: "عبدالباري (مجوّد)", englishName: "AbdulBaset AbdulSamad", style: "mujawwad" },
  2: { name: "عبدالباري (مورتل)", englishName: "AbdulBaset AbdulSamad", style: "murattal" },
  3: { name: "عبد الرحمن الصدائس", englishName: "Abdur-Rahman as-Sudais", style: "normal" },
  4: { name: "أبو بكر الشاطري", englishName: "Abu Bakr al-Shatri", style: "normal" },
  5: { name: "هاني الرفاعي", englishName: "Hani ar-Rifai", style: "normal" },
  6: { name: "محمود خليل الحصري (معلم)", englishName: "Mahmoud Khalil Al-Husary", style: "normal" },
  7: { name: "مشاري راشد العفاسي", englishName: "Mishari Rashid al-Afasy", style: "normal" },
  8: { name: "محمد صديق المنشوي (مجوّد)", englishName: "Mohamed Siddiq al-Minshawi", style: "mujawwad" },
  9: { name: "محمد صديق المنشوي (مورتل)", englishName: "Mohamed Siddiq al-Minshawi", style: "murattal" },
  10: { name: "سعود الأشمري", englishName: "Sa'ud ash-Shuraym", style: "normal" },
  11: { name: "محمد التبويعي", englishName: "Mohamed al-Tablawi", style: "normal" },
  12: { name: "محمود خليل الحصري", englishName: "Mahmoud Khalil Al-Husary", style: "normal" },
};

const RECITERS_CACHE_KEY = "wardi:audio:reciters-v1";
const RECITERS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Padding helper for the Quran.com CDN URL pattern.
 * Audio files follow the pattern: {SurahPadded3}{VersePadded3}.mp3
 * e.g. 001001.mp3 = Surah 1, Verse 1; 002255.mp3 = Surah 2, Verse 255.
 */
function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/**
 * Resolve a relative or protocol-relative audio URL from the Quran.com API
 * against the correct base.
 *
 * The API returns:
 * - Relative paths:  "Alafasy/mp3/001001.mp3"          → resolved against AUDIO_CDN_BASE
 * - Protocol-relative: "//mirrors.quranicaudio.com/x/001001.mp3" → resolved with https:
 * - Absolute URLs:   "https://example.com/file.mp3"   → returned as-is
 */
export function resolveAudioUrl(relativeUrl: string): string {
  if (!relativeUrl || typeof relativeUrl !== "string" || relativeUrl.trim() === "") {
    throw new Error("Invalid audio URL from API");
  }
  // Already absolute (http/https)
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }
  // Protocol-relative (e.g. "//mirrors.quranicaudio.com/...")
  if (relativeUrl.startsWith("//")) {
    return `https:${relativeUrl}`;
  }
  // Relative path — resolve against the audio CDN base
  return `${AUDIO_CDN_BASE}/${relativeUrl}`;
}

/**
 * Derive the URL prefix (everything before the 6-digit verse number)
 * from a verse 1 audio URL returned by the API.
 *
 * Examples:
 *   "Alafasy/mp3/001001.mp3"     → "Alafasy/mp3/"
 *   "Minshawi/Mujawwad/mp3/001001.mp3" → "Minshawi/Mujawwad/mp3/"
 *   "//mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3" → "//mirrors.quranicaudio.com/everyayah/Husary_64kbps/"
 *
 * Returns the prefix string (without the 6-digit suffix), or null if
 * the URL does not match the expected verse-audio pattern.
 */
export function deriveVersePrefix(audioUrl: string): string | null {
  // Match anything ending with /{exactly 6 digits}.mp3
  const match = audioUrl.match(/^(.+\/)\d{6}\.mp3$/);
  if (!match) return null;
  return match[1];
}

/**
 * Construct a verse-level audio URL from a prefix (obtained via
 * `deriveVersePrefix`) and the surah/ayah numbers.
 *
 * The prefix is resolved against the CDN base via `resolveAudioUrl`.
 */
export function buildVerseUrl(
  prefix: string,
  surah: number,
  ayah: number
): string {
  const padded = pad3(surah) + pad3(ayah);
  return resolveAudioUrl(`${prefix}${padded}.mp3`);
}

async function quranComFetch(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Quran.com API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function parseReciters(raw: unknown): AudioReciter[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { recitations?: unknown }).recitations)
  ) {
    return [];
  }
  return (raw as { recitations: Array<Record<string, unknown>> }).recitations
    .filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
    .map((r): AudioReciter | null => {
      const idNum = Number(r.id);
      const info = RECITER_MAP[idNum];
      if (!info) return null;

      const englishName = r.translated_name
        ? String((r.translated_name as { name?: unknown }).name ?? info.englishName)
        : info.englishName;

      return {
        id: String(idNum),
        name: info.name,
        englishName,
        style: info.style,
      };
    })
    .filter((r): r is AudioReciter => r !== null);
}

export class QuranComProvider implements AudioProviderOps {
  async getReciters(): Promise<AudioReciter[]> {
    // Try cache first
    try {
      const cached = localStorage.getItem(RECITERS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed?.ts &&
          Date.now() - parsed.ts < RECITERS_CACHE_TTL_MS &&
          Array.isArray(parsed.data)
        ) {
          return parsed.data as AudioReciter[];
        }
      }
    } catch {
      // cache read failed — fall through to network
    }

    // Fetch from API
    const raw = await quranComFetch("/resources/recitations?language=ar");
    const reciters = parseReciters(raw);

    // Cache
    try {
      localStorage.setItem(
        RECITERS_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data: reciters })
      );
    } catch {
      // ignore cache write errors
    }

    return reciters;
  }

  async getSurahs(): Promise<AudioSurah[]> {
    // Static data — no API call needed.
    return SURAH_DATA;
  }

  /**
   * Resolve the streaming URL for the first verse of a surah.
   *
   * GET /api/v4/verses/by_key/{surah}:1?audio={recitationId}
   * Returns an AudioTrack for verse 1 of the surah.
   *
   * The audio.url returned by the API is a RELATIVE path (e.g.
   * "Alafasy/mp3/001001.mp3") or a protocol-relative URL
   * (e.g. "//mirrors.quranicaudio.com/..."). This method resolves
   * it to a full HTTPS URL via resolveAudioUrl().
   */
  async getSurahAudio(
    reciterId: string,
    surah: number
  ): Promise<AudioTrack | null> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
      throw new Error(`Invalid surah number: ${surah}`);
    }

    const reciterNum = Number(reciterId);
    if (!RECITER_MAP[reciterNum]) {
      return null;
    }

    try {
      const raw = await quranComFetch(
        `/verses/by_key/${surah}:1?audio=${reciterNum}`
      );
      const verse = (raw as { verse?: { audio?: { url?: string } } })?.verse;
      const relUrl = verse?.audio?.url;
      if (!relUrl) return null;

      return {
        surah,
        ayah: 1,
        url: resolveAudioUrl(relUrl),
      };
    } catch {
      return null;
    }
  }

  /**
   * Build a sequential verse-level audio queue for an entire surah.
   *
   * Strategy:
   * 1. Fetch verse 1 from the Quran.com API to obtain the relative audio URL.
   * 2. Derive the verse URL prefix from the response (e.g. "Alafasy/mp3/"
   *    or "Minshawi/Mujawwad/mp3/" or "//mirrors.quranicaudio.com/everyayah/Husary_64kbps/").
   * 3. Construct per-verse URLs by replacing the 6-digit suffix:
   *    {surah3}{verse3}.mp3 for verses 1 through ayahCount.
   *
   * This avoids making N+1 API calls while still using the API-determined
   * reciter directory and CDN base — no hardcoded RECITER_DIRS needed.
   */
  async getSurahAudioQueue(
    reciterId: string,
    surah: number
  ): Promise<AudioTrackQueue | null> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
      throw new Error(`Invalid surah number: ${surah}`);
    }

    const reciterNum = Number(reciterId);
    if (!RECITER_MAP[reciterNum]) {
      return null;
    }

    try {
      // Fetch verse 1 to obtain the audio URL pattern from the API
      const raw = await quranComFetch(
        `/verses/by_key/${surah}:1?audio=${reciterNum}`
      );
      const relUrl = (raw as { verse?: { audio?: { url?: string } } })?.verse?.audio
        ?.url;

      if (!relUrl) return null;

      // Resolve the first track
      const firstTrack: AudioTrack = {
        surah,
        ayah: 1,
        url: resolveAudioUrl(relUrl),
      };

      // Derive the prefix for constructing subsequent verse URLs
      const prefix = deriveVersePrefix(relUrl);
      if (!prefix) {
        // The API returned a URL that doesn't match the expected pattern.
        // Fall back to a single-track queue with just verse 1.
        return { surah, tracks: [firstTrack] };
      }

      const surahData = SURAH_DATA.find((s) => s.number === surah);
      const ayahCount = surahData?.ayahCount ?? 1;

      const tracks: AudioTrack[] = [firstTrack];
      for (let ayah = 2; ayah <= ayahCount; ayah++) {
        tracks.push({
          surah,
          ayah,
          url: buildVerseUrl(prefix, surah, ayah),
        });
      }

      return { surah, tracks };
    } catch {
      return null;
    }
  }
}

export const quranComProvider = new QuranComProvider();
