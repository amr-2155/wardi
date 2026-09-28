/**
 * Native local notifications for prayer times (Android via Capacitor).
 *
 * Why this file exists:
 * A web page's setInterval + HTMLAudio CANNOT fire reliably when the phone
 * screen is locked or the app is backgrounded/killed — the OS suspends JS
 * timers and the browser stops audio. The only robust path on a real device
 * is the OS alarm/notification service, reached here through the Capacitor
 * LocalNotifications plugin. The in-app ticker (PrayerProvider) keeps
 * handling the foreground case; this module handles background + locked.
 *
 * Behavior:
 * - Schedules one OS notification per enabled event (adhan, pre-adhan
 *   reminder, iqama reminder, iqama notice) for the rest of today.
 * - `allowWhileIdle` lets alarms fire in Doze / with the screen locked.
 * - Tapping an adhan notification re-opens the app; the provider then plays
 *   the adhan audio (full adhan sound cannot autoplay from a killed state on
 *   modern Android — tap-to-play is the OS-blessed flow).
 * - Re-scheduling is idempotent: previous prayer notifications are cleared
 *   first, and callers guard on a signature so we don't reschedule every tick.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PRAYERS_ADHAN, type PrayerId, type PrayerTimes } from "./prayer";
import type { PrayerSettings } from "./prayerSettings";
import { getLocaleFromStorage, t as translate } from "./locale";

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/* Deterministic IDs so rescheduling can cancel exactly our notifications. */
const ID_ADHAN = 1000;
const ID_PRE = 2000;
const ID_IQAMA_REMINDER = 3000;
const ID_IQAMA = 4000;
const ID_MAX = 4999;

export type NativePrayerEventKind = "adhan" | "pre" | "iqamaReminder" | "iqama";

/* Sound-carrying notification channels (Android 8+). The OS plays the adhan
   audio directly from these — no CDN, works with the screen locked/off. */
const CH_ADHAN = "wardi_adhan";
const CH_IQAMA = "wardi_iqama";

/** Create the prayer sound channels once. Idempotent. */
export async function ensurePrayerNotificationChannels(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: CH_ADHAN,
      name: "الأذان",
      description: "صوت الأذان في موعده",
      importance: 4, // HIGH
      sound: "adhan",
      vibration: true,
      visibility: 1, // PUBLIC
    });
    await LocalNotifications.createChannel({
      id: CH_IQAMA,
      name: "الإقامة",
      description: "صوت الإقامة في موعدها",
      importance: 4,
      sound: "adhan",
      vibration: true,
      visibility: 1,
    });
  } catch {
    /* best-effort — channel creation failures are non-fatal */
  }
}

export interface ScheduledPrayerSignature {
  signature: string;
}

export function prayerScheduleSignature(
  dateKey: string,
  times: PrayerTimes,
  settings: PrayerSettings,
  coords: { latitude: number; longitude: number }
): string {
  const parts = [
    dateKey,
    settings.enabled ? 1 : 0,
    settings.adhanEnabled ? 1 : 0,
    settings.preAdhanReminderEnabled ? 1 : 0,
    settings.preAdhanLeadMin,
    settings.iqamaOffsetMin,
    settings.iqamaReminderEnabled ? 1 : 0,
    settings.iqamaReminderLeadMin,
    settings.method,
    settings.asr,
    coords.latitude.toFixed(3),
    coords.longitude.toFixed(3),
    ...PRAYERS_ADHAN.map((p) => times[p].getTime()),
  ];
  return parts.join("|");
}

function label(key: string, params?: Record<string, string | number>): string {
  try {
    return translate(getLocaleFromStorage(), key, params);
  } catch {
    return key;
  }
}

function prayerName(p: PrayerId): string {
  const map: Record<PrayerId, string> = {
    fajr: "prayer.fajr",
    sunrise: "prayer.sunrise",
    dhuhr: "prayer.dhuhr",
    asr: "prayer.asr",
    maghrib: "prayer.maghrib",
    isha: "prayer.isha",
  };
  return label(map[p]);
}

export async function ensureNotificationPermission(): Promise<boolean> {
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

async function clearPrayerNotifications(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications ?? []).filter(
      (n: { id?: number }) =>
        typeof n.id === "number" && n.id >= ID_ADHAN && n.id <= ID_MAX
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

export interface NativeScheduleInput {
  times: PrayerTimes;
  settings: PrayerSettings;
  formatTime: (d: Date) => string;
}

/**
 * (Re)schedule today's remaining prayer notifications natively.
 * Past events are skipped — the foreground ticker already handles those.
 */
export async function schedulePrayerNotifications(
  input: NativeScheduleInput
): Promise<Set<string>> {
  if (!isNativePlatform()) return new Set<string>();
  const { times, settings, formatTime } = input;
  await clearPrayerNotifications();
  if (!settings.enabled) return new Set<string>();
  await ensurePrayerNotificationChannels();

  const now = Date.now();
  const toSchedule: Array<{
    id: number;
    title: string;
    body: string;
    at: Date;
    extra: { kind: NativePrayerEventKind; prayer: PrayerId };
  }> = [];

  PRAYERS_ADHAN.forEach((p, i) => {
    const t = times[p].getTime();
    const name = prayerName(p);

    if (settings.adhanEnabled && t > now) {
      toSchedule.push({
        id: ID_ADHAN + i,
        title: label("adhan.title", { prayer: name }),
        body: label("adhan.playingBody", { prayer: name, time: formatTime(times[p]) }),
        at: new Date(t),
        extra: { kind: "adhan", prayer: p },
      });
    }
    if (settings.preAdhanReminderEnabled) {
      const at = t - settings.preAdhanLeadMin * 60000;
      if (at > now) {
        toSchedule.push({
          id: ID_PRE + i,
          title: label("reminder.title"),
          body: label("reminder.body", { prayer: name }),
          at: new Date(at),
          extra: { kind: "pre", prayer: p },
        });
      }
    }
    if (settings.iqamaOffsetMin > 0) {
      const iqama = t + settings.iqamaOffsetMin * 60000;
      if (settings.iqamaReminderEnabled) {
        const at = iqama - settings.iqamaReminderLeadMin * 60000;
        if (at > now) {
          toSchedule.push({
            id: ID_IQAMA_REMINDER + i,
            title: label("iqama.reminderTitle"),
            body: label("iqama.soonBody", { prayer: name }),
            at: new Date(at),
            extra: { kind: "iqamaReminder", prayer: p },
          });
        }
      }
      if (settings.adhanEnabled && iqama > now) {
        toSchedule.push({
          id: ID_IQAMA + i,
          title: label("iqama.title"),
          body: label("iqama.body", { prayer: name }),
          at: new Date(iqama),
          extra: { kind: "iqama", prayer: p },
        });
      }
    }
  });

  if (toSchedule.length === 0) return new Set<string>();
  try {
    await LocalNotifications.schedule({
      notifications: toSchedule.map((n) => {
        const soundChannel =
          n.extra.kind === "adhan"
            ? { channelId: CH_ADHAN, sound: "adhan" }
            : n.extra.kind === "iqama"
              ? { channelId: CH_IQAMA, sound: "adhan" }
              : {};
        return {
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: { at: n.at, allowWhileIdle: true },
          ...soundChannel,
          extra: n.extra,
        };
      }),
    });
    return new Set(toSchedule.map((n) => `${n.extra.kind}:${n.extra.prayer}`));
  } catch {
    /* scheduling unsupported — foreground ticker still covers open app */
    return new Set<string>();
  }
}

export async function cancelAllPrayerNotifications(): Promise<void> {
  if (!isNativePlatform()) return;
  await clearPrayerNotifications();
}

let tapListenerReady = false;

/**
 * When the user taps an adhan notification, the OS re-opens the app.
 * `onAdhanTap` lets the provider play the adhan audio at that moment.
 * Registered once per app lifetime.
 */
export async function onAdhanNotificationTap(
  onAdhanTap: (prayer: PrayerId) => void
): Promise<void> {
  if (!isNativePlatform() || tapListenerReady) return;
  tapListenerReady = true;
  try {
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (action: { notification?: { extra?: unknown } }) => {
        try {
          const extra = action.notification?.extra as
            | { kind?: unknown; prayer?: unknown }
            | undefined;
          if (extra?.kind === "adhan" && typeof extra.prayer === "string") {
            onAdhanTap(extra.prayer as PrayerId);
          }
        } catch {
          /* ignore malformed payloads */
        }
      }
    );
  } catch {
    /* listeners unsupported */
  }
}
