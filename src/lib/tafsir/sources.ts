import richJson from "@/data/quran/tafsir-rich.json";
import { validateRichTafsirEntry } from "./core";
import type { RichTafsirEntry, TafsirSourcesFile } from "./types";

/**
 * The reviewed source pack. Invalid entries are dropped rather than rendered,
 * so a malformed row degrades to the honest "no reviewed source" state instead
 * of showing half an interpretation. `scripts/test-tafsir-engine.mjs` asserts
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
