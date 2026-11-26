"use client";

import { useCallback, useRef, useState } from "react";
import type { QuranDataset } from "@/lib/quran/types";
import { generateTafsirLive } from "@/lib/tafsir";
import type { RichTafsirEntry, TafsirResult } from "@/lib/tafsir";

export type TafsirGenerationState = "idle" | "loading" | "error";

type GenerationRecord = {
  id: number;
  ref: string | null;
  dataset: QuranDataset | null;
  published: RichTafsirEntry[];
  state: TafsirGenerationState;
  result: TafsirResult | null;
};

/**
 * Explicit, user-triggered generation for one ayah.
 *
 * Nothing calls the network on render. The record is keyed by the ayah, the
 * dataset object and the loaded published pack, so changing any of them
 * instantly hides a stale result without an effect. An unavailable/error result
 * never replaces the honest empty state with fabricated commentary.
 */
export function useTafsirGeneration(
  ref: string | null,
  dataset: QuranDataset | null,
  published: RichTafsirEntry[] = []
) {
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  /* Monotonic id so an older, slower response cannot overwrite a newer result
     for the same ayah/key. The key checks below hide results across ayahs; this
     guard orders overlapping requests within one ayah. */
  const nextId = useRef(0);
  const current =
    record &&
    record.ref === ref &&
    record.dataset === dataset &&
    record.published === published
      ? record
      : null;

  const generate = useCallback(async () => {
    if (!ref) return;
    const id = ++nextId.current;
    setRecord({ id, ref, dataset, published, state: "loading", result: null });
    try {
      const result = await generateTafsirLive(ref, dataset, published);
      const unavailable = result.status === "unavailable";
      setRecord((prev) =>
        prev &&
        prev.id === id &&
        prev.ref === ref &&
        prev.dataset === dataset &&
        prev.published === published
          ? {
              ...prev,
              state: unavailable ? "error" : "idle",
              result: unavailable ? null : result,
            }
          : prev
      );
    } catch {
      setRecord((prev) =>
        prev &&
        prev.id === id &&
        prev.ref === ref &&
        prev.dataset === dataset &&
        prev.published === published
          ? { ...prev, state: "error", result: null }
          : prev
      );
    }
  }, [ref, dataset, published]);

  return {
    model: current?.result ?? null,
    state: current?.state ?? ("idle" as TafsirGenerationState),
    generate,
  };
}
