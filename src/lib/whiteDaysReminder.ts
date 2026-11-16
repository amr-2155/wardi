/**
 * OS-scheduled White Days (13/14/15 Hijri) reminders.
 *
 * Two alarms per Hijri month: the 11th (two days before the fasts) and the
 * 12th (one day before). The files that decide WHICH days are involved are
 * pure (`whiteDays.ts`); this module only hands them to Android.
 *
 * Honesty rules match `wardReminder.ts`:
 * - a browser build returns `unsupported`, never a fake success;
 * - permission is checked, not assumed;
 * - alarms are inexact on purpose (`isExactNotification` stays false) so the
 *   app never bounces a reader into Android's "Alarms & reminders" screen —
 *   the same reason the ward reminder uses inexact alarms;
 * - every run cancels our own IDs first, so changing the setting cannot leave
 *   a stale or duplicated notification behind.
 *
 * DEVICE-DEPENDENT: delivery is only provable on real Android hardware.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getLocaleFromStorage, t as translate, type Locale } from "./locale";
import {
  formatDayList,
  hijriMonthLabel,
  upcomingWhiteDays,
  type WhiteDaysNotification,
} from "./whiteDays";

const CH_WHITE_DAYS = "wardi_white_days";
const ID_MIN = 6000;
const ID_MAX = 6999;

export type WhiteDaysStatus =
  | "scheduled"
  | "cancelled"
  | "permission-denied"
  | "unsupported"
  | "error";

export type WhiteDaysResult = {
  status: WhiteDaysStatus;
  /** The reminders the OS accepted (empty unless `scheduled`). */
  scheduled: WhiteDaysNotification[];
  /** True only when the native call actually returned. */
  native: boolean;
};

export type WhiteDaysInput = {
  enabled: boolean;
  /** "HH:MM" local time. */
  time: string;
  /** Hijri correction, -2…+2 days. */
  offsetDays: number;
  now?: Date;
  locale?: Locale;
};

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Stable key for the current schedule. Exported so the provider can prove it
 * does not reschedule on every render.
 */
export function whiteDaysScheduleSignature(input: {
  enabled: boolean;
  time: string;
  offsetDays: number;
  now?: Date;
}): string {
  const reminders = upcomingWhiteDays(input.now ?? new Date(), {
    time: input.time,
    offsetDays: input.offsetDays,
  });
  return [
    input.enabled ? 1 : 0,
    input.time,
    input.offsetDays,
    ...reminders.map((r) => `${r.key}@${r.notifyAt.getTime()}`),
  ].join("|");
}

/** Month name in the user's language, read straight from the fast day. */
function hijriMonthName(date: Date, locale: Locale): string {
  return hijriMonthLabel(date, locale);
}

function bodyFor(reminder: WhiteDaysNotification, locale: Locale): string {
  const month = hijriMonthName(reminder.fastDays[0].date, locale);
  const dates = formatDayList(
    reminder.fastDays.map((d) => d.date),
    locale
  );
  const key =
    reminder.kind === "twoDaysBefore" ? "whiteDays.twoDaysBody" : "whiteDays.oneDayBody";
  return translate(locale, key, { month, dates });
}

async function clearWhiteDaysNotifications(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications ?? []).filter(
      (n: { id?: number }) => typeof n.id === "number" && n.id >= ID_MIN && n.id <= ID_MAX
    );
    if (ours.length > 0) {
      await LocalNotifications.cancel({
        notifications: ours.map((n: { id: number }) => ({ id: n.id })),
      });
    }
  } catch {
    /* best-effort */
  }
}

async function ensurePermission(): Promise<boolean> {
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

/**
 * (Re)schedule both upcoming white-days reminders.
 *
 * Always clears the previous ones first, so toggling off, changing the time or
 * moving the Hijri offset is reflected immediately instead of stacking.
 */
export async function scheduleWhiteDaysReminders(input: WhiteDaysInput): Promise<WhiteDaysResult> {
  const locale = input.locale ?? getLocaleFromStorage();
  const now = input.now ?? new Date();

  if (!isNative()) {
    await clearWhiteDaysNotifications();
    return {
      status: input.enabled ? "unsupported" : "cancelled",
      scheduled: [],
      native: false,
    };
  }

  await clearWhiteDaysNotifications();
  if (!input.enabled) return { status: "cancelled", scheduled: [], native: true };

  const reminders = upcomingWhiteDays(now, {
    time: input.time,
    offsetDays: input.offsetDays,
  });
  if (reminders.length === 0) return { status: "scheduled", scheduled: [], native: true };

  if (!(await ensurePermission())) {
    return { status: "permission-denied", scheduled: [], native: false };
  }

  try {
    await LocalNotifications.createChannel({
      id: CH_WHITE_DAYS,
      name: translate(locale, "whiteDays.channelName"),
      description: translate(locale, "whiteDays.channelDescription"),
      importance: 3, // DEFAULT: a fasting nudge, not an alarm
    });
  } catch {
    /* channel creation is best-effort */
  }

  try {
    await LocalNotifications.schedule({
      notifications: reminders.map((reminder, index) => ({
        id: ID_MIN + index,
        title: translate(locale, "whiteDays.title"),
        body: bodyFor(reminder, locale),
        schedule: { at: reminder.notifyAt, allowWhileIdle: true },
        // MUST stay false — see the rationale in wardReminder.ts.
        isExactNotification: false,
        channelId: CH_WHITE_DAYS,
        extra: { kind: "whiteDays", key: reminder.key },
      })),
    });
    return { status: "scheduled", scheduled: reminders, native: true };
  } catch {
    return { status: "error", scheduled: [], native: false };
  }
}

export async function cancelWhiteDaysReminders(): Promise<void> {
  await clearWhiteDaysNotifications();
}
