/**
 * One-way sync from the app (the single source of truth for prayer times) to
 * the Android home-screen widgets.
 *
 * The web app owns the calculation: `adhan` (Umm al-Qura by default) with the
 * user's stored coordinates, method and madhab — exactly the values the in-app
 * screens use. The widget never re-implements any of this; it receives the
 * already-computed schedule (including display strings, so digits and ص/م match
 * the app exactly) plus the epoch millis it needs to highlight the next prayer
 * and render a countdown itself.
 *
 * The pushed payload covers 14 rolling days, each with its own Hijri and
 * Gregorian label, so the widgets roll over midnight — date header included —
 * without the app running. It is stored in native SharedPreferences by
 * `WardiWidgetPlugin.syncPrayerWidget`, which also redraws the widgets and
 * re-arms the refresh alarm.
 *
 * Web (and any platform without the plugin) is a no-op: only the native shell
 * can create real home-screen widgets, and the app owns the truth.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  computePrayerTimes,
  formatTime,
  PRAYER_ORDER,
  DEFAULT_METHOD,
  type AsrJuristic,
  type CalculationMethodId,
  type CoordinatesLike,
  type PrayerId,
  type PrayerTimes,
} from "./prayer";
import { getLocaleFromStorage, t, type Locale } from "./locale";

interface WardiWidgetPlugin {
  /** Store the payload in prefs, redraw every widget, re-arm the alarm. */
  syncPrayerWidget(options: { payload: string }): Promise<void>;
  /** Redraw from the stored payload (e.g. after a locale/theme change). */
  refreshWidgets(): Promise<void>;
}

const nativeWidget =
  typeof window !== "undefined" && Capacitor.isNativePlatform()
    ? registerPlugin<WardiWidgetPlugin>("WardiWidget")
    : null;

/** The two widget skins, resolved from the app's theme setting. */
export type WidgetTheme = "dark" | "light";

function resolveWidgetTheme(): WidgetTheme {
  try {
    const raw = localStorage.getItem("ward:v2:settings");
    const parsed = raw ? (JSON.parse(raw) as { theme?: string } | null) : null;
    let mode = parsed?.theme ?? "system";
    if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
      mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Same calendar and output as `formatHijri`, but for one concrete day. */
function hijriLabel(day: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura",
    { day: "numeric", month: "long", year: "numeric" }
  ).format(day);
}

function gregorianLabel(day: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(day);
}

export type WidgetWeekDay = {
  /** `YYYY-MM-DD` in the device timezone — how the native side picks today. */
  dateKey: string;
  /** Pre-localized "١٨ ربيع الآخر ١٤٤٨ هـ" / "18 Rabiʻ al-Awwal 1448 AH". */
  hijri: string;
  /** Pre-localized "٥ نوفمبر ٢٠٢٦" / "5 November 2026". */
  gregorian: string;
  /** Display strings per prayer, e.g. "٥:٣٤ ص". */
  times: Record<PrayerId, string>;
  /** Epoch millis per prayer, for next-prayer selection and countdown. */
  epochs: Record<PrayerId, number>;
};

export type WidgetPayload = {
  v: 2;
  locale: Locale;
  theme: WidgetTheme;
  /** Where the times were calculated — the widget geocodes this for a label. */
  latitude: number;
  longitude: number;
  /**
   * Device timezone the schedule was computed in. The native side compares it
   * with the current zone and renders the honest "open Wardi" state after a
   * flight instead of showing times computed for the old zone.
   */
  timeZone: string;
  /** Localized prayer names from the app's own dictionaries. */
  labels: Record<PrayerId, string>;
  /** Rolling 14 days, starting from the day of the sync. */
  week: WidgetWeekDay[];
};

const PRAYER_NAME_KEYS: Record<PrayerId, string> = {
  fajr: "prayer.fajr",
  sunrise: "prayer.sunrise",
  dhuhr: "prayer.dhuhr",
  asr: "prayer.asr",
  maghrib: "prayer.maghrib",
  isha: "prayer.isha",
};

const DAYS_AHEAD = 14;

function buildPayload(
  now: Date,
  coords: CoordinatesLike,
  method: CalculationMethodId,
  asrJuristic: AsrJuristic,
  locale: Locale
): WidgetPayload {
  const labels = {} as Record<PrayerId, string>;
  for (const id of PRAYER_ORDER) labels[id] = t(locale, PRAYER_NAME_KEYS[id]);

  const week: WidgetWeekDay[] = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    /* Local noon: a DST transition at midnight can never move the date. */
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    const times: PrayerTimes = computePrayerTimes(day, coords, method, asrJuristic);
    const displayTimes = {} as Record<PrayerId, string>;
    const epochs = {} as Record<PrayerId, number>;
    for (const id of PRAYER_ORDER) {
      displayTimes[id] = formatTime(times[id], locale === "ar");
      epochs[id] = times[id].getTime();
    }
    week.push({
      dateKey: dateKey(day),
      hijri: hijriLabel(day, locale),
      gregorian: gregorianLabel(day, locale),
      times: displayTimes,
      epochs,
    });
  }

  return {
    v: 2,
    locale,
    theme: resolveWidgetTheme(),
    latitude: coords.latitude,
    longitude: coords.longitude,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    labels,
    week,
  };
}

/**
 * Compute the rolling schedule and hand it to the native widget layer.
 * Fire-and-forget: failures are non-fatal (the app keeps working exactly as
 * before). Returns false when there is nothing to sync to.
 */
export async function syncPrayerWidget(
  now: Date,
  coords: CoordinatesLike,
  method: CalculationMethodId = DEFAULT_METHOD,
  asrJuristic: AsrJuristic = "standard"
): Promise<boolean> {
  if (!nativeWidget) return false;
  const locale = getLocaleFromStorage();
  const payload = buildPayload(now, coords, method, asrJuristic, locale);
  try {
    await nativeWidget.syncPrayerWidget({ payload: JSON.stringify(payload) });
    return true;
  } catch {
    return false;
  }
}

/** Ask the native side to redraw every widget from the stored payload. */
export function refreshPrayerWidgets(): void {
  if (!nativeWidget) return;
  nativeWidget.refreshWidgets().catch(() => {
    /* best effort */
  });
}
