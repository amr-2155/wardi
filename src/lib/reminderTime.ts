/**
 * Pure date/time helpers for the daily reading reminder.
 *
 * Deliberately free of any Capacitor import: the alarm itself cannot be
 * tested off-device, but the scheduling decisions that decide WHEN it fires
 * absolutely can be, and they are where the real bugs live (timezone drift,
 * a time that rolls to the wrong day, duplicate schedules).
 */

/** Parse "HH:MM"; returns null for anything malformed. */
export function parseReminderTime(value: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * The next occurrence of `time` in local time.
 *
 * Rolls to tomorrow when today's slot has already passed, so enabling the
 * reminder late in the day still fires tomorrow morning rather than never.
 * Built with setHours/setDate rather than by adding 24h so it stays correct
 * across daylight-saving transitions.
 */
export function nextReminderAt(time: string, now: Date = new Date()): Date | null {
  const parsed = parseReminderTime(time);
  if (!parsed) return null;
  const at = new Date(now);
  at.setHours(parsed.hours, parsed.minutes, 0, 0);
  if (at.getTime() <= now.getTime()) {
    at.setDate(at.getDate() + 1);
  }
  return at;
}

/**
 * Stable key describing the current schedule. Callers re-schedule only when
 * this changes, which is what prevents duplicate notifications when several
 * triggers (midnight rollover, focus, resume) fire in quick succession.
 */
export function reminderSignature(input: {
  enabled: boolean;
  time: string;
  pages: number;
  fromPage: number;
  toPage: number;
  doneToday: boolean;
}): string {
  return [
    input.enabled ? 1 : 0,
    input.time,
    input.pages,
    input.fromPage,
    input.toPage,
    input.doneToday ? 1 : 0,
  ].join("|");
}
