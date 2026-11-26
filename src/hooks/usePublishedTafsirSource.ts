"use client";

import { useEffect, useState } from "react";
import { loadPublishedTafsir } from "@/lib/quran/tafsirSource";
import type { RichTafsirEntry } from "@/lib/tafsir";

export type PublishedSourceState = "loading" | "ready" | "error";

type SourceResult = {
  key: string;
  entries: RichTafsirEntry[];
  state: PublishedSourceState;
};

/**
 * Loads the pinned published tafsir asset after mount, and only when a surface
 * that can actually show an ayah is open.
 *
 * The fetch and SHA check never run during render. The underlying loader caches
 * a verified pack and deduplicates in-flight requests. `enabled` keeps the
 * text-reader sheet from downloading 2.9 MB before the user taps an ayah;
 * changing `retryKey` (the ayah ref) resets the state to loading and retries a
 * failed load on the next ayah.
 */
export function usePublishedTafsirSource(
  enabled = true,
  retryKey: string | null = null
): { entries: RichTafsirEntry[]; state: PublishedSourceState } {
  const key = `${enabled ? "on" : "off"}:${retryKey ?? ""}`;
  const [result, setResult] = useState<SourceResult>({ key, entries: [], state: "loading" });

  /* Deriving the current value from the key avoids a setState-in-effect: a new
     ayah instantly hides a previous error and shows the honest loading state. */
  const current =
    result.key === key ? result : { key, entries: [], state: "loading" as const };

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadPublishedTafsir().then((loaded) => {
      if (!alive) return;
      setResult({ key, entries: loaded ?? [], state: loaded ? "ready" : "error" });
    });
    return () => {
      alive = false;
    };
  }, [enabled, retryKey, key]);

  return { entries: current.entries, state: current.state };
}
