import draftsJson from "@/data/quran/tafsir-drafts.json";
import { validateRichTafsirEntry } from "./core";
import type { RichTafsirEntry, TafsirSourcesFile } from "./types";

/**
 * Draft reflective entries awaiting human review.
 *
 * These are NEVER merged into REVIEWED_TAFSIR or the published pack. They are
 * reachable only through the explicit draft preview flag, and the panel marks
 * them with the draft badge and disclaimer. After human review an entry moves
 * out of this file into the reviewed pack; nothing ships from here.
 */
const FILE = draftsJson as unknown as TafsirSourcesFile;

export const DRAFT_TAFSIR: RichTafsirEntry[] = FILE.entries.filter(
  (entry) => entry.reviewStatus === "draft" && validateRichTafsirEntry(entry)
);

export function getDraftTafsir(ref: string): RichTafsirEntry | null {
  return DRAFT_TAFSIR.find((entry) => entry.ref === ref) ?? null;
}

/**
 * Draft preview is opt-in per session via ?tafsirDrafts=1, so a normal reader
 * can never stumble into unreviewed wording. Server render stays clean.
 */
export function isTafsirDraftPreviewEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("tafsirDrafts") === "1";
  } catch {
    return false;
  }
}
