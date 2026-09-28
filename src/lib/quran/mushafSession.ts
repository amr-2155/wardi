/**
 * Persistent Mushaf reading session context.
 *
 * The reader keeps one session object so that — even after the app is killed —
 * it can restore the exact reading state: last page, ward range snapshot,
 * completion time, and the source context the user came from
 * (standalone today; project / timer / tasbeeh in the future). The reader
 * itself never switches the app's mode; it only *records* the source.
 */

export type MushafSource = "standalone" | "project" | "timer" | "tasbeeh";

export type MushafSession = {
  version: 1;
  /** Where the reader was opened from — the reader never changes it. */
  source: MushafSource;
  projectId: string | null;
  projectName: string | null;
  wirdId: string | null;
  /** Ward range snapshot when the session started. */
  startPage: number;
  endPage: number;
  totalPages: number;
  /** Last page the user paused on (resume point). */
  lastReadPage: number;
  /** Pages completed today within this ward (counters). */
  completedPages: number;
  /** Highest printed page reached inside the ward range (monotonic). */
  highestPageReached: number;
  /** Auto-scroll reader enabled for this session (persisted). */
  autoScrollEnabled: boolean;
  /** Auto-scroll reading speed multiplier (0.5..2). */
  scrollSpeed: number;
  /** When true the ward range was fully read (100%). */
  completed: boolean;
  /** Last write timestamp (auto-scroll / progress sync). */
  updatedAt: string;
  sessionStartTime: string;
  sessionEndTime: string | null;
  /** When true (after "قراءة مرة أخرى") the reader re-opens from startPage. */
  readAgain: boolean;
  /** When true the resume card was dismissed for this session. */
  resumeDismissed: boolean;
  /** In-app brightness level (0.6..1) for reading mode. */
  brightness: number;
  /** Last bookmarked page (null = none yet). */
  bookmark: number | null;
  /** Bookmark list, most-recent-first (max 20). */
  bookmarks: number[];
};

export const MUSHAF_SESSION_KEY = "ward:v2:mushaf:session";
export const MUSHAF_LAST_PAGE_KEY = "ward:v2:mushaf:page"; // legacy, kept for continuity

/** Separate Quran-mode (full mushaf) session — independent from ward session. */
export const MUSHAF_QURAN_SESSION_KEY = "ward:v2:mushaf:quran-session";
export const MUSHAF_QURAN_LAST_PAGE_KEY = "ward:v2:mushaf:quran-page";

function clampBri(v: number): number {
  return Math.max(0.6, Math.min(1, Number.isFinite(v) ? v : 1));
}

function clampValue(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Sanitize a stored bookmark list (integers 1..604, max 20). */
export function sanitizeBookmarks(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 604,
    )
    .slice(0, 20);
}

export function defaultSession(partial?: Partial<MushafSession>): MushafSession {
  const now = new Date().toISOString();
  const base: MushafSession = {
    version: 1,
    source: "standalone",
    projectId: null,
    projectName: null,
    wirdId: null,
    startPage: 1,
    endPage: 1,
    totalPages: 1,
    lastReadPage: 1,
    completedPages: 0,
    highestPageReached: 1,
    autoScrollEnabled: false,
    scrollSpeed: 0.15,
    completed: false,
    updatedAt: now,
    sessionStartTime: now,
    sessionEndTime: null,
    readAgain: false,
    resumeDismissed: false,
    brightness: 1,
    bookmark: null,
    bookmarks: [],
  };
  if (partial) {
    const p = { ...partial } as Partial<MushafSession>;
    if (p.brightness !== undefined) p.brightness = clampBri(p.brightness);
    Object.assign(base, p);
  }
  return base;
}

export function loadSession(): MushafSession | null {
  try {
    const raw = localStorage.getItem(MUSHAF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MushafSession;
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.sessionStartTime || !Number.isFinite(parsed.startPage)) return null;
    parsed.brightness = clampBri(parsed.brightness ?? 1);
    parsed.bookmark = Number.isInteger(parsed.bookmark) ? (parsed.bookmark as number) : null;
    parsed.bookmarks = sanitizeBookmarks(parsed.bookmarks);
    parsed.lastReadPage = Number.isInteger(parsed.lastReadPage)
      ? (parsed.lastReadPage as number)
      : parsed.startPage;
    parsed.highestPageReached = Number.isFinite(parsed.highestPageReached)
      ? (parsed.highestPageReached as number)
      : parsed.lastReadPage;
    parsed.autoScrollEnabled = Boolean(parsed.autoScrollEnabled);
    parsed.scrollSpeed = clampValue(Number.isFinite(parsed.scrollSpeed) ? (parsed.scrollSpeed as number) : 0.15, 0.1, 1);
    parsed.completed = Boolean(parsed.completed);
    parsed.updatedAt = parsed.updatedAt || parsed.sessionStartTime;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: MushafSession): void {
  try {
    localStorage.setItem(MUSHAF_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(MUSHAF_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadLastPage(): number {
  try {
    const v = Number.parseInt(localStorage.getItem(MUSHAF_LAST_PAGE_KEY) ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveLastPage(page: number): void {
  try {
    localStorage.setItem(MUSHAF_LAST_PAGE_KEY, String(page));
  } catch {
    // ignore
  }
}

/* ── Quran-mode (full mushaf) independent session ────────────── */

export function loadQuranSession(): MushafSession | null {
  try {
    const raw = localStorage.getItem(MUSHAF_QURAN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MushafSession;
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.sessionStartTime || !Number.isFinite(parsed.startPage)) return null;
    parsed.brightness = clampBri(parsed.brightness ?? 1);
    parsed.bookmark = Number.isInteger(parsed.bookmark) ? (parsed.bookmark as number) : null;
    parsed.bookmarks = sanitizeBookmarks(parsed.bookmarks);
    parsed.lastReadPage = Number.isInteger(parsed.lastReadPage)
      ? (parsed.lastReadPage as number)
      : parsed.startPage;
    parsed.highestPageReached = Number.isFinite(parsed.highestPageReached)
      ? (parsed.highestPageReached as number)
      : parsed.lastReadPage;
    parsed.autoScrollEnabled = Boolean(parsed.autoScrollEnabled);
    parsed.scrollSpeed = clampValue(Number.isFinite(parsed.scrollSpeed) ? (parsed.scrollSpeed as number) : 0.15, 0.1, 1);
    parsed.completed = Boolean(parsed.completed);
    parsed.updatedAt = parsed.updatedAt || parsed.sessionStartTime;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuranSession(session: MushafSession): void {
  try {
    localStorage.setItem(MUSHAF_QURAN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearQuranSession(): void {
  try {
    localStorage.removeItem(MUSHAF_QURAN_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadQuranLastPage(): number {
  try {
    const v = Number.parseInt(localStorage.getItem(MUSHAF_QURAN_LAST_PAGE_KEY) ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveQuranLastPage(page: number): void {
  try {
    localStorage.setItem(MUSHAF_QURAN_LAST_PAGE_KEY, String(page));
  } catch {
    // ignore
  }
}