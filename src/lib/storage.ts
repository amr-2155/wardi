import { DEFAULT_SETTINGS } from "./types";
import type {
  DayProgress,
  ManualOverride,
  Reading,
  TadabburJournalEntry,
  WardAppData,
  WardDay,
  WardSettings,
} from "./types";
import type { WardProgress } from "./quran/types";
import { clearUserData } from "./userData";

const V2_SETTINGS = "ward:v2:settings";
const V2_HISTORY = "ward:v2:history";
const V2_PROGRESS = "ward:v2:progress";
const V2_DAILY = "ward:v2:daily";
const V2_BOOKMARKS = "ward:v2:bookmarks";
const V2_WARD_DAY = "ward:v2:wardday";
const V2_JOURNAL = "ward:v2:journal";
const V2_QURAN_PROGRESS = "ward:v2:quran-progress";
const LEGACY_SETTINGS = "ward-settings";
const LEGACY_HISTORY = "ward-history";

const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isDateKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function sanitizeSettings(raw: unknown): WardSettings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;

  const totalPages = Math.max(1, Math.floor(num(r.totalPages, d.totalPages)));
  const currentPage = Math.min(totalPages, Math.max(1, Math.floor(num(r.currentPage, d.currentPage))));
  const theme = r.theme === "light" || r.theme === "dark" || r.theme === "system" ? r.theme : d.theme;
  const reminderTime = typeof r.reminderTime === "string" ? r.reminderTime : d.reminderTime;

  let manualOverride: ManualOverride | null = null;
  if (r.manualOverride && typeof r.manualOverride === "object") {
    const m = r.manualOverride as Record<string, unknown>;
    if (isDateKey(m.date)) {
      manualOverride = { date: m.date, pages: Math.max(1, Math.floor(num(m.pages, d.baseDailyPages))) };
    }
  }

  return {
    currentPage,
    baseDailyPages: Math.max(1, Math.floor(num(r.baseDailyPages, d.baseDailyPages))),
    dailyPages: Math.max(1, Math.floor(num(r.dailyPages, d.dailyPages))),
    autoIncrease: typeof r.autoIncrease === "boolean" ? r.autoIncrease : d.autoIncrease,
    increaseAmount: Math.max(0, Math.floor(num(r.increaseAmount, d.increaseAmount))),
    increaseEveryDays: Math.max(1, Math.floor(num(r.increaseEveryDays, d.increaseEveryDays))),
    increaseStartDate: isDateKey(r.increaseStartDate) ? r.increaseStartDate : d.increaseStartDate,
    khatmaIncreaseEnabled:
      typeof r.khatmaIncreaseEnabled === "boolean" ? r.khatmaIncreaseEnabled : d.khatmaIncreaseEnabled,
    khatmaIncreaseAmount: Math.max(0, Math.floor(num(r.khatmaIncreaseAmount, d.khatmaIncreaseAmount))),
    khatmaNumber: Math.max(1, Math.floor(num(r.khatmaNumber, d.khatmaNumber))),
    totalPages,
    theme,
    notificationsEnabled:
      typeof r.notificationsEnabled === "boolean" ? r.notificationsEnabled : d.notificationsEnabled,
    reminderTime,
    manualOverride,
  };
}

function migrateLegacySettings(raw: unknown): WardSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const legacyWard = num(r.baseWard, 0);
  const legacyDaily = num(r.dailyPages, 0);
  const baseDailyPages = legacyWard > 0 ? legacyWard : legacyDaily > 0 ? legacyDaily : 0;
  if (baseDailyPages <= 0) return null;

  const mapped: WardSettings = {
    ...DEFAULT_SETTINGS,
    currentPage: Math.max(1, Math.floor(num(r.currentPage, DEFAULT_SETTINGS.currentPage))),
    baseDailyPages,
    dailyPages: legacyDaily > 0 ? legacyDaily : baseDailyPages,
    autoIncrease: typeof r.autoIncrease === "boolean" ? r.autoIncrease : DEFAULT_SETTINGS.autoIncrease,
    increaseAmount: Math.max(0, Math.floor(num(r.increaseAmount, DEFAULT_SETTINGS.increaseAmount))),
    increaseEveryDays: Math.max(
      1,
      Math.floor(num(r.increaseEveryDays, DEFAULT_SETTINGS.increaseEveryDays))
    ),
    increaseStartDate: isDateKey(r.increaseStartDate)
      ? r.increaseStartDate
      : DEFAULT_SETTINGS.increaseStartDate,
    khatmaNumber: Math.max(1, Math.floor(num(r.khatmaNumber, DEFAULT_SETTINGS.khatmaNumber))),
    totalPages: Math.max(1, Math.floor(num(r.totalPages, DEFAULT_SETTINGS.totalPages))),
  };
  return sanitizeSettings(mapped);
}

export function sanitizeReading(raw: unknown): Reading | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !isDateKey(r.date)) return null;
  const rawPages = Math.floor(num(r.pages, 1));
  const completed = typeof r.completed === "boolean" ? r.completed : true;
  const pages = completed ? Math.max(1, rawPages) : Math.max(0, rawPages);
  return {
    id: r.id,
    date: r.date,
    khatma: Math.max(1, Math.floor(num(r.khatma, 1))),
    startPage: Math.max(1, Math.floor(num(r.startPage, 1))),
    endPage: Math.max(
      1,
      Math.floor(num(r.endPage, typeof r.startPage === "number" ? r.startPage : 1))
    ),
    pages,
    completed,
    mode: r.mode === "manual" ? "manual" : "auto",
  };
}

export function sanitizeHistory(raw: unknown): Reading[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeReading).filter((item): item is Reading => item !== null);
}

export function sanitizeProgress(raw: unknown): DayProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isDateKey(r.date)) return null;
  return { date: r.date, pages: Math.max(0, Math.floor(num(r.pages, 0))) };
}

export function loadData(): WardAppData {
  const fallback: WardAppData = {
    settings: { ...DEFAULT_SETTINGS },
    history: [],
    progress: null,
  };

  try {
    const settingsRaw = localStorage.getItem(V2_SETTINGS);
    if (settingsRaw) {
      return {
        settings: sanitizeSettings(JSON.parse(settingsRaw)),
        history: sanitizeHistory(JSON.parse(localStorage.getItem(V2_HISTORY) ?? "[]")),
        progress: sanitizeProgress(JSON.parse(localStorage.getItem(V2_PROGRESS) ?? "null")),
      };
    }
  } catch {
    return fallback;
  }

  try {
    const legacySettings = localStorage.getItem(LEGACY_SETTINGS);
    if (legacySettings) {
      const settings = migrateLegacySettings(JSON.parse(legacySettings));
      if (settings) {
        return {
          settings,
          history: sanitizeHistory(JSON.parse(localStorage.getItem(LEGACY_HISTORY) ?? "[]")),
          progress: null,
        };
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function saveData(data: WardAppData): boolean {
  try {
    localStorage.setItem(V2_SETTINGS, JSON.stringify(data.settings));
    localStorage.setItem(V2_HISTORY, JSON.stringify(data.history));
    localStorage.setItem(V2_PROGRESS, JSON.stringify(data.progress));
    return true;
  } catch {
    // Quota exceeded, private-mode storage, or a disabled localStorage. The
    // caller surfaces this as a failed save; there is nothing to recover here.
    return false;
  }
}

export function toExportJSON(data: WardAppData): string {
  return JSON.stringify(
    { app: "wardi", version: 2, exportedAt: new Date().toISOString(), ...data },
    null,
    2
  );
}


export function clearAllData(): { userData: string[]; regenerable: string[] } {
  return clearUserData();
}
const isAyahRef = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,3}:\d{1,3}$/.test(value);

export type DailyState = {
  ref: string;
  date: string;
  recent: string[];
};

export function sanitizeDaily(raw: unknown): DailyState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isAyahRef(r.ref) || !isDateKey(r.date)) return null;
  return {
    ref: r.ref,
    date: r.date,
    recent: Array.isArray(r.recent) ? r.recent.filter(isAyahRef) : [],
  };
}

export function loadDaily(): DailyState | null {
  try {
    return sanitizeDaily(JSON.parse(localStorage.getItem(V2_DAILY) ?? "null"));
  } catch {
    return null;
  }
}

export function saveDaily(state: DailyState): void {
  localStorage.setItem(V2_DAILY, JSON.stringify(state));
}

export function loadBookmarks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(V2_BOOKMARKS) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isAyahRef) : [];
  } catch {
    return [];
  }
}

export function saveBookmarks(refs: string[]): void {
  localStorage.setItem(V2_BOOKMARKS, JSON.stringify(refs));
}

export function sanitizeWardDay(raw: unknown): WardDay | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isDateKey(r.date) || !isAyahRef(r.ayahId)) return null;
  return {
    date: r.date,
    ayahId: r.ayahId,
    read: typeof r.read === "boolean" ? r.read : false,
    tadabburDone: typeof r.tadabburDone === "boolean" ? r.tadabburDone : false,
    deferred: typeof r.deferred === "boolean" ? r.deferred : false,
  };
}

export function loadWardDay(): WardDay | null {
  try {
    return sanitizeWardDay(JSON.parse(localStorage.getItem(V2_WARD_DAY) ?? "null"));
  } catch {
    return null;
  }
}

export function saveWardDay(state: WardDay): void {
  localStorage.setItem(V2_WARD_DAY, JSON.stringify(state));
}

function sanitizeJournalEntry(raw: unknown): TadabburJournalEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ref !== "string" || !isDateKey(r.date)) return null;
  return {
    ref: r.ref,
    date: r.date,
    completedAt: typeof r.completedAt === "string" ? r.completedAt : r.date,
    appliedStep: r.appliedStep === true,
    personalNote: typeof r.personalNote === "string" ? r.personalNote : "",
  };
}

export function loadTadabburJournal(): TadabburJournalEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(V2_JOURNAL) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeJournalEntry).filter((e): e is TadabburJournalEntry => e !== null);
  } catch {
    return [];
  }
}

export function saveTadabburJournal(entries: TadabburJournalEntry[]): void {
  try {
    localStorage.setItem(V2_JOURNAL, JSON.stringify(entries.slice(-100)));
  } catch {
    /* storage is best-effort */
  }
}

function sanitizeQuranProgress(raw: unknown): WardProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isDateKey(r.date) || typeof r.position !== "string" || typeof r.wardStart !== "string") {
    return null;
  }
  // Trust the engine shape; a corrupt entry rebuilds from scratch instead.
  return r as WardProgress;
}

export function loadQuranProgress(): WardProgress | null {
  try {
    return sanitizeQuranProgress(JSON.parse(localStorage.getItem(V2_QURAN_PROGRESS) ?? "null"));
  } catch {
    return null;
  }
}

export function saveQuranProgress(state: WardProgress): void {
  try {
    localStorage.setItem(V2_QURAN_PROGRESS, JSON.stringify(state));
  } catch {
    /* storage is best-effort */
  }
}
