import type { AyahMeta, QuranDataset } from "./types";
import { refFromGlobalId } from "./progress";
import { resolveAyah } from "./validate";

/** One ayah as it appears inside a printed mushaf page. */
export type PageAyah = {
  /** 0-based global ayah index */
  index: number;
  ref: string;
  text: string;
  chapterId: number;
  chapterName: string;
  verseNumber: number;
  juz: number;
  quarter: number;
};

export type LineToken =
  | { type: "text"; text: string; w: number }
  | { type: "marker"; num: number; w: number }
  | { type: "quarter"; num: number; w: number }
  | { type: "surah"; name: string; basmala: string; w: number };

export type MushafLine = { tokens: LineToken[]; w: number };

export const MUSHAF_LINES = 15;

/** 1..604 in Eastern Arabic-Indic numerals (as used in the Madani mushaf). */
export function toArabicIndic(n: number): string {
  const digits = "٠١٢٣٤٥٦٧٨٩";
  return String(n)
    .split("")
    .map((d) => (/\d/.test(d) ? digits[Number(d)] : d))
    .join("");
}

/** Arabic ordinal names of the 30 juz (الجزء الأول .. الثلاثون). */
export const JUZ_ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
  "الثالث عشر",
  "الرابع عشر",
  "الخامس عشر",
  "السادس عشر",
  "السابع عشر",
  "الثامن عشر",
  "التاسع عشر",
  "العشرون",
  "الحادي والعشرون",
  "الثاني والعشرون",
  "الثالث والعشرون",
  "الرابع والعشرون",
  "الخامس والعشرون",
  "السادس والعشرون",
  "السابع والعشرون",
  "الثامن والعشرون",
  "التاسع والعشرون",
  "الثلاثون",
];

export function juzOrdinal(juz: number): string {
  return JUZ_ORDINALS[Math.min(29, Math.max(0, juz - 1))] ?? "";
}

/** The 60 hizb (half-juze) ordinals, as printed in the Madani mushaf margins. */
export const HIZB_ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر", "العشرون",
  "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون", "الرابع والعشرون", "الخامس والعشرون", "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون", "التاسع والعشرون", "الثلاثون",
  "الحادي والثلاثون", "الثاني والثلاثون", "الثالث والثلاثون", "الرابع والثلاثون", "الخامس والثلاثون", "السادس والثلاثون", "السابع والثلاثون", "الثامن والثلاثون", "التاسع والثلاثون", "الأربعون",
  "الحادي والأربعون", "الثاني والأربعون", "الثالث والأربعون", "الرابع والأربعون", "الخامس والأربعون", "السادس والأربعون", "السابع والأربعون", "الثامن والأربعون", "التاسع والأربعون", "الخمسون",
  "الحادي والخمسون", "الثاني والخمسون", "الثالث والخمسون", "الرابع والخمسون", "الخامس والخمسون", "السادس والخمسون", "السابع والخمسون", "الثامن والخمسون", "التاسع والخمسون", "الستون",
];

export function hizbOrdinal(hizb: number): string {
  return HIZB_ORDINALS[Math.min(59, Math.max(0, hizb - 1))] ?? "";
}

/** A hizb spans 4 rub` (quarters): 60 hizb, 240 quarters. */
export function quarterToHizb(quarter: number): number {
  return Math.max(1, Math.min(60, Math.ceil(quarter / 4)));
}

/** Quarter position *within* its hizb (1..4). */
export function quarterInHizb(quarter: number): number {
  return ((quarter - 1) % 4) + 1;
}

/** The opening phrase of each juz (as printed in the margin of the Madani mushaf). */
export const JUZ_NAMES: { number: number; name: string }[] = [
  { number: 1, name: "الم" },
  { number: 2, name: "سَيَقُولُ" },
  { number: 3, name: "تِلْكَ الرُّسُلُ" },
  { number: 4, name: "لَنْ تَنَالُوا" },
  { number: 5, name: "وَالْمُحْصَنَاتُ" },
  { number: 6, name: "لَا يُحِبُّ اللَّهُ" },
  { number: 7, name: "وَإِذَا سَمِعُوا" },
  { number: 8, name: "وَلَوْ أَنَّنَا" },
  { number: 9, name: "قَالَ الْمَلَأُ" },
  { number: 10, name: "وَاعْلَمُوا" },
  { number: 11, name: "يَعْتَذِرُونَ" },
  { number: 12, name: "وَمَا مِنْ دَابَّةٍ" },
  { number: 13, name: "وَمَا أُبَرِّئُ" },
  { number: 14, name: "الرُّبَاعُ" },
  { number: 15, name: "سُبْحَانَ الَّذِي" },
  { number: 16, name: "قَالَ أَلَمْ" },
  { number: 17, name: "اقْتَرَبَ" },
  { number: 18, name: "قَدْ أَفْلَحَ" },
  { number: 19, name: "وَقَالَ الَّذِينَ" },
  { number: 20, name: "أَمَّنْ خَلَقَ" },
  { number: 21, name: "اتْلُ مَا أُوحِيَ" },
  { number: 22, name: "وَمَنْ يَقْنُتْ" },
  { number: 23, name: "وَمَا أَنْزَلْنَا" },
  { number: 24, name: "فَمَنْ أَظْلَمُ" },
  { number: 25, name: "إِلَيْهِ يُرَدُّ عِلْمُ" },
  { number: 26, name: "حم" },
  { number: 27, name: "قَالَ فَمَا خَطْبُكُمْ" },
  { number: 28, name: "قَدْ سَمِعَ اللَّهُ" },
  { number: 29, name: "تَبَارَكَ الَّذِي" },
  { number: 30, name: "عَمَّ" },
];

export function juzName(juz: number): string {
  return JUZ_NAMES.find((j) => j.number === juz)?.name ?? "";
}

function markerWeight(num: number): number {
  const digits = String(num).length;
  return 1.5 + digits * 0.6;
}

function surahTokenWeight(): number {
  return 8;
}

/** Diacritical marks (tashkeel) and zero-width joiners take no visual width. */
const NO_WIDTH = /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u200C-\u200F\u202A-\u202E]/g;

/** Approximate rendered width: base letters count, ignoring tashkeel. */
function textWeight(text: string): number {
  return text.replace(NO_WIDTH, "").length;
}

const baseCount = (word: string): number => word.replace(NO_WIDTH, "").length;

/** Virtual index of a page's start/end in the global ayah stream. */
export function pageIndexRange(meta: AyahMeta, page: number): [number, number] | null {
  const total = meta.pageByAyah.length;
  let start = -1;
  let end = -1;
  for (let i = 0; i < total; i += 1) {
    if (meta.pageByAyah[i] === page) {
      if (start === -1) start = i;
      end = i;
    }
  }
  return start === -1 ? null : [start, end];
}

/** Collect the ayahs printed on a mushaf page, in mushaf order. */
export function pageAyahs(dataset: QuranDataset, meta: AyahMeta, page: number): PageAyah[] {
  const range = pageIndexRange(meta, page);
  if (!range) return [];
  const [start, end] = range;
  const out: PageAyah[] = [];
  for (let i = start; i <= end; i += 1) {
    const ref = refFromGlobalId(dataset, i + 1); // global id is 1-based
    const resolved = ref ? resolveAyah(ref, dataset) : null;
    if (!ref || !resolved) continue;
    out.push({
      index: i,
      ref,
      text: resolved.verse.text,
      chapterId: resolved.chapter.id,
      chapterName: resolved.chapter.name,
      verseNumber: resolved.verse.number,
      juz: meta.juzByAyah[i],
      quarter: meta.quarterByAyah[i],
    });
  }
  return out;
}

/** True when this mushaf page is the very first page of a surah. */
export function pageStartsSurah(ayahs: PageAyah[]): PageAyah | null {
  return ayahs.find((a) => a.verseNumber === 1) ?? null;
}

/** Readable identity of a printed mushaf page, derived from real page metadata. */
export type PageInfo = {
  page: number;
  surah: string;
  ayahFrom: number;
  ayahTo: number;
  juz: number;
  hizb: number;
  quarter: number;
  quarterInHizb: number;
};

export function pageInfo(dataset: QuranDataset, meta: AyahMeta, page: number): PageInfo | null {
  const ayahs = pageAyahs(dataset, meta, page);
  if (ayahs.length === 0) return null;
  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  const quarter = first.quarter;
  return {
    page,
    surah: first.chapterName,
    ayahFrom: first.verseNumber,
    ayahTo: last.verseNumber,
    juz: first.juz,
    hizb: quarterToHizb(quarter),
    quarter,
    quarterInHizb: quarterInHizb(quarter),
  };
}

/**
 * Split the ayahs of a page into `lineCount` (≤15) justified-looking lines.
 * Verse text flows continuously (as in a printed mushaf); every ayah ends with
 * its number marker (﴿N﴾). A surah starting mid-page gets its own ornamental
 * basmala line, and hizb-quarter boundaries get a ۞ marker. The first ayah of
 * the page is rendered by the component as a decorative heading instead.
 *
 * The per-line budget is binary-searched so the packed page never exceeds
 * `lineCount` lines no matter how dense the page is.
 */
export function splitPageIntoLines(
  ayahs: PageAyah[],
  opts?: { lineCount?: number; basmalaText?: string }
): MushafLine[] {
  const lineCount = Math.max(1, opts?.lineCount ?? MUSHAF_LINES);
  const basmala = opts?.basmalaText ?? "";

  const tokens: LineToken[] = [];
  ayahs.forEach((a, ai) => {
    const isFirst = ai === 0;
    const isSurahStart = a.verseNumber === 1;
    if (isSurahStart && !isFirst) {
      const showBasmala = a.chapterId !== 9 && a.chapterId !== 1 && basmala.length > 0;
      tokens.push({
        type: "surah",
        name: a.chapterName,
        basmala: showBasmala ? basmala : "",
        w: surahTokenWeight(),
      });
    }
    if (a.text.trim().length > 0) {
      tokens.push({ type: "text", text: a.text, w: textWeight(a.text) });
    }
    tokens.push({ type: "marker", num: a.verseNumber, w: markerWeight(a.verseNumber) });
    if (ai > 0 && a.quarter !== ayahs[ai - 1].quarter) {
      tokens.push({ type: "quarter", num: a.quarter, w: 2.4 });
    }
  });

  const weight = (t: LineToken): number => t.w;
  const total = tokens.reduce((sum, t) => sum + weight(t), 0);

  const pack = (budget: number): MushafLine[] => {
    const lines: MushafLine[] = [];
    let line: LineToken[] = [];
    let lineW = 0;

    const flush = () => {
      if (line.length > 0) {
        lines.push({ tokens: line, w: lineW });
        line = [];
        lineW = 0;
      }
    };

    const splitTextAcrossLines = (text: string, prefix?: { tokens: LineToken[]; w: number }) => {
      const pieces: MushafLine[] = [];
      const words = text.split(" ");
      let acc: string[] = [];
      let accW = 0;
      const emit = () => {
        if (acc.length === 0) return;
        const joined = acc.join(" ");
        pieces.push({ tokens: [{ type: "text", text: joined, w: textWeight(joined) }], w: accW });
        acc = [];
        accW = 0;
      };
      for (const word of words) {
        const add = (acc.length > 0 ? 1 : 0) + baseCount(word);
        if (acc.length > 0 && accW + add > budget) emit();
        acc.push(word);
        accW += add;
      }
      emit();

      pieces.forEach((piece, pi) => {
        if (pi === 0 && prefix && prefix.tokens.length > 0) {
          piece.tokens = [...prefix.tokens, ...piece.tokens];
          piece.w += prefix.w;
        }
        lines.push(piece);
      });
    };

    for (const token of tokens) {
      if (token.type === "surah") {
        flush();
        lines.push({ tokens: [token], w: token.w });
        continue;
      }
      if (token.type === "text" && token.w > budget) {
        const prefix = { tokens: line, w: lineW };
        line = [];
        lineW = 0;
        splitTextAcrossLines(token.text, prefix);
        continue;
      }
      if (line.length === 0) {
        line = [token];
        lineW = token.w;
        continue;
      }
      if (lineW + token.w <= budget) {
        line.push(token);
        lineW += token.w;
        continue;
      }
      flush();
      line = [token];
      lineW = token.w;
    }
    flush();
    return lines;
  };

  if (tokens.length === 0) return [];
  const minBudget = Math.max(4, ...tokens.map((t) => weight(t)));
  let lo = minBudget;
  let hi = Math.max(minBudget, total);
  let best = hi;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pack(mid).length <= lineCount) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return pack(best);
}

/** True if the ayah just before this page belongs to a different juz (page opens a juz). */
export function pageOpensJuz(meta: AyahMeta, page: number, ayahs: PageAyah[]): number | null {
  if (ayahs.length === 0) return null;
  const first = ayahs[0];
  if (first.index === 0) return first.juz;
  const prevJuz = meta.juzByAyah[first.index - 1];
  return prevJuz === first.juz ? null : first.juz;
}

/** True if the page's first ayah opens a new hizb quarter. */
export function pageOpensQuarter(meta: AyahMeta, page: number, ayahs: PageAyah[]): number | null {
  if (ayahs.length === 0) return null;
  const first = ayahs[0];
  if (first.index === 0) return first.quarter;
  const prevQuarter = meta.quarterByAyah[first.index - 1];
  return prevQuarter === first.quarter ? null : first.quarter;
}