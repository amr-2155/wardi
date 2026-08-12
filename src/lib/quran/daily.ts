import type { QuranDataset } from "./types";
import { resolveAyah } from "./validate";

export type DailySelection = {
  ref: string;
  dateKey: string;
};

export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getDailyAyah(
  date: Date,
  dataset: QuranDataset,
  pool: string[],
  recentRefs: string[] = []
): DailySelection | null {
  const validPool = pool.filter((ref) => resolveAyah(ref, dataset) !== null);

  if (validPool.length === 0) return null;

  const dateKey = dateKeyOf(date);
  const candidates = validPool.filter((ref) => !recentRefs.includes(ref));
  const selectionSet = candidates.length > 0 ? candidates : validPool;
  const hash = fnv1a(`${dateKey}|${dataset.manifest.datasetVersion}`);
  const index = hash % selectionSet.length;
  return { ref: selectionSet[index], dateKey };
}
