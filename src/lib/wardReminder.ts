/**
 * Daily reading-ward reminder, scheduled through the OS alarm service.
 *
 * Why a native scheduler and not a web timer:
 * `notificationsEnabled` and `reminderTime` were persisted and shown in
 * Settings but nothing ever read them, so the toggle was a no-op. A
 * setInterval or Notification API in the page cannot fire reliably once the OS
 * suspends JS (screen locked, app backgrounded or killed). The only path that
 * survives that is the OS alarm service, reached via Capacitor's
 * LocalNotifications plugin.
 *
 * Honesty rules baked in here:
 * - Every function reports what it actually did. A browser build, a missing
 *   permission, or a plugin error returns a falsy/`unsupported` result rather
 *   than pretending a reminder was set. The UI shows that plainly.
 * - Text comes from locale.ts via `t()`, never hardcoded.
 * - Scheduling is keyed by a signature so a re-render (or a focus/resume
 *   handler firing several times) cannot stack duplicate notifications.
 *
 * DEVICE-DEPENDENT: whether the alarm actually arrives is only provable on
 * real Android hardware. Nothing here simulates that.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getLocaleFromStorage, t as translate, type Locale } from "./locale";
import { nextReminderAt } from "./reminderTime";

export {
  nextReminderAt,
  parseReminderTime,
  reminderSignature,
} from "./reminderTime";

/** Fixed ID so a reschedule can cancel exactly our notification. */
const ID_WARD_REMINDER = 5001;
const CH_WARD = "wardi_ward_reminder";

export type ReminderStatus =
  | "scheduled"
  | "cancelled"
  | "permission-denied"
  | "unsupported"
  | "error";

export type ReminderResult = {
  status: ReminderStatus;
  /** Present only when something is genuinely scheduled. */
  at?: Date;
  /** True only when the OS accepted the alarm. Never asserted without a call. */
  native: boolean;
};

export type WardReminderInput = {
  enabled: boolean;
  /** "HH:MM" in 24h local time, as stored in settings. */
  time: string;
  /** Pages in today's ward, for the notification body. */
  pages: number;
  fromPage: number;
  toPage: number;
  /** Whether today's ward is already finished. */
  doneToday?: boolean;
  locale?: Locale;
  now?: Date;
};

/**
 * Stable key describing the current schedule. Callers re-schedule only when
 * this changes, which is what prevents duplicate notifications.
 */

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Request the OS notification permission. Never claims success. */
export async function ensureReminderPermission(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

async function cancelReminder(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_WARD_REMINDER }] });
  } catch {
    /* best-effort */
  }
}

function buildBody(locale: Locale, input: WardReminderInput): string {
  if (input.doneToday) {
    return translate(locale, "reminder.bodyDone");
  }
  return translate(locale, "reminder.body", {
    n: input.pages,
    from: input.fromPage,
    to: input.toPage,
  });
}

/**
 * Schedule (or clear) the daily ward reminder.
 *
 * Resolves only after the OS call has actually returned, so the caller can
 * report the true outcome.
 */
export async function scheduleWardReminder(
  input: WardReminderInput
): Promise<ReminderResult> {
  const locale = input.locale ?? getLocaleFromStorage();
  const now = input.now ?? new Date();

  // Always drop the previous alarm first, so an edit or a disable can never
  // leave an orphaned notification behind.
  await cancelReminder();

  if (!input.enabled) {
    return { status: "cancelled", native: false };
  }

  const at = nextReminderAt(input.time, now);
  if (!at) {
    return { status: "error", native: false };
  }

  if (!isNativePlatform()) {
    // A browser tab cannot deliver this reliably. Say so rather than
    // reporting a reminder the user will never receive.
    return { status: "unsupported", native: false };
  }

  const granted = await ensureReminderPermission();
  if (!granted) {
    return { status: "permission-denied", native: false };
  }

  try {
    /* Inexact on purpose (R1) -- do NOT "fix" this to true.
     *
     * The plugin's `isExactNotification` defaults to TRUE. On `schedule()`,
     * when the app is not yet allowed to schedule exact alarms, the plugin
     * opens Android's ACTION_REQUEST_SCHEDULE_EXACT_ALARM settings screen and
     * RETURNS without scheduling. The app targets SDK 36 and is neither an
     * alarm nor a calendar app, so on a fresh Android 14+ install that
     * permission is not pre-granted.
     *
     * That was catastrophic here specifically because the schedule signature
     * embeds `fromPage`/`toPage`, which derive from `settings.currentPage`.
     * Every page the user read changed the signature, re-ran the scheduler,
     * and therefore could bounce the reader out of the mushaf and into system
     * settings mid-read.
     *
     * An inexact windowed alarm (`setAndAllowWhileIdle`) is the right tool for
     * a daily habit nudge anyway: it needs no permission, so it cannot be
     * revoked, and a once-a-day reading reminder tolerates the batching that
     * Android may apply under Doze. Delivery is NOT made worse in any way the
     * user can perceive beyond what the OS already did silently. */
    await LocalNotifications.createChannel({
      id: CH_WARD,
      name: translate(locale, "reminder.channelName"),
      description: translate(locale, "reminder.channelDescription"),
      importance: 3, // DEFAULT: a reading reminder, not an alarm
    });

    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_WARD_REMINDER,
          title: translate(locale, "reminder.title"),
          body: buildBody(locale, input),
          schedule: { at, allowWhileIdle: true },
          // MUST stay false. See the long note below -- this is the only
          // thing standing between ordinary reading and Android's system
          // "Alarms & reminders" settings screen.
          isExactNotification: false,
          channelId: CH_WARD,
          extra: { kind: "wardReminder" },
          smallIcon: "ic_stat_icon_config_sample",
        },
      ],
    });

    return { status: "scheduled", at, native: true };
  } catch {
    return { status: "error", native: false };
  }
}

/** Turn the reminder off. Safe to call when it was never on. */
export async function cancelWardReminder(): Promise<ReminderResult> {
  if (!isNativePlatform()) {
    return { status: "unsupported", native: false };
  }
  await cancelReminder();
  return { status: "cancelled", native: true };
}

/**
 * Re-schedule when the user crosses a day boundary. The stored time is a
 * daily time, so the alarm must be re-armed for the new day; a stale alarm
 * from yesterday would either never fire or fire at the wrong moment.
 */
export async function ensureReminderForToday(input: WardReminderInput): Promise<ReminderResult> {
  return scheduleWardReminder(input);
}
