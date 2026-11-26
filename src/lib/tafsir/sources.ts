import richJson from "@/data/quran/tafsir-rich.json";
import { validateRichTafsirEntry } from "./core";
import { SUMMARY_TAFSIR } from "./summary";
import type { RichTafsirEntry, TafsirSourcesFile } from "./types";

/**
 * The reviewed source pack. Invalid entries are dropped rather than rendered,
 * so a malformed row cannot show half an interpretation; selection then falls
 * back honestly to the pinned published edition. `scripts/test-tafsir-engine.mjs` asserts
 * that every entry in the file is valid, so a drop never goes unnoticed.
 */
const FILE = richJson as unknown as TafsirSourcesFile;

export const RICH_TAFSIR_META = {
  version: FILE.version,
  reviewedDate: FILE.reviewedDate,
  note: FILE.note,
} as const;

export const RICH_TAFSIR: RichTafsirEntry[] = FILE.entries.filter(validateRichTafsirEntry);

export function getCuratedTafsir(ref: string): RichTafsirEntry | null {
  return RICH_TAFSIR.find((entry) => entry.ref === ref) ?? null;
}

/**
 * Every reviewed ayah the renderer can show: the ten full articles first, then
 * the reviewed summaries from the original dataset. Overlapping refs keep the
 * fuller article, so a user never sees two entries for the same verse.
 */
const RICH_REFS = new Set(RICH_TAFSIR.map((entry) => entry.ref));
export const REVIEWED_TAFSIR: RichTafsirEntry[] = [
  ...RICH_TAFSIR,
  ...SUMMARY_TAFSIR.filter(
    (entry) => !RICH_REFS.has(entry.ref) && validateRichTafsirEntry(entry)
  ),
];

export function getReviewedTafsir(ref: string): RichTafsirEntry | null {
  return REVIEWED_TAFSIR.find((entry) => entry.ref === ref) ?? null;
}
