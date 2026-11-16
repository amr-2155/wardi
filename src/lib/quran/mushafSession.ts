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
  /** Pages completed today within this ward (derived from `recordedPages`). */
  completedPages: number;
  /**
   * The exact pages in this ward the reader has confirmed as finished.
   *
   * This — not the current page and not `highestPageReached` — is the single
   * source of truth for ward progress and completion: progress is
   * `recordedPages.length` and the ward is complete only when every page in
   * the range is in the set. It is idempotent, so re-opening a page or walking
   * back and forth can never count it twice.
   */
  recordedPages: number[];
  /** Highest printed page reached inside the ward range (resume marker only). */
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

/* ── Ward progress: one source of truth ───────────────────────────
   The old model inferred progress from the page the reader happened to be on
   (`highestPageReached`) and declared the ward complete when the current page
   met the range end. That conflated "navigated to" with "read", so opening the
   last page — or inheriting a stale session — completed a ward the user had
   not read. Progress is now the set of pages explicitly recorded as finished;
   completion is derived from that set and nothing else. */

export type WardBounds = { start: number; end: number; total: number };

/** Inclusive ward bounds, tolerating an inverted or missing range. */
export function wardBounds(s: { startPage: number; endPage: number }): WardBounds {
  const a = Number.isFinite(s.startPage) ? Math.floor(s.startPage) : 1;
  const b = Number.isFinite(s.endPage) ? Math.floor(s.endPage) : a;
  const start = Math.max(1, Math.min(a, b));
  const end = Math.max(start, Math.max(a, b));
  return { start, end, total: end - start + 1 };
}

/** Pages inside [start, end], unique and ascending. Anything else is dropped. */
export function sanitizeRecordedPages(v: unknown, start: number, end: number): number[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  for (const raw of v) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isInteger(n) && n >= start && n <= end) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Reconstruct the confirmed set for a session written before `recordedPages`
    existed: a completed ward means every page, otherwise every page up to the
    highest one reached (the old monotonic counter). Never shrinks user data. */
export function legacyRecordedPages(s: {
  startPage: number;
  endPage: number;
  highestPageReached?: number;
  completed?: boolean;
}): number[] {
  const { start, end } = wardBounds(s);
  const out: number[] = [];
  const high =
    s.completed || !Number.isFinite(s.highestPageReached)
      ? end
      : Math.min(end, Math.max(start, Math.floor(s.highestPageReached as number)));
  for (let p = start; p <= high; p += 1) out.push(p);
  return out;
}

type WardProgressSource = {
  startPage: number;
  endPage: number;
  recordedPages?: number[];
  highestPageReached?: number;
  completed?: boolean;
};

/** Confirmed pages for a session, migrated from the legacy counters once. */
export function recordedPagesOf(s: WardProgressSource): number[] {
  const { start, end } = wardBounds(s);
  if (Array.isArray(s.recordedPages)) {
    return sanitizeRecordedPages(s.recordedPages, start, end);
  }
  return legacyRecordedPages(s);
}

/** How many required pages are confirmed (0..total). */
export function wardReachedCount(s: WardProgressSource): number {
  return recordedPagesOf(s).length;
}

/** True only when EVERY page in the ward range is confirmed. */
export function wardIsComplete(s: WardProgressSource): boolean {
  const { total } = wardBounds(s);
  return total > 0 && wardReachedCount(s) >= total;
}

export type WardRecordResult = {
  recordedPages: number[];
  added: number;
  reached: number;
  total: number;
  complete: boolean;
};

/** Idempotently confirm `page` as read. Out-of-range pages are ignored. */
export function recordWardPage(s: WardProgressSource, page: number): WardRecordResult {
  const { start, end, total } = wardBounds(s);
  const before = recordedPagesOf(s);
  const p = Number.isFinite(page) ? Math.floor(page) : -1;
  const recordedPages =
    p >= start && p <= end && !before.includes(p)
      ? [...before, p].sort((a, b) => a - b)
      : before;
  return {
    recordedPages,
    added: recordedPages.length - before.length,
    reached: recordedPages.length,
    total,
    complete: total > 0 && recordedPages.length >= total,
  };
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
    recordedPages: [],
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
    /* A caller that only knows the legacy `completed` flag (or nothing at all)
       still gets a coherent recorded set: a completed session owns its whole
       range, a fresh one starts empty. `recordedPages` is authoritative when
       supplied. */
    if (!Array.isArray(p.recordedPages)) {
      p.recordedPages = p.completed ? legacyRecordedPages(p as MushafSession) : [];
    }
    Object.assign(base, p);
  }
  /* Derive the counters from the recorded set so a stored `completed` flag can
     never disagree with the pages that were actually confirmed. */
  const bounds = wardBounds(base);
  base.recordedPages = sanitizeRecordedPages(base.recordedPages, bounds.start, bounds.end);
  base.completedPages = base.recordedPages.length;
  base.completed = bounds.total > 0 && base.recordedPages.length >= bounds.total;
  return base;
}

/** Repair a stored session in one place: defaults, the legacy progress
    migration, and counters that are always derived from `recordedPages`. */
function normalizeStoredSession(parsed: MushafSession): MushafSession {
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
  parsed.scrollSpeed = clampValue(
    Number.isFinite(parsed.scrollSpeed) ? (parsed.scrollSpeed as number) : 0.15,
    0.1,
    1,
  );
  parsed.recordedPages = recordedPagesOf(parsed);
  parsed.completedPages = parsed.recordedPages.length;
  const bounds = wardBounds(parsed);
  parsed.completed = bounds.total > 0 && parsed.recordedPages.length >= bounds.total;
  parsed.updatedAt = parsed.updatedAt || parsed.sessionStartTime;
  return parsed;
}

export function loadSession(): MushafSession | null {
  try {
    const raw = localStorage.getItem(MUSHAF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MushafSession;
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.sessionStartTime || !Number.isFinite(parsed.startPage)) return null;
    return normalizeStoredSession(parsed);
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
    return normalizeStoredSession(parsed);
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