import type { QuranDataset } from "@/lib/quran/types";
import { generateTafsir, selectTafsir } from "./core";
import { createRemoteProvider } from "./provider";
import { REVIEWED_TAFSIR } from "./sources";
import type { RichTafsirEntry, TafsirResult } from "./types";

export { TAFSIR_SYSTEM_PROMPT, TAFSIR_SYSTEM_PROMPT_VERSION } from "./systemPrompt";
export {
  resolveTafsirContext,
  selectTafsir,
  validateGeneratedTafsir,
  validateRichTafsirEntry,
} from "./core";
export {
  getCuratedTafsir,
  getReviewedTafsir,
  RICH_TAFSIR,
  REVIEWED_TAFSIR,
  RICH_TAFSIR_META,
} from "./sources";
export type {
  RichTafsirEntry,
  TafsirBenefit,
  TafsirContext,
  TafsirProvider,
  TafsirResult,
  TafsirReviewStatus,
  TafsirUnavailableReason,
} from "./types";

/**
 * Synchronous model for rendering: reviewed entry first, then a published
 * source, or an honest unavailable state. Never calls the network.
 */
export function buildTafsirModel(
  ref: string,
  dataset: QuranDataset | null,
  published: RichTafsirEntry[] = []
): TafsirResult {
  return selectTafsir({
    ref,
    dataset,
    curated: REVIEWED_TAFSIR,
    published,
    aiEnabled: Boolean(createRemoteProvider()),
  });
}

/** Async path used by an explicit "generate" action when a proxy is configured. */
export function generateTafsirLive(
  ref: string,
  dataset: QuranDataset | null,
  published: RichTafsirEntry[] = []
): Promise<TafsirResult> {
  return generateTafsir({
    ref,
    dataset,
    curated: REVIEWED_TAFSIR,
    published,
    provider: createRemoteProvider(),
  });
}

/** Whether this build has a trusted proxy, so the UI can offer generation. */
export function isTafsirAIEnabled(): boolean {
  return Boolean(createRemoteProvider());
}
