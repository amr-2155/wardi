/**
 * Bounded, automatic cache for streamed recitation audio.
 *
 * The reciter streams per-verse files from the quran.com CDN. This module
 * wraps that URL: a played verse is stored in a Cache API bucket (LRU,
 * capped), and a cached verse replays offline from a blob URL. The cap keeps
 * storage bounded; Settings shows the size and offers a clear action.
 *
 * Failure honesty: when the network fails and the verse is NOT cached, the
 * original URL is returned so the element fails exactly as before and the
 * provider's fail-stop error path reports it. The cache never swallows an
 * error into silence.
 */

const CACHE_NAME = "wardi-audio-v1";
const INDEX_KEY = "wardi:audio:cache-index-v1";
/** ~120 short verses ≈ 15-25 MB worst case. */
const MAX_ENTRIES = 120;

type CacheIndexEntry = { ts: number; size: number };
type CacheIndex = Record<string, CacheIndexEntry>;

/* A handful of live object URLs: enough for the current track plus the ones
   an in-flight retry might still hold, revoked as they roll off. */
const liveObjectUrls: string[] = [];

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.caches !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

function readIndex(): CacheIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as CacheIndex;
  } catch {
    return {};
  }
}

function writeIndex(idx: CacheIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* storage full or blocked: caching just degrades to network */
  }
}

function trackObjectUrl(objectUrl: string): void {
  liveObjectUrls.push(objectUrl);
  while (liveObjectUrls.length > 4) {
    const old = liveObjectUrls.shift();
    if (old) URL.revokeObjectURL(old);
  }
}

async function evict(cache: Cache, idx: CacheIndex): Promise<void> {
  const urls = Object.keys(idx);
  if (urls.length <= MAX_ENTRIES) return;
  const byAge = urls.sort((a, b) => (idx[a]?.ts ?? 0) - (idx[b]?.ts ?? 0));
  for (const old of byAge.slice(0, urls.length - MAX_ENTRIES)) {
    try {
      await cache.delete(old);
    } catch {
      /* best effort */
    }
    delete idx[old];
  }
}

/**
 * Returns a playable URL for `url`: a blob from the cache when present, the
 * fetched-and-stored blob on first play, or the original URL when caching is
 * impossible (the honest fallback).
 */
export async function resolveAudioSrc(url: string): Promise<string> {
  if (!supported() || !/^https:\/\//.test(url)) return url;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const blob = await hit.blob();
      const idx = readIndex();
      idx[url] = { ts: Date.now(), size: idx[url]?.size ?? blob.size };
      writeIndex(idx);
      const objectUrl = URL.createObjectURL(blob);
      trackObjectUrl(objectUrl);
      return objectUrl;
    }
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    await cache.put(
      url,
      new Response(blob, {
        headers: { "content-type": res.headers.get("content-type") ?? "audio/mpeg" },
      })
    );
    const idx = readIndex();
    idx[url] = { ts: Date.now(), size: blob.size };
    await evict(cache, idx);
    writeIndex(idx);
    const objectUrl = URL.createObjectURL(blob);
    trackObjectUrl(objectUrl);
    return objectUrl;
  } catch {
    return url;
  }
}

/** Removes every cached verse and the index. */
export async function clearAudioCache(): Promise<void> {
  if (supported()) {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      /* best effort */
    }
  }
  try {
    localStorage.removeItem(INDEX_KEY);
  } catch {
    /* ignore */
  }
}

/** What Settings shows: how many verses and roughly how much storage. */
export function audioCacheStats(): { count: number; bytes: number } {
  const idx = readIndex();
  let bytes = 0;
  let count = 0;
  for (const url of Object.keys(idx)) {
    count += 1;
    bytes += idx[url]?.size ?? 0;
  }
  return { count, bytes };
}
