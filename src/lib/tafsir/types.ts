import type { AyahRef } from "../quran/types";

/**
 * Rich, sourced tafsir model.
 *
 * This is deliberately separate from the legacy `TafsirEntry` (the 24-entry
 * `tafsir.json` used by the daily tadabbur). The legacy model stays frozen so
 * its tests and UI keep working; this one carries the fuller, article-shaped
 * interpretation the reader screen needs.
 *
 * Three hard rules encode the project's integrity stance:
 *  - The exegeted verse text is NEVER stored here. It is resolved at render
 *    time from the canonical, hash-verified Quran dataset.
 *  - `reviewed` means a human checked this exact wording for this app.
 *  - `published` means verbatim text from a named published edition; it is
 *    trustworthy as a source, but it is NOT an in-house human review. Anything
 *    produced by a language model stays `draft` until a human reviews it.
 */
export type TafsirReviewStatus = "reviewed" | "published" | "draft";

export type TafsirVocabularyItem = {
  term: string;
  meaning: string;
};

export type TafsirBenefitCategory = "creed" | "educational" | "legal";

export type TafsirBenefit = {
  category: TafsirBenefitCategory;
  text: string;
};

export type TafsirApplication = {
  personal?: string;
  family?: string;
  work?: string;
  social?: string;
};

export type TafsirScholarStrength = "stronger" | "mentioned";

export type TafsirScholarView = {
  view: string;
  evidence?: string;
  strength?: TafsirScholarStrength;
};

export type TafsirScholars = {
  summary?: string;
  views?: TafsirScholarView[];
};

export type TafsirRevelation = {
  /** `none` means "no authentic specific occasion is established", never a guess. */
  status: "established" | "none";
  text?: string;
};

export type RichTafsirEntry = {
  ref: AyahRef;
  reviewStatus: TafsirReviewStatus;
  /** Present for entries this app reviewed, and for generated drafts. */
  reviewedDate?: string;
  /** Retrieval/publication date for a verbatim `published` edition. */
  sourceDate?: string;
  /** The published edition, or the books the reviewed summary is drawn from. */
  sourceEdition: string;
  overview?: string;
  vocabulary?: TafsirVocabularyItem[];
  context?: string;
  revelation?: TafsirRevelation;
  detailed?: string[];
  /**
   * Reviewed, practical "how to live by it" steps. Kept separate from
   * `detailed` so a legacy reviewed summary is never relabelled as a full
   * scholarly exposition when it is promoted into the rich renderer.
   */
  practice?: string[];
  benefits?: TafsirBenefit[];
  scholars?: TafsirScholars;
  application?: TafsirApplication;
  reflection?: string[];
  dua?: string;
  summary?: string;
};

export type TafsirSourcesFile = {
  version: string;
  reviewedDate: string;
  note: string;
  entries: RichTafsirEntry[];
};

/** Everything the engine needs to ground one interpretation. */
export type TafsirContext = {
  ref: string;
  chapterId: number;
  chapterName: string;
  ayahNumber: number;
  /** Copied verbatim from the verified dataset; never from the model. */
  verseText: string;
  locale: "ar" | "en";
};

export type TafsirProvider = {
  id: string;
  enabled: boolean;
  /** Sends the grounded prompt to a trusted proxy and returns raw model text. */
  complete: (input: { system: string; user: string }) => Promise<string>;
};

/**
 * Why an interpretation could not be shown. The UI must surface these honestly
 * instead of dressing an empty or guessed answer up as trusted commentary.
 */
export type TafsirUnavailableReason =
  | "no-dataset"
  | "invalid-ref"
  | "no-source";

export type TafsirResult =
  | {
      status: "curated";
      context: TafsirContext;
      entry: RichTafsirEntry;
      provider: "curated";
    }
  | {
      status: "generated";
      context: TafsirContext;
      entry: RichTafsirEntry;
      provider: string;
    }
  | {
      status: "unavailable";
      context: TafsirContext | null;
      reason: TafsirUnavailableReason;
      /** True when a trusted proxy is configured but had no source to ground on. */
      aiEnabled: boolean;
    };
