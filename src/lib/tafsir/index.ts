import type { QuranDataset } from "@/lib/quran/types";
import { generateTafsir, selectTafsir } from "./core";
import { createRemoteProvider } from "./provider";
import { RICH_TAFSIR } from "./sources";
import type { TafsirResult } from "./types";

export { TAFSIR_SYSTEM_PROMPT, TAFSIR_SYSTEM_PROMPT_VERSION } from "./systemPrompt";
export {
  resolveTafsirContext,
  selectTafsir,
  validateGeneratedTafsir,
  validateRichTafsirEntry,
} from "./core";
export { getCuratedTafsir, RICH_TAFSIR, RICH_TAFSIR_META } from "./sources";
export type {
  RichTafsirEntry,
  TafsirBenefit,
  TafsirContext,
  TafsirProvider,
  TafsirResult,
  TafsirUnavailableReason,
} from "./types";

/**
 * Synchronous model for rendering: reviewed entry, or an honest unavailable
 * state. Never calls the network.
 */
export function buildTafsirModel(ref: string, dataset: QuranDataset | null): TafsirResult {
  return selectTafsir({
    ref,
    dataset,
    curated: RICH_TAFSIR,
    aiEnabled: Boolean(createRemoteProvider()),
  });
}

/** Async path used by an explicit "generate" action when a proxy is configured. */
export function generateTafsirLive(
  ref: string,
  dataset: QuranDataset | null
): Promise<TafsirResult> {
  return generateTafsir({
    ref,
    dataset,
    curated: RICH_TAFSIR,
    provider: createRemoteProvider(),
  });
}
