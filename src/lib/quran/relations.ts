import type { QuranDataset, RelationEntry, RelationsFile, Topic } from "./types";
import { RELATED_TYPES } from "./types";
import { validateAyahReference } from "./validate";

export function getRelatedAyahs(
  ref: string,
  relations: RelationsFile,
  dataset: QuranDataset
): RelationEntry | null {
  const entry = relations.entries.find((e) => e.sourceAyah === ref);
  if (!entry) return null;
  const verified = entry.relatedAyahs.filter((r) => r.verified && validateAyahReference(r.ayah, dataset));
  return { ...entry, relatedAyahs: verified };
}

export function isValidRelationType(value: string): boolean {
  return (RELATED_TYPES as readonly string[]).includes(value);
}

export function isDailyCandidate(ref: string, relations: RelationsFile, topics: Topic[]): boolean {
  return (
    relations.entries.some((e) => e.sourceAyah === ref) ||
    topics.some((t) => t.ayahs.includes(ref as never))
  );
}

export function collectDailyPool(relations: RelationsFile, topics: Topic[]): string[] {
  const pool = new Set<string>();
  for (const entry of relations.entries) pool.add(entry.sourceAyah);
  for (const topic of topics) for (const ref of topic.ayahs) pool.add(ref);
  return [...pool];
}
