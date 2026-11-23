import { addDays, daysBetween } from "./dates";
import type { WardSettings } from "./types";

const toInt = (n: number): number => (Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1);

export function scheduledPages(settings: WardSettings, dayKey: string): number {
  const passed = daysBetween(settings.increaseStartDate, dayKey);
  const count =
    passed >= 0 && settings.increaseEveryDays > 0
      ? Math.floor(passed / settings.increaseEveryDays)
      : 0;
  return toInt(settings.baseDailyPages + count * settings.increaseAmount);
}

export function effectiveDailyPages(settings: WardSettings, dayKey: string): number {
  const plan = settings.autoIncrease
    ? scheduledPages(settings, dayKey)
    : toInt(settings.dailyPages);
  if (settings.manualOverride && settings.manualOverride.date === dayKey) {
    return toInt(settings.manualOverride.pages);
  }
  return plan;
}

/**
 * Guard for the one write path that closes a ward day.
 *
 * The reader confirms every page through `recordWardPage` and mirrors the
 * confirmed count into the app-level progress before calling `completeToday`.
 * A manual "finish today" button, however, used to be able to call the same
 * function at 0/25 and mark the day complete while the reader was still on
 * page 1. Completion is now permitted only when the recorded progress has
 * actually reached the real size of the ward. This is the logic-level fix for
 * the false-completion bug, not a UI workaround.
 */
export function canCompleteToday(progressPages: number, todayPages: number): boolean {
  if (!Number.isFinite(progressPages) || !Number.isFinite(todayPages)) return false;
  const required = Math.max(1, Math.floor(todayPages));
  return Math.max(0, Math.floor(progressPages)) >= required;
}

export type PageRange = { start: number; end: number; next: number };

export function pageRange(start: number, pages: number, totalPages: number): PageRange {
  const total = Math.max(1, totalPages);
  const from = Math.min(total, Math.max(1, start));
  const end = Math.min(from + pages - 1, total);
  const next = end >= total ? 1 : end + 1;
  return { start: from, end, next };
}

/** The history fields this module needs to resume a ward. Pure input. */
export type WardResumeReading = {
  date: string;
  startPage: number;
  pages: number;
  completed: boolean;
};

/**
 * Where the next day's ward starts.
 *
 * Two cases only:
 *  - the latest reading is SETTLED (completed): `completeToday` already moved
 *    `currentPage` past that block, so the stored value is authoritative;
 *  - the latest reading is PARTIAL: the reader closed the mushaf mid-ward, so
 *    the start moves to the page right after the last page actually read. That
 *    is the "continue from where I stopped" contract — the rest of the old
 *    block is simply folded into the new one, so no page is ever skipped.
 *
 * A reading dated today (or later), a zero-page reservation made by the ward
 * sheet, and entries from another khatma (filtered by the caller) never move
 * the start. The result is idempotent: the same partial entry always yields
 * the same page, and an already-advanced position is never pulled backwards.
 */
export function resumeStartPage(
  readings: ReadonlyArray<WardResumeReading>,
  today: string,
  currentPage: number,
  totalPages: number
): number {
  const total = Math.max(1, totalPages);
  const clamp = (n: number): number => Math.min(total, Math.max(1, Math.round(n)));
  let latest: WardResumeReading | null = null;
  for (const item of readings) {
    if (latest === null || item.date > latest.date) latest = item;
  }
  if (!latest || latest.completed || latest.date >= today || latest.pages <= 0) {
    return clamp(currentPage);
  }
  return Math.max(clamp(currentPage), clamp(latest.startPage + latest.pages));
}

/**
 * Where tomorrow's ward starts, from the state the app actually holds.
 *
 * `completeToday` advances `settings.currentPage` to the first unread page as
 * soon as the day is settled. The caller therefore sees an already-advanced
 * range at the moment the completion screen renders: taking `range.next` of
 * THAT range skips a whole ward (e.g. a 1-page ward on page 1 announced page 3
 * tomorrow). A settled day uses the advanced start; a day whose target was met
 * by manual progress (no `completeToday`) still sits on today's range, so the
 * page after that block is the next one; an unfinished day resumes from the
 * last page actually read.
 */
export function tomorrowStartPage(args: {
  completedToday: boolean;
  isDone: boolean;
  advancedStart: number;
  nextAfterToday: number;
  resumeStart: number;
  totalPages: number;
}): number {
  const total = Math.max(1, args.totalPages);
  const clamp = (n: number): number => Math.min(total, Math.max(1, Math.round(n)));
  if (!args.isDone) return clamp(args.resumeStart);
  return clamp(args.completedToday ? args.advancedStart : args.nextAfterToday);
}

/**
 * Pages that genuinely exist in today's ward.
 *
 * The scheduled ward can run past the end of the mushaf on the final khatma
 * day. Recording or measuring against the scheduled number inflated
 * totalRead/averages and left the final day permanently uncompletable. Returns
 * the size of the real range pageRange clamped to the mushaf.
 */
export function wardPagesAvailable(
  startPage: number,
  scheduledPages: number,
  totalPages: number
): number {
  const { start, end } = pageRange(startPage, scheduledPages, totalPages);
  return Math.max(1, end - start + 1);
}

export type IncreaseInfo = {
  date: string;
  daysLeft: number;
  currentPages: number;
  nextPages: number;
};

export function nextIncreaseInfo(settings: WardSettings, dayKey: string): IncreaseInfo | null {
  if (!settings.autoIncrease || settings.increaseEveryDays <= 0) return null;
  const passed = daysBetween(settings.increaseStartDate, dayKey);
  const count = passed >= 0 ? Math.floor(passed / settings.increaseEveryDays) : -1;
  const target = passed >= 0 ? count + 1 : 0;
  return {
    date: addDays(settings.increaseStartDate, target * settings.increaseEveryDays),
    daysLeft: passed >= 0 ? target * settings.increaseEveryDays - passed : -passed,
    currentPages: effectiveDailyPages(settings, dayKey),
    nextPages: toInt(settings.baseDailyPages + (count + 1) * settings.increaseAmount),
  };
}

export type PlanStep = {
  index: number;
  startDay: number;
  endDay: number;
  pages: number;
  date: string;
};

export function planTimeline(settings: WardSettings, steps = 12): PlanStep[] {
  const every = Math.max(1, settings.increaseEveryDays);
  const list: PlanStep[] = [];
  for (let i = 0; i < steps; i++) {
    list.push({
      index: i,
      startDay: i * every + 1,
      endDay: (i + 1) * every,
      pages: toInt(settings.baseDailyPages + i * settings.increaseAmount),
      date: addDays(settings.increaseStartDate, i * every),
    });
  }
  return list;
}

export function currentPlanIndex(settings: WardSettings, dayKey: string): number {
  const passed = daysBetween(settings.increaseStartDate, dayKey);
  return passed >= 0 && settings.increaseEveryDays > 0
    ? Math.floor(passed / settings.increaseEveryDays)
    : 0;
}

export function khatmaProgressPercent(currentPage: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.min(100, Math.round(((Math.max(1, currentPage) - 1) / totalPages) * 100));
}

export function computeStreak(dates: Set<string>, today: string): number {
  const has = (k: string) => dates.has(k);
  if (has(today)) {
    let count = 0;
    while (has(addDays(today, -count))) count++;
    return count;
  }
  const yesterday = addDays(today, -1);
  if (has(yesterday)) {
    let count = 0;
    while (has(addDays(yesterday, -count))) count++;
    return count;
  }
  return 0;
}

/**
 * Streak freeze: banked shields auto-bridge missed days while walking the
 * current streak back. Returns the adjusted streak plus exactly which gap
 * dates were consumed, so the caller can persist them. Pure — no storage.
 * `banked` shields beyond the gap are untouched; an empty bank behaves
 * exactly like `computeStreak`.
 */
export function planFreezeUse(
  dates: Set<string>,
  today: string,
  banked: number
): { streak: number; useDates: string[] } {
  const useDates: string[] = [];
  let left = Math.max(0, Math.floor(banked));
  const has = (k: string) => dates.has(k) || useDates.includes(k);
  // Mirror computeStreak: an untouched today still counts if yesterday held.
  const cursor = has(today) ? today : addDays(today, -1);
  if (!has(cursor)) return { streak: 0, useDates };
  let streak = 0;
  for (let back = 0; back < 3660; back += 1) {
    const key = addDays(cursor, -back);
    if (dates.has(key)) {
      streak += 1;
      continue;
    }
    if (left > 0) {
      left -= 1;
      useDates.push(key);
      streak += 1;
      continue;
    }
    break;
  }
  return { streak, useDates };
}

export function computeBestStreak(dates: Set<string>): number {
  const sorted = [...dates].sort();
  let best = 0;
  let current = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    current = prev !== null && daysBetween(prev, key) === 1 ? current + 1 : 1;
    best = Math.max(best, current);
    prev = key;
  }
  return best;
}
