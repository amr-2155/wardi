import type { Chapter, QuranDataset, Verse } from "./types";

export type ParsedRef = { surah: number; ayah: number };

export function parseAyahRef(ref: string): ParsedRef | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(ref.trim());
  if (!m) return null;
  const surah = Number(m[1]);
  const ayah = Number(m[2]);
  if (surah < 1 || surah > 114 || ayah < 1) return null;
  return { surah, ayah };
}

export function getGlobalId(surah: number, ayah: number, chapters: Chapter[]): number | null {
  const chapter = chapters.find((c) => c.id === surah);
  if (!chapter) return null;
  if (ayah < 1 || ayah > chapter.ayahCount) return null;
  let id = 0;
  for (const c of chapters) {
    if (c.id === surah) break;
    id += c.ayahCount;
  }
  return id + ayah;
}

export function resolveAyah(
  ref: string,
  dataset: QuranDataset
): { verse: Verse; chapter: Chapter } | null {
  const parsed = parseAyahRef(ref);
  if (!parsed) return null;
  const chapter = dataset.chapters.find((c) => c.id === parsed.surah);
  if (!chapter) return null;
  const verse = chapter.verses.find((v) => v.number === parsed.ayah);
  if (!verse) return null;
  return { verse, chapter };
}

export function validateAyahReference(ref: string, dataset: QuranDataset): boolean {
  return resolveAyah(ref, dataset) !== null;
}

export function validateAyah(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.number !== "number" || !Number.isInteger(v.number) || v.number < 1) return false;
  if (typeof v.text !== "string") return false;
  if (v.text.trim().length === 0) return false;
  if (/[A-Za-z0-9\u0600-\u06FF]/.test(v.text) === false) return false;
  return true;
}

export function verifyAyahHash(
  globalAyahId: number,
  text: string,
  expectedHash: string
): Promise<boolean> {
  return sha256Text(text).then((hex) => hex.slice(0, 24) === expectedHash.slice(0, 24));
}

export function sha256Text(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data).then((buf) => {
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (let i = 0; i < bytes.length; i += 1) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  });
}
