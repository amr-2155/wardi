"use client";

import { useCallback, useState } from "react";
import type { QuranDataset } from "@/lib/quran/types";
import { generateTafsirLive } from "@/lib/tafsir";
import type { TafsirResult } from "@/lib/tafsir";

export type TafsirGenerationState = "idle" | "loading" | "error";

type GenerationRecord = {
  ref: string | null;
  dataset: QuranDataset | null;
  state: TafsirGenerationState;
  result: TafsirResult | null;
};

/**
 * Explicit, user-triggered generation for one ayah.
 *
 * Nothing calls the network on render. The record is keyed by the ayah and the
 * dataset object, so changing either instantly hides a stale result without an
 * effect, and an unavailable/error result never replaces the honest empty
 * state with fabricated commentary.
 */
export function useTafsirGeneration(ref: string | null, dataset: QuranDataset | null) {
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  const current = record && record.ref === ref && record.dataset === dataset ? record : null;

  const generate = useCallback(async () => {
    if (!ref) return;
    setRecord({ ref, dataset, state: "loading", result: null });
    try {
      const result = await generateTafsirLive(ref, dataset);
      const unavailable = result.status === "unavailable";
      setRecord((prev) =>
        prev && prev.ref === ref && prev.dataset === dataset
          ? {
              ...prev,
              state: unavailable ? "error" : "idle",
              result: unavailable ? null : result,
            }
          : prev
      );
    } catch {
      setRecord((prev) =>
        prev && prev.ref === ref && prev.dataset === dataset
          ? { ...prev, state: "error", result: null }
          : prev
      );
    }
  }, [ref, dataset]);

  return {
    model: current?.result ?? null,
    state: current?.state ?? ("idle" as TafsirGenerationState),
    generate,
  };
}
