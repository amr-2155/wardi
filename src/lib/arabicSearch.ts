/**
 * Arabic-aware search matching for the adhkar list.
 *
 * The dataset is fully vocalized — "أَسْتَغْفِرُ" — while a keyboard in a hurry
 * produces "أستغفر". Comparing the raw strings found nothing, so the one dhikr
 * people look up most (the ×100 istighfar) could not be found by typing its own
 * name. Folding both sides to the letters a person actually types fixes that
 * without indexing or storing a second copy of the dataset.
 *
 * Own module, not a helper inside the view, because this is a rule with edge
 * cases (hamza forms, ta-marbuta, tatweel) and `scripts/test-adhkar.mjs`
 * executes it for real rather than reading the call site.
 */

/** Harakat, superscript alef, tanween and tatweel carry no identity. */
const MARKS = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Fold an Arabic string to its searchable form: no marks, no tatweel, one
 * letter per orthographic variant, collapsed whitespace, lower-cased.
 */
export function normalizeArabic(value: string): string {
  return value
    .replace(MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ؤئ]/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `query` appears anywhere in `text`, ignoring the above. */
export function matchesArabic(text: string, query: string): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  return normalizeArabic(text).includes(q);
}

/** True when any of `fields` matches — the list filter's own rule. */
export function matchesAnyArabic(fields: (string | undefined)[], query: string): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  return fields.some((f) => f !== undefined && normalizeArabic(f).includes(q));
}