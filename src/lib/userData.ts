/**
 * Authoritative inventory of every persistent localStorage key the app owns.
 *
 * Why this file exists:
 * "Delete all data" and "export a backup" both have to agree on one list. When
 * each module kept its own key constant, deletion silently missed everything
 * added after it was written, and backups could not restore categories the
 * exporter never knew about. This module is the single source of truth so the
 * two operations can never drift apart again.
 *
 * Bundled static content (public/quran/**, quran.json, hashes.json, page
 * images, adhan audio) is NOT listed here and is never touched: it ships with
 * the app, is not user-generated, and must survive a full reset.
 */

export type UserDataCategory =
  | "settings"
  | "history"
  | "progress"
  | "daily"
  | "bookmarks"
  | "journal"
  | "wardDay"
  | "quranProgress"
  | "audio"
  | "reader"
  | "locale"
  | "prayer"
  | "adhkar"
  | "legacy";

export type UserDataKey = {
  key: string;
  category: UserDataCategory;
};

/** Every localStorage key holding user-generated data, grouped by category. */
export const USER_DATA_KEYS: readonly UserDataKey[] = [
  // --- Ward core (storage.ts) ---
  { key: "ward:v2:settings", category: "settings" },
  { key: "ward:v2:history", category: "history" },
  { key: "ward:v2:progress", category: "progress" },
  { key: "ward:v2:daily", category: "daily" },
  { key: "ward:v2:bookmarks", category: "bookmarks" },
  { key: "ward:v2:wardday", category: "wardDay" },
  { key: "ward:v2:journal", category: "journal" },
  { key: "ward:v2:quran-progress", category: "quranProgress" },

  // --- Audio preferences + resume (lib/audio/storage.ts) ---
  { key: "wardi:audio:settings-v1", category: "audio" },
  { key: "wardi:audio:resume-v1", category: "audio" },

  // --- Mushaf reader preferences + session ---
  { key: "ward:v2:mushaf:theme", category: "reader" },
  { key: "ward:v2:mushaf:fit", category: "reader" },
  { key: "ward:v2:mushaf:session", category: "reader" },
  { key: "ward:v2:mushaf:page", category: "reader" },
  { key: "ward:v2:mushaf:quran-session", category: "reader" },
  { key: "ward:v2:mushaf:quran-page", category: "reader" },

  // --- Locale ---
  { key: "ward:v2:locale", category: "locale" },

  // --- Prayer (lib/prayerSettings.ts) ---
  { key: "ward:v2:prayer", category: "prayer" },
  { key: "ward:v2:prayer:fired", category: "prayer" },

  // --- Adhkar + niyyah (lib/adhkarStore.ts) ---
  { key: "ward:v2:adhkar-counts", category: "adhkar" },
  { key: "ward:v2:adhkar-favorites", category: "adhkar" },
  { key: "ward:v2:niyyah", category: "adhkar" },

  // --- Legacy ward keys, removed on reset so old installs cannot resurrect ---
  { key: "ward-settings", category: "legacy" },
  { key: "ward-history", category: "legacy" },
] as const;

/**
 * Caches derived from the bundled dataset. Clearing them is safe (they rebuild
 * on demand) but they are NOT user data, so they are excluded from backups and
 * are only purged on a full reset to force a clean rebuild.
 */
export const REGENERABLE_KEYS: readonly string[] = [
  "ward:v2:mushaf:glyph-box-v3", // glyph metrics for the mushaf reader
  "wardi:audio:reciters-v1", // reciter list fetched from the CDN
  "quran-v1", // parsed dataset cache
] as const;

export const USER_DATA_KEY_NAMES: readonly string[] = USER_DATA_KEYS.map((k) => k.key);

export function categoryOfKey(key: string): UserDataCategory | null {
  return USER_DATA_KEYS.find((entry) => entry.key === key)?.category ?? null;
}

/** Keys that currently hold a value, split by kind. Used by tests + reset. */
export function inventoryLocalKeys(): { userData: string[]; regenerable: string[] } {
  const userData: string[] = [];
  const regenerable: string[] = [];
  for (const { key } of USER_DATA_KEYS) {
    if (safeGet(key) !== null) userData.push(key);
  }
  for (const key of REGENERABLE_KEYS) {
    if (safeGet(key) !== null) regenerable.push(key);
  }
  return { userData, regenerable };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Raw string snapshot of every user-data key, for export. Values that fail to
 * parse are preserved verbatim so a backup never silently drops a category.
 */
export function readUserDataRaw(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of USER_DATA_KEYS) {
    const raw = safeGet(key);
    if (raw !== null) out[key] = raw;
  }
  return out;
}

/** Restore a raw snapshot produced by readUserDataRaw(). */
export function writeUserDataRaw(snapshot: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (!categoryOfKey(key)) continue; // never write unknown keys
    if (typeof value === "string") {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage is best-effort */
      }
    }
  }
}

/**
 * Remove every user-data key plus the regenerable caches.
 * Returns the keys that are still present afterwards, so callers (and tests)
 * can prove the reset actually reached a clean state.
 */
export function clearUserData(): { userData: string[]; regenerable: string[] } {
  for (const { key } of USER_DATA_KEYS) remove(key);
  for (const key of REGENERABLE_KEYS) remove(key);
  return inventoryLocalKeys();
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage is best-effort */
  }
}
