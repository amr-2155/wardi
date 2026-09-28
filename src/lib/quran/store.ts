import type { AyahMeta, Chapter, QuranDataset } from "./types";
import { sha256Text } from "./validate";
import {
  DATASET_SHA256,
  QURAN_DATASET_VERSION,
  QURAN_SOURCE_URL,
  QURAN_SOURCE,
  QURAN_VERIFICATION_DATE,
  QURAN_TOTAL_AYAHS,
} from "./dataset.const";

const DB_NAME = "my-ward";
const DB_VERSION = 1;
const CACHE_KEY = "quran-v1";

export type DatasetStatus = "verified" | "hash-mismatch" | "error";

export type LoadedDataset = {
  dataset: QuranDataset | null;
  status: DatasetStatus;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction("cache", "readonly");
      const req = tx.objectStore("cache").get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // caching is best-effort
  }
}

async function verifyText(text: string): Promise<boolean> {
  const hex = await sha256Text(text);
  return hex === DATASET_SHA256;
}

function parseDataset(text: string): QuranDataset {
  const data = JSON.parse(text) as QuranDataset;
  if (data.manifest.totalAyahs !== QURAN_TOTAL_AYAHS) {
    throw new Error(`totalAyahs mismatch: ${data.manifest.totalAyahs}`);
  }
  return data;
}

export async function loadDataset(): Promise<LoadedDataset> {
  const cached = await idbGet<{ text: string }>(CACHE_KEY);
  if (cached && (await verifyText(cached.text))) {
    try {
      return { dataset: parseDataset(cached.text), status: "verified" };
    } catch {
      // fall through to fetch
    }
  }

  try {
    const res = await fetch("/quran/quran.json");
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const text = await res.text();
    if (!(await verifyText(text))) {
      return { dataset: null, status: "hash-mismatch" };
    }
    const dataset = parseDataset(text);
    await idbSet(CACHE_KEY, { text });
    return { dataset, status: "verified" };
  } catch {
    return { dataset: null, status: "error" };
  }
}

export async function loadHashes(): Promise<string[]> {
  try {
    const res = await fetch("/quran/hashes.json");
    if (!res.ok) return [];
    return (await res.json()) as string[];
  } catch {
    return [];
  }
}

/**
 * Printed-mushaf pagination metadata (page/juz/quarter per ayah).
 * Small file, fetched directly (no IndexedDB cache — cheap to re-fetch).
 */
export async function loadAyahMeta(): Promise<AyahMeta | null> {
  try {
    const res = await fetch("/quran/ayah-meta.json");
    if (!res.ok) return null;
    const raw = (await res.json()) as Partial<AyahMeta> & { totalAyahs?: number };
    const total = raw.totalAyahs ?? QURAN_TOTAL_AYAHS;
    if (
      typeof raw.pages !== "number" ||
      raw.pages < 1 ||
      !Array.isArray(raw.pageByAyah) ||
      !Array.isArray(raw.juzByAyah) ||
      !Array.isArray(raw.quarterByAyah) ||
      raw.pageByAyah.length !== total ||
      raw.juzByAyah.length !== total ||
      raw.quarterByAyah.length !== total
    ) {
      return null;
    }
    return {
      pages: raw.pages,
      pageByAyah: raw.pageByAyah,
      juzByAyah: raw.juzByAyah,
      quarterByAyah: raw.quarterByAyah,
    };
  } catch {
    return null;
  }
}

export function getChapter(dataset: QuranDataset, id: number): Chapter | undefined {
  return dataset.chapters.find((c) => c.id === id);
}

export const DATASET_META = {
  source: QURAN_SOURCE,
  sourceUrl: QURAN_SOURCE_URL,
  datasetVersion: QURAN_DATASET_VERSION,
  verificationDate: QURAN_VERIFICATION_DATE,
  totalAyahs: QURAN_TOTAL_AYAHS,
};
