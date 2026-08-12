import type { QuranDataset, TafsirEntry } from "./types";
import { validateAyahReference } from "./validate";

export function getTafsir(ref: string, tafsir: TafsirEntry[]): TafsirEntry | null {
  return tafsir.find((t) => t.ref === ref) ?? null;
}

export function tadabburPool(tafsir: TafsirEntry[], dataset: QuranDataset): string[] {
  return tafsir
    .filter((t) => validateAyahReference(t.ref, dataset))
    .map((t) => t.ref);
}

export function validateTafsirEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.ref !== "string" || !/^\d{1,3}:\d{1,3}$/.test(v.ref)) return false;
  if (typeof v.simplifiedMeaning !== "string" || v.simplifiedMeaning.trim().length === 0) return false;
  if (typeof v.simplerMeaning !== "string" || v.simplerMeaning.trim().length === 0) return false;
  if (!Array.isArray(v.howToLive) || v.howToLive.length === 0) return false;
  if (v.howToLive.some((item) => typeof item !== "string" || item.trim().length === 0)) return false;
  if (typeof v.reflection !== "string" || v.reflection.trim().length === 0) return false;
  if (typeof v.tafsirSource !== "string" || v.tafsirSource.trim().length === 0) return false;
  if (v.reviewStatus !== "reviewed") return false;
  return true;
}
