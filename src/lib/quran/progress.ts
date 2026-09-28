import { addDays } from "../dates";
import type { AyahRef, CandidatePriority, QuranDataset, WardProgress } from "./types";
import { getGlobalId, parseAyahRef } from "./validate";

export const DEFAULT_TOTAL_PAGES = 604;
export const MAX_TADABBUR_HISTORY = 32;
export const MAX_BACKLOG_SCAN_DAYS = 366;

export type TadabburCandidate = {
  ref: AyahRef;
  priority: CandidatePriority;
};

export type ProgressStats = {
  read: number;
  remaining: number;
  quota: number;
  percent: number;
  complete: boolean;
};

export function globalIdOf(dataset: QuranDataset, ref: string): number | null {
  const parsed = parseAyahRef(ref);
  if (!parsed) return null;
  return getGlobalId(parsed.surah, parsed.ayah, dataset.chapters);
}

export function refFromGlobalId(dataset: QuranDataset, id: number): AyahRef | null {
  const total = dataset.manifest.totalAyahs;
  if (!Number.isInteger(id) || id < 1 || id > total) return null;
  let cursor = 0;
  for (const chapter of dataset.chapters) {
    if (id <= cursor + chapter.ayahCount) {
      return `${chapter.id}:${id - cursor}` as AyahRef;
    }
    cursor += chapter.ayahCount;
  }
  return null;
}

/**
 * Page -> ayah conversion. This is the SINGLE conversion used everywhere so the
 * numbers can never contradict each other. It is an estimate (avg ayahs/page),
 * not the printed mushaf page boundaries.
 */
export function ayahsPerPage(dataset: QuranDataset, totalPages = DEFAULT_TOTAL_PAGES): number {
  return dataset.manifest.totalAyahs / Math.max(1, totalPages);
}

export function ayahQuotaForPages(
  dataset: QuranDataset,
  pages: number,
  totalPages = DEFAULT_TOTAL_PAGES
): number {
  const total = dataset.manifest.totalAyahs;
  const quota = Math.round((Math.max(1, Math.floor(pages)) * total) / Math.max(1, totalPages));
  return Math.max(1, Math.min(total, quota));
}

/**
 * Choose the next tadabbur ayah:
 * 1. nearest curated ref strictly ahead of position AND within the ward range,
 *    skipping anything recently used.
 * 2. otherwise the first curated ref after the ward end (start of the next part),
 *    still skipping recent refs.
 * 3. otherwise repeat the nearest in-ward ref (only after everything ahead is exhausted).
 */
export function pickTadabburCandidate(
  dataset: QuranDataset,
  pool: string[],
  positionRef: string,
  wardEndRef: string,
  history: string[] = []
): TadabburCandidate | null {
  const posId = globalIdOf(dataset, positionRef);
  const endId = globalIdOf(dataset, wardEndRef);
  if (posId === null || endId === null) return null;

  const scored = pool
    .map((ref) => ({ ref, id: globalIdOf(dataset, ref) }))
    .filter((c): c is { ref: string; id: number } => c.id !== null)
    .sort((a, b) => a.id - b.id);

  const inWard = scored.filter((c) => c.id > posId && c.id <= endId);
  const freshInWard = inWard.filter((c) => !history.includes(c.ref));
  if (freshInWard.length > 0) {
    return { ref: freshInWard[0].ref as AyahRef, priority: "in-ward" };
  }

  const beyond = scored.filter((c) => c.id > endId);
  const freshBeyond = beyond.filter((c) => !history.includes(c.ref));
  if (freshBeyond.length > 0) return { ref: freshBeyond[0].ref as AyahRef, priority: "next" };

  if (inWard.length > 0) return { ref: inWard[0].ref as AyahRef, priority: "in-ward" };
  return null;
}

function pushHistory(history: AyahRef[], ref: AyahRef): AyahRef[] {
  return [ref, ...history.filter((r) => r !== ref)].slice(0, MAX_TADABBUR_HISTORY);
}

/**
 * Build (or roll over) today's ward. Returns the SAME reference when nothing
 * changed, so callers can bail out of React state updates safely.
 */
export function buildWardProgress(params: {
  prev: WardProgress | null;
  date: string;
  dailyPages: number;
  totalPages: number;
  dataset: QuranDataset;
  pool: string[];
}): WardProgress {
  const { prev, date, dailyPages, totalPages, dataset, pool } = params;
  const total = dataset.manifest.totalAyahs;
  const pages = Math.max(1, Math.floor(dailyPages));
  const tp = Math.max(1, Math.floor(totalPages));

  if (prev && prev.date === date) {
    if (prev.quotaPages === pages && prev.totalPages === tp) {
      if (prev.tadabburAyah) return prev;
      const candidate = pickTadabburCandidate(dataset, pool, prev.position, prev.wardEnd, prev.tadabburHistory);
      if (!candidate) return prev;
      return { ...prev, tadabburAyah: candidate.ref, candidatePriority: candidate.priority };
    }
    return resizeTodayWard({ state: prev, dailyPages: pages, totalPages: tp, dataset, pool });
  }

  const startId = prev && prev.position ? (globalIdOf(dataset, prev.position) ?? 1) : 1;
  const quota = ayahQuotaForPages(dataset, pages, tp);
  const endId = Math.min(total, startId + quota - 1);
  const startRef = refFromGlobalId(dataset, startId) ?? "1:1";
  const endRef = refFromGlobalId(dataset, endId) ?? startRef;
  const history: AyahRef[] = prev ? prev.tadabburHistory : [];
  const candidate = pickTadabburCandidate(dataset, pool, startRef, endRef, history);

  return {
    date,
    position: startRef,
    wardStart: startRef,
    wardEnd: endRef,
    quotaPages: pages,
    quotaAyahs: endId - startId + 1,
    totalPages: tp,
    ayahsPerPage: ayahsPerPage(dataset, tp),
    tadabburAyah: candidate?.ref ?? null,
    candidatePriority: candidate?.priority ?? "next",
    tadabburHistory: history,
    done: false,
  };
}

/**
 * Same-day ward resizing (e.g. manual override). The end never goes before the
 * last read ayah, so read/remaining stay non-negative.
 */
export function resizeTodayWard(params: {
  state: WardProgress;
  dailyPages: number;
  totalPages: number;
  dataset: QuranDataset;
  pool: string[];
}): WardProgress {
  const { state, dailyPages, totalPages, dataset, pool } = params;
  const startId = globalIdOf(dataset, state.wardStart);
  if (startId === null) return state;
  const total = dataset.manifest.totalAyahs;
  const posId = globalIdOf(dataset, state.position) ?? startId;
  const quota = ayahQuotaForPages(dataset, dailyPages, totalPages);

  let endId = Math.min(total, startId + quota - 1);
  if (endId < posId - 1) endId = Math.max(startId, posId - 1);
  const endRef = refFromGlobalId(dataset, endId) ?? state.wardEnd;
  const candidate = pickTadabburCandidate(dataset, pool, state.position, endRef, state.tadabburHistory);

  return {
    ...state,
    wardEnd: endRef,
    quotaPages: Math.max(1, Math.floor(dailyPages)),
    quotaAyahs: endId - startId + 1,
    totalPages: Math.max(1, Math.floor(totalPages)),
    ayahsPerPage: ayahsPerPage(dataset, Math.max(1, Math.floor(totalPages))),
    tadabburAyah: candidate?.ref ?? null,
    candidatePriority: candidate?.priority ?? "next",
  };
}
/**
 * Mark everything up to readUpTo (inclusive) as read and auto-advance the
 * tadabbur candidate to the next suitable unread ayah.
 */
export function advancePosition(params: {
  state: WardProgress;
  readUpTo: string;
  dataset: QuranDataset;
  pool: string[];
}): WardProgress {
  const { state, readUpTo, dataset, pool } = params;
  const readId = globalIdOf(dataset, readUpTo);
  if (readId === null) return state;
  const startId = globalIdOf(dataset, state.wardStart) ?? 1;
  const endId = globalIdOf(dataset, state.wardEnd) ?? startId;
  const posId = globalIdOf(dataset, state.position) ?? startId;

  const newPosId = Math.max(posId, Math.min(readId + 1, endId + 1));
  const newPosRef = refFromGlobalId(dataset, newPosId) ?? state.position;
  const done = newPosId > endId || state.done;

  let history = state.tadabburHistory;
  let candidate = state.tadabburAyah;
  let priority = state.candidatePriority;

  if (candidate) {
    const cid = globalIdOf(dataset, candidate);
    if (cid !== null && cid < newPosId) {
      history = pushHistory(history, candidate);
      candidate = null;
    }
  }

  if (newPosId > endId) {
    candidate = null;
  } else if (!candidate) {
    const next = pickTadabburCandidate(dataset, pool, newPosRef, state.wardEnd, history);
    if (next) {
      candidate = next.ref;
      priority = next.priority;
    }
  }

  return { ...state, position: newPosRef, tadabburAyah: candidate, candidatePriority: priority, tadabburHistory: history, done };
}

/**
 * Mark the whole ward as read and move to the next unread ayah (wrapping to
 * 1:1 at the end of the Quran). The pending candidate is recorded in history.
 */
/**
 * Mark the whole ward as read and move to the next unread ayah (wrapping to
 * 1:1 at the end of the Quran). The pending candidate is recorded in history.
 */
export function advancePages(params: {
  state: WardProgress;
  countAyahs: number;
  dataset: QuranDataset;
  pool: string[];
}): WardProgress {
  const { state, countAyahs, dataset, pool } = params;
  const startId = globalIdOf(dataset, state.wardStart) ?? 1;
  const endId = globalIdOf(dataset, state.wardEnd) ?? startId;
  const posId = globalIdOf(dataset, state.position) ?? startId;
  const total = dataset.manifest.totalAyahs;
  const amount = Math.max(1, Math.floor(countAyahs));
  const newPosId = Math.min(endId + 1, Math.max(posId, Math.min(posId + amount, total + 1)));
  const newPosRef = refFromGlobalId(dataset, newPosId) ?? state.position;
  const done = newPosId > endId || state.done;

  let history = state.tadabburHistory;
  let candidate = state.tadabburAyah;
  let priority = state.candidatePriority;

  if (candidate) {
    const cid = globalIdOf(dataset, candidate);
    if (cid !== null && cid < newPosId) {
      history = pushHistory(history, candidate);
      candidate = null;
    }
  }

  if (newPosId > endId) {
    candidate = null;
  } else if (!candidate) {
    const next = pickTadabburCandidate(dataset, pool, newPosRef, state.wardEnd, history);
    if (next) {
      candidate = next.ref;
      priority = next.priority;
    }
  }

  return { ...state, position: newPosRef, tadabburAyah: candidate, candidatePriority: priority, tadabburHistory: history, done };
}

export function finishWard(params: {
  state: WardProgress;
  dataset: QuranDataset;
}): WardProgress {
  const { state, dataset } = params;
  const endId = globalIdOf(dataset, state.wardEnd);
  if (endId === null) return state;

  let history = state.tadabburHistory;
  if (state.tadabburAyah) {
    history = pushHistory(history, state.tadabburAyah);
  }

  const nextId = endId >= dataset.manifest.totalAyahs ? 1 : endId + 1;
  const nextRef = refFromGlobalId(dataset, nextId) ?? "1:1";
  return { ...state, position: nextRef, tadabburAyah: null, candidatePriority: "next", tadabburHistory: history, done: true };
}

export function progressStats(state: WardProgress | null, dataset: QuranDataset): ProgressStats | null {
  if (!state) return null;
  const startId = globalIdOf(dataset, state.wardStart) ?? 1;
  const posId = globalIdOf(dataset, state.position) ?? startId;
  const endId = globalIdOf(dataset, state.wardEnd) ?? startId;
  const quota = Math.max(1, endId - startId + 1);
  const done = state.done || posId > endId;
  const read = done ? quota : Math.max(0, posId - startId);
  const remaining = done ? 0 : Math.max(0, endId - posId + 1);
  const percent = done ? 100 : Math.min(100, Math.round((read / quota) * 100));
  return { read, remaining, quota, percent, complete: done };
}

export type BacklogInfo = {
  missedDays: string[];
  missedPages: number;
};

/**
 * Sum the scheduled pages of every consecutive day between the last completed
 * day (exclusive) and today (exclusive). Clamped scan to avoid runaway loops.
 */
export function missedDayBacklog(params: {
  completedDates: string[];
  today: string;
  pagesFor: (day: string) => number;
}): BacklogInfo {
  const { completedDates, today, pagesFor } = params;
  const completed = new Set(completedDates);
  const missedDays: string[] = [];
  let cursor = addDays(today, -1);
  let guard = 0;
  while (!completed.has(cursor)) {
    missedDays.unshift(cursor);
    cursor = addDays(cursor, -1);
    guard += 1;
    if (guard >= MAX_BACKLOG_SCAN_DAYS) break;
  }
  const missedPages = missedDays.reduce((sum, day) => sum + Math.max(0, pagesFor(day)), 0);
  return { missedDays, missedPages };
}

export function remainingBacklog(backlogPages: number, compensatedPages: number): number {
  return Math.max(0, backlogPages - Math.max(0, compensatedPages));
}

export type WardRolloverInfo = {
  missedDays: string[];
  scheduledPages: number;
  readPages: number;
  remainingPages: number;
};

/**
 * Compute the pending rollover from previous (incomplete) ward days. Any day
 * before today that is neither completed nor explicitly skipped is counted as
 * missed; the sum of scheduled pages minus whatever was already read gives the
 * pages the user still owes.
 */
export function wardRollover(params: {
  completedDates: string[];
  skippedDates: string[];
  today: string;
  pagesFor: (day: string) => number;
  readFor: (day: string) => number;
  minDate?: string;
}): WardRolloverInfo {
  const { completedDates, skippedDates, today, pagesFor, readFor, minDate } = params;
  const settled = new Set([...completedDates, ...skippedDates]);
  const missedDays: string[] = [];
  let cursor = addDays(today, -1);
  let guard = 0;
  while (!settled.has(cursor)) {
    if (minDate && cursor < minDate) break;
    missedDays.unshift(cursor);
    cursor = addDays(cursor, -1);
    guard += 1;
    if (guard >= MAX_BACKLOG_SCAN_DAYS) break;
  }
  const scheduledPages = missedDays.reduce((sum, day) => sum + Math.max(0, pagesFor(day)), 0);
  const readPages = missedDays.reduce((sum, day) => sum + Math.max(0, readFor(day)), 0);
  return {
    missedDays,
    scheduledPages,
    readPages,
    remainingPages: Math.max(0, scheduledPages - readPages),
  };
}

export type CompensationPlan = {
  addPerDay: number;
  targetPages: number;
  days: number;
};

export function compensationPlan(backlogPages: number, dailyPages: number): CompensationPlan | null {
  if (backlogPages <= 0) return null;
  const addPerDay = Math.min(5, Math.max(1, Math.ceil(backlogPages / 7)));
  const targetPages = dailyPages + addPerDay;
  const days = Math.ceil(backlogPages / addPerDay);
  return { addPerDay, targetPages, days };
}

export function isAyahRef(value: unknown): value is AyahRef {
  return typeof value === "string" && /^\d{1,3}:\d{1,3}$/.test(value);
}
