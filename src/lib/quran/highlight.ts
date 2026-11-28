/**
 * Search-result highlighting for the mushaf reader.
 *
 * Diacritic-insensitive: each query character may be followed by any
 * harakat/tatweel, and the common alef/ya/ta-marbuta variants are
 * interchangeable (mirrors the search normalizer in lib/quran/normalize.ts).
 * Returns plain segments so callers can wrap `hit` runs in <mark>.
 */

const DIACRITICS = "[\\u064B-\\u0652\\u0670\\u0640]*";

const EQUIV: Record<string, string> = {
  "ا": "[اأإآٱ]",
  "أ": "[اأإآٱ]",
  "إ": "[اأإآٱ]",
  "آ": "[اأإآٱ]",
  "ٱ": "[اأإآٱ]",
  "ى": "[ىي]",
  "ي": "[ىي]",
  "ة": "[ةه]",
  "ه": "[ةه]",
};

function escapeRe(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type HighlightSegment = { t: string; hit: boolean };

/** Split `text` into segments, marking runs that match `query` (max 12). */
export function highlightSegments(
  text: string,
  query: string
): HighlightSegment[] {
  const q = query.trim();
  if (q.length < 2) return [{ t: text, hit: false }];
  const pattern = q
    .split("")
    .map((ch) => (EQUIV[ch] ?? escapeRe(ch)) + DIACRITICS)
    .join("");
  let re: RegExp;
  try {
    re = new RegExp(pattern, "g");
  } catch {
    return [{ t: text, hit: false }];
  }
  const out: HighlightSegment[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && i < 12) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > last) out.push({ t: text.slice(last, m.index), hit: false });
    out.push({ t: m[0], hit: true });
    last = m.index + m[0].length;
    i += 1;
  }
  if (last === 0) return [{ t: text, hit: false }];
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out;
}
