/**
 * White Days (الأيام البيض) reminder dates: the 13th, 14th and 15th of every
 * Hijri month.
 *
 * The app asks for two reminders per month: one two days before the fasts
 * begin (the 11th) and one a day before (the 12th). Both name the actual
 * 13/14/15 dates so the user is never told "soon" without knowing which days.
 *
 * How the Hijri dates are found:
 * `hijri.ts` converts through `Intl.DateTimeFormat` with the
 * islamic-umalqura calendar, so there are no month-length tables to drift.
 * This module walks the Gregorian calendar forward one day at a time and keeps
 * the days that convert to 11–15, which also means a 29-day month is handled
 * without special cases (13/14/15 always exist).
 *
 * Calendar caveat: Umm al-Qura is computed, while local month starts follow
 * sighting. `offsetDays` shifts the conversion by -2…+2 days so the user can
 * line the reminder up with their own calendar; the UI says this explicitly.
 *
 * Pure: no Capacitor, no localStorage, no React. Safe to unit test.
 */

import { hijriOf, type HijriDate } from "./hijri";
import { parseReminderTime } from "./reminderTime";

export type WhiteDaysKind = "twoDaysBefore" | "oneDayBefore";

export type WhiteDaysFastDay = {
  /** Hijri day: 13, 14 or 15. */
  day: number;
  /** The Gregorian date this Hijri day falls on, in local time. */
  date: Date;
  hijri: HijriDate;
};

export type WhiteDaysNotification = {
  /** Stable across runs while the month/offset stay the same. */
  key: string;
  kind: WhiteDaysKind;
  /** When the OS alarm should fire. */
  notifyAt: Date;
  /** 13, 14 and 15 of the month, with their Gregorian equivalents. */
  fastDays: WhiteDaysFastDay[];
  hijriMonth: number;
  hijriYear: number;
};

export type WhiteDaysOptions = {
  /** Hijri calendar correction, clamped to -2…+2. */
  offsetDays?: number;
  /** "HH:MM" local time for the reminder; defaults to 20:00. */
  time?: string;
  /** How far ahead to look. 75 days covers this month and the next. */
  horizonDays?: number;
};

export const DEFAULT_WHITE_DAYS_TIME = "20:00";
export const MAX_HIJRI_OFFSET = 2;

/** Hijri month name read straight from the Gregorian anchor (locale aware). */
export function hijriMonthLabel(date: Date, locale: "ar" | "en"): string {
  try {
    return new Intl.DateTimeFormat(
      locale === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura",
      { month: "long" }
    ).format(date);
  } catch {
    return "";
  }
}

/** Short Gregorian date for a fast day, e.g. "٢ مارس" / "2 Mar". */
export function gregorianDayLabel(date: Date, locale: "ar" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return `${date.getDate()}/${date.getMonth() + 1}`;
  }
}

/**
 * Join several days the way the locale writes a list. `Intl.ListFormat`
 * supplies the conjunction ("،" / "and"), so no Arabic punctuation has to be
 * hardcoded outside the dictionary.
 */
export function formatDayList(dates: Date[], locale: "ar" | "en"): string {
  const labels = dates.map((date) => gregorianDayLabel(date, locale));
  try {
    return new Intl.ListFormat(locale === "ar" ? "ar" : "en", {
      style: "long",
      type: "conjunction",
    }).format(labels);
  } catch {
    return labels.join(", ");
  }
}

function clampOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(MAX_HIJRI_OFFSET, Math.max(-MAX_HIJRI_OFFSET, Math.trunc(value)));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The reminder date at the requested local wall-clock time. */
function atLocalTime(day: Date, time: string): Date {
  const parsed = parseReminderTime(time) ?? parseReminderTime(DEFAULT_WHITE_DAYS_TIME)!;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), parsed.hours, parsed.minutes, 0, 0);
}

function monthKey(h: HijriDate): string {
  return `${h.year}-${h.month}`;
}

/**
 * The upcoming white-days reminders, soonest first.
 *
 * Only future reminders are returned: a reminder whose time already passed is
 * not resurrected, so opening the app on the 12th at 21:00 cannot fire the
 * 11th's notification late. The 12th reminder for that same month is still
 * returned if its 20:00 slot has not passed.
 */
export function upcomingWhiteDays(
  now: Date = new Date(),
  options: WhiteDaysOptions = {}
): WhiteDaysNotification[] {
  const offset = clampOffset(options.offsetDays);
  const time = options.time ?? DEFAULT_WHITE_DAYS_TIME;
  const horizon = Math.max(40, Math.min(400, options.horizonDays ?? 75));
  const start = startOfDay(now);
  const nowTs = now.getTime();

  /* Collect every day in the window that converts to 11–15, grouped by month. */
  const byMonth = new Map<string, WhiteDaysFastDay[]>();
  for (let ahead = 0; ahead <= horizon; ahead += 1) {
    const date = addDays(start, ahead);
    const hijri = hijriOf(date, offset);
    if (hijri.day < 11 || hijri.day > 15) continue;
    const key = monthKey(hijri);
    const bucket = byMonth.get(key) ?? [];
    bucket.push({ day: hijri.day, date, hijri });
    byMonth.set(key, bucket);
  }

  const out: WhiteDaysNotification[] = [];
  for (const [key, days] of byMonth) {
    const byDay = new Map<number, WhiteDaysFastDay>();
    for (const entry of days) byDay.set(entry.day, entry);

    const fastDays: WhiteDaysFastDay[] = [];
    for (const day of [13, 14, 15]) {
      const entry = byDay.get(day);
      if (entry) fastDays.push(entry);
    }
    // A truncated window can miss 14/15 near the horizon; never emit a
    // reminder that names only part of the three days.
    if (fastDays.length !== 3) continue;

    const first = fastDays[0];
    const kinds: Array<{ kind: WhiteDaysKind; hijriDay: number }> = [
      { kind: "twoDaysBefore", hijriDay: 11 },
      { kind: "oneDayBefore", hijriDay: 12 },
    ];

    for (const { kind, hijriDay } of kinds) {
      const anchor = byDay.get(hijriDay);
      if (!anchor) continue;
      const notifyAt = atLocalTime(anchor.date, time);
      if (notifyAt.getTime() <= nowTs) continue;
      out.push({
        key: `${key}-${kind}`,
        kind,
        notifyAt,
        fastDays,
        hijriMonth: first.hijri.month,
        hijriYear: first.hijri.year,
      });
    }
  }

  return out.sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime());
}
