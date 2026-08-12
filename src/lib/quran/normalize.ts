const DIACRITICS_RE = /[\u064B-\u065F\u0670\u0640]/g;
const ALIF_VARIANTS = /[أإآٱ]/g;
const HAMZA_VARIANTS = /[ؤئ]/g;

export function normalizeArabic(text: string): string {
  return text
    .replace(DIACRITICS_RE, "")
    .replace(ALIF_VARIANTS, "ا")
    .replace(HAMZA_VARIANTS, "ء")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\u0621-\u064A\s0-9]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function makeNormalizedIndex(text: string): string {
  return normalizeArabic(text);
}

export function normalizeForCompare(a: string): string {
  return normalizeArabic(a);
}
