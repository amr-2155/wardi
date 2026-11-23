import legacyJson from "../../data/quran/tafsir.json";
import type { RichTafsirEntry } from "./types";

type LegacyEntry = {
  ref: string;
  simplifiedMeaning: string;
  simplerMeaning: string;
  howToLive: string[];
  reflection: string;
  tafsirSource?: string;
  reviewStatus?: string;
};

const FILE = legacyJson as unknown as {
  version: string;
  reviewedBy: string;
  reviewedDate: string;
  tafsirSource: string;
  entries: LegacyEntry[];
};

/**
 * Reviewed coverage without invented scholarship.
 *
 * The original tadabbur dataset already holds 24 human-reviewed ayahs, but its
 * content was only reachable through the small accordion renderer. Promoting
 * those entries into the article renderer widens reviewed coverage with no new
 * interpretation: every field keeps its original meaning. `practice` exists so
 * the reviewed "how to live" steps are not silently relabelled as scholarly
 * exposition; the source edition names the original reviewed dataset.
 */
function toRichEntry(entry: LegacyEntry): RichTafsirEntry {
  return {
    ref: entry.ref as RichTafsirEntry["ref"],
    reviewStatus: "reviewed",
    reviewedDate: FILE.reviewedDate,
    sourceEdition: `${entry.tafsirSource ?? FILE.tafsirSource} — ${FILE.reviewedBy}`,
    overview: entry.simplifiedMeaning,
    summary: entry.simplerMeaning,
    practice: entry.howToLive,
    reflection: [entry.reflection],
  };
}

export const SUMMARY_TAFSIR: RichTafsirEntry[] = FILE.entries
  .filter((entry) => entry.reviewStatus === "reviewed")
  .map(toRichEntry);
