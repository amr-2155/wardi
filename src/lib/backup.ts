/**
 * Backup export / import with strict validation.
 *
 * The import path used to be `JSON.parse` + a tolerant sanitizer, which meant
 * ANY syntactically valid JSON "succeeded": importing `{}` reset settings to
 * defaults and emptied history while still reporting success. This module
 * separates the two phases that must never be confused:
 *
 *   1. parseBackup(text)  — pure. Parses and fully validates. NEVER writes.
 *   2. applyBackup(plan)  — the only function that mutates storage.
 *
 * Nothing is written until a payload has passed every check, so an invalid or
 * incompatible file leaves existing user data untouched. A backup is only
 * reported as applied when it genuinely was.
 */

import {
  sanitizeHistory,
  sanitizeProgress,
  sanitizeSettings,
} from "./storage";
import type { WardAppData } from "./types";
import { USER_DATA_KEY_NAMES, readUserDataRaw, writeUserDataRaw } from "./userData";

/** The ward core a backup always carries, mirroring the hook's state shape. */
export type WardAppSnapshot = WardAppData;

export const BACKUP_APP_ID = "wardi";
/** Version written by this build. */
export const BACKUP_VERSION = 3;
/** Versions this build can restore. v2 is a pre-W1 settings/history/progress export. */
export const SUPPORTED_BACKUP_VERSIONS = [2, 3] as const;

export type ImportRejectionCode =
  | "not-json"
  | "not-object"
  | "wrong-app"
  | "unsupported-version"
  | "invalid-settings"
  | "invalid-history"
  | "invalid-progress"
  | "invalid-snapshot";

/**
 * A rejection carries only a machine-readable `code`. The UI maps that code to
 * a localized message (see IMPORT_ERROR_KEYS in Settings.tsx), so there is
 * exactly one place that decides which text a failure shows -- the previous
 * second `messageKey` string was always ignored and had drifted into its own
 * parallel set of undefined translation keys.
 */
export type ImportRejection = {
  ok: false;
  code: ImportRejectionCode;
};

export type ImportPlan = {
  ok: true;
  version: number;
  exportedAt: string | null;
  /** Ward core, already sanitized. */
  settings: ReturnType<typeof sanitizeSettings>;
  history: ReturnType<typeof sanitizeHistory>;
  progress: ReturnType<typeof sanitizeProgress>;
  /**
   * Every user-data key present in the file, as raw strings, keyed by the
   * storage key. v3 carries the full snapshot; v2 carries only the ward core
   * and therefore leaves every other category untouched.
   */
  raw: Record<string, string>;
  /** Categories the file will actually write, for the confirmation summary. */
  categories: string[];
  /** Human-readable counts for the confirmation step. */
  summary: { historyEntries: number; khatmaNumber: number; exportedAt: string | null };
};

export type ImportResult = ImportPlan | ImportRejection;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A settings object must actually look like settings. Without this check an
 * empty or unrelated object still sanitizes to DEFAULT_SETTINGS, which is how
 * a bad import could quietly wipe a user's configuration.
 */
const SETTINGS_MARKERS = [
  "currentPage",
  "baseDailyPages",
  "dailyPages",
  "autoIncrease",
  "increaseAmount",
  "increaseEveryDays",
  "increaseStartDate",
  "khatmaNumber",
  "totalPages",
  "theme",
  "notificationsEnabled",
  "reminderTime",
] as const;

function settingsLookValid(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  return SETTINGS_MARKERS.some((marker) => marker in raw);
}

/** Every history entry must survive sanitizing, or the file is rejected. */
function historyLooksValid(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.every((item) => sanitizeHistory([item]).length === 1);
}

function progressLooksValid(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true; // "no progress" is valid
  return sanitizeProgress(raw) !== null;
}

/**
 * v3 carries a full raw snapshot. Unknown keys are ignored, but a KNOWN key
 * holding a non-string or unparseable value rejects the whole file — otherwise
 * a corrupt category would be silently skipped and the import would report
 * success while dropping data.
 */
function snapshotLooksValid(
  raw: unknown
): { valid: true; entries: Record<string, string> } | { valid: false } {
  if (!isPlainObject(raw)) return { valid: false };
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!USER_DATA_KEY_NAMES.includes(key)) continue;
    if (typeof value !== "string") return { valid: false };
    try {
      JSON.parse(value);
    } catch {
      return { valid: false };
    }
    entries[key] = value;
  }
  return { valid: true, entries };
}

/**
 * Parse and validate a backup file. Pure — performs no writes.
 */
export function parseBackup(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "not-json" };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, code: "not-object" };
  }

  if (parsed.app !== BACKUP_APP_ID) {
    return { ok: false, code: "wrong-app" };
  }

  const version = parsed.version;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    !(SUPPORTED_BACKUP_VERSIONS as readonly number[]).includes(version)
  ) {
    return { ok: false, code: "unsupported-version" };
  }

  if (!settingsLookValid(parsed.settings)) {
    return { ok: false, code: "invalid-settings" };
  }

  if (!historyLooksValid(parsed.history)) {
    return { ok: false, code: "invalid-history" };
  }

  if (!progressLooksValid(parsed.progress)) {
    return { ok: false, code: "invalid-progress" };
  }

  let snapshot: Record<string, string> = {};
  if (version >= 3) {
    const checked = snapshotLooksValid(parsed.data);
    if (!checked.valid) {
      return { ok: false, code: "invalid-snapshot" };
    }
    snapshot = checked.entries;
  }

  const settings = sanitizeSettings(parsed.settings);
  const history = sanitizeHistory(parsed.history);
  const progress = sanitizeProgress(parsed.progress);

  // Ward core is authoritative; it is rewritten from the sanitized values so a
  // hand-edited file cannot restore two different truths for the same category.
  const raw: Record<string, string> = { ...snapshot };
  raw["ward:v2:settings"] = JSON.stringify(settings);
  raw["ward:v2:history"] = JSON.stringify(history);
  raw["ward:v2:progress"] = JSON.stringify(progress);

  const categories = Object.keys(raw).sort();

  return {
    ok: true,
    version,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : null,
    settings,
    history,
    progress,
    raw,
    categories,
    summary: {
      historyEntries: history.length,
      khatmaNumber: settings.khatmaNumber,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : null,
    },
  };
}

/**
 * The ONLY function that writes imported data. Callers must pass a plan that
 * came from parseBackup (guarded by `ok`). Returns the keys written.
 */
export function applyBackup(plan: ImportPlan): string[] {
  writeUserDataRaw(plan.raw);
  return Object.keys(plan.raw).sort();
}

/** Build a full backup: every user-data category deletion can remove. */
export function createBackup(ward: WardAppSnapshot): string {
  const raw = readUserDataRaw();
  // Keep the ward core at the top level too, so a v3 file stays readable by an
  // older Wardi build and by a human inspecting it.
  raw["ward:v2:settings"] = JSON.stringify(ward.settings);
  raw["ward:v2:history"] = JSON.stringify(ward.history);
  raw["ward:v2:progress"] = JSON.stringify(ward.progress);

  return JSON.stringify(
    {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: ward.settings,
      history: ward.history,
      progress: ward.progress,
      data: raw,
    },
    null,
    2
  );
}
