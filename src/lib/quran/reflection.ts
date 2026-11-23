/**
 * Reflection ayah selection grounded in the pages the user ACTUALLY read.
 *
 * The old daily reflection was `fnv1a(date)` over the whole curated pool, so
 * it could point at a surah the reader never opened that day. This module maps
 * the printed mushaf pages confirmed by the reader through the canonical
 * ayah-meta pagination, then picks a real ayah from exactly those pages.
 *
 * Every returned ref is resolved from the canonical dataset via `pageAyahs`;
 * nothing is invented. Fresh curated (tafsir-backed) ayahs on those pages are
 * preferred so a reflection question and full tafsir are available; a fresh
 * non-curated ayah still outranks a recently used curated one, so reflections
 * never silently repeat while another authentic ayah on the read pages exists.
 */
import type { AyahMeta, AyahRef, QuranDataset } from "./types";
import { pageAyahs } from "./mushaf";

export function pickReflectionFromPages(params: {
  dataset: QuranDataset;
  meta: AyahMeta;
  /** Curated tafsir refs (only these carry a reflection question). */
  pool: readonly string[];
  /** Printed mushaf pages the reader confirmed as finished. */
  pages: readonly number[];
  /** Recently used refs, to avoid repeating a reflection. */
  history?: readonly string[];
}): AyahRef | null {
  const { dataset, meta, pool, pages, history = [] } = params;
  if (!pages.length) return null;

  const seen = new Set(history);
  const curated = new Set(pool);

  // Unique, ordered pages; collect every authentic ref printed on them.
  const refs: string[] = [];
  const seenRef = new Set<string>();
  for (const rawPage of [...new Set(pages)].sort((a, b) => a - b)) {
    if (!Number.isInteger(rawPage) || rawPage < 1) continue;
    for (const ayah of pageAyahs(dataset, meta, rawPage)) {
      if (!seenRef.has(ayah.ref)) {
        seenRef.add(ayah.ref);
        refs.push(ayah.ref);
      }
    }
  }
  if (refs.length === 0) return null;

  // 1. Curated, not recently used — a real reflection question is available.
  const freshCurated = refs.filter((r) => curated.has(r) && !seen.has(r));
  if (freshCurated.length) return freshCurated[0] as AyahRef;

  // 2. Any other authentic ayah on the pages actually read that was NOT used
  //    recently. Avoiding a repeat outranks having a curated question: a fresh
  //    ayah with an honest "no reviewed tafsir yet" state beats a recycled one.
  const freshAny = refs.filter((r) => !seen.has(r));
  if (freshAny.length) return freshAny[0] as AyahRef;

  // 3. Every page-local ayah was seen before. Only now may a curated one repeat
  //    (it at least still has a question), before any other repeat.
  const anyCurated = refs.filter((r) => curated.has(r));
  if (anyCurated.length) return anyCurated[0] as AyahRef;

  // 4. Last resort: any authentic ayah from the pages read, still never invented.
  return refs[0] as AyahRef;
}
