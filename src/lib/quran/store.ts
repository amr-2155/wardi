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
/* Secondary payloads are cached beside the dataset. They are far smaller than
   quran.json but were re-fetched on every single cold start, because the
   offline story was considered satisfied by the dataset cache alone. In a
   Capacitor app these resolve off the local bundle, so re-reading them each
   launch is pure start-up cost. Keyed by dataset version so a data update
   invalidates them. */
const HASHES_CACHE_KEY = `quran-hashes-${QURAN_DATASET_VERSION}`;
const AYAH_META_CACHE_KEY = `quran-ayah-meta-${QURAN_DATASET_VERSION}`;

/**
 * The dataset is ~1.5MB, so this is deliberately generous: the goal is to bound
 * a DEAD connection, not to be impatient with a slow but live one.
 *
 * Without a bound here, a request that hangs (captive portal, half-open socket,
 * a proxy that accepts the connection and never answers) leaves the coordinated
 * reload in-flight forever, and no reconnect, focus or visibility event can
 * recover it -- the user is pinned on the failure notice exactly as before the
 * reload feature existed.
 */
const DATASET_FETCH_TIMEOUT_MS = 30_000;

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

/**
 * One AbortController and one timer around the WHOLE request, body included.
 *
 * `resilientFetch` is deliberately NOT reused here, for three concrete reasons:
 *  - its timer is cleared in `finally` as soon as the response headers arrive,
 *    so a body that stalls mid-download stays UNBOUNDED -- which is the most
 *    common real hang and the exact case this has to catch;
 *  - it fails fast when `navigator.onLine` is false, but this is a Capacitor
 *    app served from its local bundle, where `/quran/quran.json` resolves with
 *    no internet at all. Short-circuiting would break offline-first loading;
 *  - its retries would change the request count, and forcing `retries: 0` would
 *    strip out most of what is left of it.
 *
 * The timeout and the fetch implementation are injectable so the abort path is
 * testable without real timers or a network, matching how resilient-fetch is
 * tested.
 */
export async function fetchQuranDatasetText(
  timeoutMs: number = DATASET_FETCH_TIMEOUT_MS,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn("/quran/quran.json", { signal: controller.signal });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
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
    const text = await fetchQuranDatasetText();
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
  const cached = await idbGet<unknown>(HASHES_CACHE_KEY);
  if (Array.isArray(cached)) return cached as string[];
  try {
    const res = await fetch("/quran/hashes.json");
    if (!res.ok) return [];
    const parsed = (await res.json()) as unknown;
    /* Validate before use and before caching. The old cast trusted whatever
       came back, so a malformed payload became a silently wrong `string[]` that
       was then trusted by every per-ayah hash check. */
    if (!Array.isArray(parsed)) return [];
    await idbSet(HASHES_CACHE_KEY, parsed);
    return parsed as string[];
  } catch {
    return [];
  }
}

/**
 * Shape-check the printed-mushaf metadata.
 *
 * Applied to the cached copy as well as the freshly fetched one, so a cache
 * entry written by an older build can never slip past validation.
 */
function parseAyahMeta(raw: unknown): AyahMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Partial<AyahMeta> & { totalAyahs?: number };
  const total = obj.totalAyahs ?? QURAN_TOTAL_AYAHS;
  if (
    typeof obj.pages !== "number" ||
    obj.pages < 1 ||
    !Array.isArray(obj.pageByAyah) ||
    !Array.isArray(obj.juzByAyah) ||
    !Array.isArray(obj.quarterByAyah) ||
    obj.pageByAyah.length !== total ||
    obj.juzByAyah.length !== total ||
    obj.quarterByAyah.length !== total
  ) {
    return null;
  }
  return {
    pages: obj.pages,
    pageByAyah: obj.pageByAyah,
    juzByAyah: obj.juzByAyah,
    quarterByAyah: obj.quarterByAyah,
  };
}

/**
 * Printed-mushaf pagination metadata (page/juz/quarter per ayah).
 * Cached in IndexedDB alongside the dataset; see AYAH_META_CACHE_KEY.
 */
export async function loadAyahMeta(): Promise<AyahMeta | null> {
  const cached = await idbGet<unknown>(AYAH_META_CACHE_KEY);
  if (cached !== null) {
    const parsed = parseAyahMeta(cached);
    /* A cache entry that no longer validates is discarded and refetched rather
       than trusted. */
    if (parsed) return parsed;
  }
  try {
    const res = await fetch("/quran/ayah-meta.json");
    if (!res.ok) return null;
    const parsed = parseAyahMeta((await res.json()) as unknown);
    if (!parsed) return null;
    await idbSet(AYAH_META_CACHE_KEY, parsed);
    return parsed;
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
