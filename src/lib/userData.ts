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

/**
 * How a value is physically stored.
 *
 * Most keys hold `JSON.stringify(...)`, which is what a backup can validate.
 * A few preferences are written as a bare string (`"ar"`, `"42"`, a reciter id)
 * because that is what their reader parses. The format is declared here so the
 * backup importer can validate the right thing for each key instead of
 * assuming JSON everywhere — an assumption that made a perfectly good export
 * unimportable as soon as someone had changed the language or opened a page.
 */
export type UserDataFormat = "json" | "string";

export type UserDataKey = {
  key: string;
  category: UserDataCategory;
  format: UserDataFormat;
};

/** Every localStorage key holding user-generated data, grouped by category. */
export const USER_DATA_KEYS: readonly UserDataKey[] = [
  // --- Ward core (storage.ts) ---
  { key: "ward:v2:settings", category: "settings", format: "json" },
  { key: "ward:v2:history", category: "history", format: "json" },
  { key: "ward:v2:progress", category: "progress", format: "json" },
  { key: "ward:v2:daily", category: "daily", format: "json" },
  { key: "ward:v2:bookmarks", category: "bookmarks", format: "json" },
  { key: "ward:v2:wardday", category: "wardDay", format: "json" },
  { key: "ward:v2:journal", category: "journal", format: "json" },
  { key: "ward:v2:quran-progress", category: "quranProgress", format: "json" },

  // --- Preferences (accent, onboarding, adhkar feedback) ---
  { key: "ward:v2:accent:v1", category: "settings", format: "json" },
  { key: "ward:v2:onboarding:v1", category: "settings", format: "json" },
  { key: "ward:v2:dhikr-feedback:v1", category: "settings", format: "json" },

  // --- Progress + daily state ---
  { key: "ward:v2:freezes:v1", category: "progress", format: "json" },
  { key: "ward:v2:after-prayer:v1", category: "daily", format: "json" },

  // --- Dedications (user-written) ---
  { key: "ward:v2:dedications:v1", category: "journal", format: "json" },

  // --- Audio preferences + resume (lib/audio/storage.ts) ---
  { key: "wardi:audio:settings-v1", category: "audio", format: "json" },
  { key: "wardi:audio:resume-v1", category: "audio", format: "json" },
  { key: "ward:v2:adhkar-reciter:v1", category: "audio", format: "string" },
  { key: "ward:v2:dhikr-voice:v1", category: "audio", format: "string" },

  // --- Mushaf reader preferences + session ---
  { key: "ward:v2:mushaf:theme", category: "reader", format: "json" },
  { key: "ward:v2:mushaf:fit", category: "reader", format: "json" },
  { key: "ward:v2:mushaf:session", category: "reader", format: "json" },
  { key: "ward:v2:mushaf:page", category: "reader", format: "string" },
  { key: "ward:v2:mushaf:quran-session", category: "reader", format: "json" },
  { key: "ward:v2:mushaf:quran-page", category: "reader", format: "string" },
  { key: "ward:v2:mushaf:skin", category: "reader", format: "string" },

  // --- Locale ---
  { key: "ward:v2:locale", category: "locale", format: "string" },

  // --- Prayer (lib/prayerSettings.ts) ---
  { key: "ward:v2:prayer", category: "prayer", format: "json" },
  { key: "ward:v2:prayer:fired", category: "prayer", format: "json" },

  // --- Adhkar + niyyah (lib/adhkarStore.ts) ---
  { key: "ward:v2:adhkar-counts", category: "adhkar", format: "json" },
  { key: "ward:v2:adhkar-favorites", category: "adhkar", format: "json" },
  { key: "ward:v2:niyyah", category: "adhkar", format: "json" },

  // --- Legacy ward keys, removed on reset so old installs cannot resurrect ---
  { key: "ward-settings", category: "legacy", format: "json" },
  { key: "ward-history", category: "legacy", format: "json" },
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

/**
 * Keys written by older builds that no shipped code reads any more.
 *
 * A device that has been upgraded across releases still carries these, so
 * "delete all data" must remove them or the reset is only partial. They are
 * deliberately NOT in `USER_DATA_KEYS`: there is no parser left to define a
 * valid shape, and backup validation needs one — registering a key whose
 * format cannot be proven is exactly how a legitimate export became
 * unimportable. A backup omits them for the same reason: restoring an obsolete
 * key would only put stale state back into a build that never reads it.
 */
export const STALE_KEYS: readonly string[] = [
  "ward:v2:reading", // pre-`progress` reading tracker
  "ward:v2:mushaf:glyph-box", // v1 glyph metrics
  "ward:v2:mushaf:glyph-box-v2", // v2 glyph metrics
] as const;

export const USER_DATA_KEY_NAMES: readonly string[] = USER_DATA_KEYS.map((k) => k.key);

export function formatOfKey(key: string): UserDataFormat | null {
  return USER_DATA_KEYS.find((entry) => entry.key === key)?.format ?? null;
}

export function categoryOfKey(key: string): UserDataCategory | null {
  return USER_DATA_KEYS.find((entry) => entry.key === key)?.category ?? null;
}

/** Keys that currently hold a value, split by kind. Used by tests + reset. */
export function inventoryLocalKeys(): {
  userData: string[];
  regenerable: string[];
  stale: string[];
} {
  const userData: string[] = [];
  const regenerable: string[] = [];
  const stale: string[] = [];
  for (const { key } of USER_DATA_KEYS) {
    if (safeGet(key) !== null) userData.push(key);
  }
  for (const key of REGENERABLE_KEYS) {
    if (safeGet(key) !== null) regenerable.push(key);
  }
  for (const key of STALE_KEYS) {
    if (safeGet(key) !== null) stale.push(key);
  }
  return { userData, regenerable, stale };
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
 * Remove every user-data key plus the regenerable caches and the stale keys
 * old installs left behind.
 * Returns the keys that are still present afterwards, so callers (and tests)
 * can prove the reset actually reached a clean state.
 */
export function clearUserData(): {
  userData: string[];
  regenerable: string[];
  stale: string[];
} {
  for (const { key } of USER_DATA_KEYS) remove(key);
  for (const key of REGENERABLE_KEYS) remove(key);
  for (const key of STALE_KEYS) remove(key);
  return inventoryLocalKeys();
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage is best-effort */
  }
}
