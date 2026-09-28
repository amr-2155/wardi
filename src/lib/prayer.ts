import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes as AdhanPrayerTimes,
  Rounding,
} from "adhan";

export type PrayerId = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export const PRAYER_ORDER: PrayerId[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

/** The five adhan prayers (sunrise has no adhan). */
export const PRAYERS_ADHAN: PrayerId[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export const PRAYER_LABELS: Record<PrayerId, string> = {
  fajr: "prayer.fajr",
  sunrise: "prayer.sunrise",
  dhuhr: "prayer.dhuhr",
  asr: "prayer.asr",
  maghrib: "prayer.maghrib",
  isha: "prayer.isha",
};

export type AsrJuristic = "standard" | "hanafi";

export type CalculationMethodId =
  | "MWL"
  | "ISNA"
  | "Egypt"
  | "Makkah"
  | "Karachi"
  | "Tehran"
  | "Jafari";

export interface PrayerMethod {
  id: CalculationMethodId;
  label: string;
}

export const METHODS: PrayerMethod[] = [
  { id: "MWL", label: "method.MWL" },
  { id: "ISNA", label: "method.ISNA" },
  { id: "Egypt", label: "method.Egypt" },
  { id: "Makkah", label: "method.Makkah" },
  { id: "Karachi", label: "method.Karachi" },
  { id: "Tehran", label: "method.Tehran" },
  { id: "Jafari", label: "method.Jafari" },
];

export const DEFAULT_METHOD: CalculationMethodId = "Makkah";

export interface CoordinatesLike {
  latitude: number;
  longitude: number;
}

export interface PrayerTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

function toParams(methodId: CalculationMethodId, asrJuristic: AsrJuristic): CalculationParameters {
  let params: CalculationParameters;
  switch (methodId) {
    case "MWL":
      params = CalculationMethod.MuslimWorldLeague();
      break;
    case "ISNA":
      params = CalculationMethod.NorthAmerica();
      break;
    case "Egypt":
      params = CalculationMethod.Egyptian();
      break;
    case "Makkah":
      params = CalculationMethod.UmmAlQura();
      break;
    case "Karachi":
      params = CalculationMethod.Karachi();
      break;
    case "Tehran":
      params = CalculationMethod.Tehran();
      break;
    case "Jafari":
      params = CalculationMethod.Other();
      params.fajrAngle = 16;
      params.ishaAngle = 14;
      params.ishaInterval = 0;
      break;
  }
  params.madhab = asrJuristic === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
  params.rounding = Rounding.Nearest;
  return params;
}

/**
 * Compute prayer times for a given date (device-local timezone of `date`).
 * Sunrise is included: it marks the end of the Fajr window but is not a
 * call to prayer.
 */
export function computePrayerTimes(
  date: Date,
  coords: CoordinatesLike,
  methodId: CalculationMethodId = DEFAULT_METHOD,
  asrJuristic: AsrJuristic = "standard"
): PrayerTimes {
  const co = new Coordinates(coords.latitude, coords.longitude);
  const t = new AdhanPrayerTimes(co, date, toParams(methodId, asrJuristic));
  return {
    fajr: t.fajr,
    sunrise: t.sunrise,
    dhuhr: t.dhuhr,
    asr: t.asr,
    maghrib: t.maghrib,
    isha: t.isha,
  };
}

/* ── Formatting & helpers ── */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(d: Date, arabicDigits = false): string {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const periodAr = h24 < 12 ? "ص" : "م";
  const periodEn = h24 < 12 ? "AM" : "PM";
  const str = `${h12}:${pad(d.getMinutes())}`;
  if (!arabicDigits) return `${str} ${periodEn}`;
  const withPeriod = `${str} ${periodAr}`;
  return withPeriod.replace(/\d/g, (dig) => "٠١٢٣٤٥٦٧٨٩"[Number(dig)]);
}

export interface NextPrayer {
  prayer: PrayerId;
  time: Date;
  secondsTo: number;
}

/** The next prayer that has not yet started; falls back to tomorrow's fajr. */
export function getNextPrayer(times: PrayerTimes, now: Date): NextPrayer {
  for (const p of PRAYER_ORDER) {
    if (times[p].getTime() > now.getTime() + 1000) {
      return {
        prayer: p,
        time: times[p],
        secondsTo: Math.max(0, (times[p].getTime() - now.getTime()) / 1000),
      };
    }
  }
  // All today's times have passed → next is tomorrow's fajr. Compute it
  // relative to now so the countdown keeps working across midnight.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { prayer: "fajr", time: now, secondsTo: 0 };
}

/** Rebuild next-prayer info crossing midnight for a given day's times. */
export function computeNextFromDay(
  date: Date,
  coords: CoordinatesLike,
  methodId: CalculationMethodId,
  asr: AsrJuristic,
  now: Date
): { times: PrayerTimes; next: NextPrayer } {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const times = computePrayerTimes(dayStart, coords, methodId, asr);
  let next = getNextPrayer(times, now);
  if (next.prayer === "fajr" && next.secondsTo <= 0) {
    const tomorrow = new Date(dayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tTimes = computePrayerTimes(tomorrow, coords, methodId, asr);
    next = { prayer: "fajr", time: tTimes.fajr, secondsTo: Math.max(0, (tTimes.fajr.getTime() - now.getTime()) / 1000) };
  }
  return { times, next };
}

/** Which prayer period `now` falls in (fajr→sunrise→dhuhr→asr→maghrib→isha→next fajr). */
export function getCurrentPrayer(times: PrayerTimes, now: Date): PrayerId | null {
  let current: PrayerId | null = null;
  for (const p of PRAYER_ORDER) {
    if (now.getTime() >= times[p].getTime()) current = p;
    else break;
  }
  return current;
}

export type DurationParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function splitDuration(totalSeconds: number): DurationParts {
  const s = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export function humanizeDuration(parts: DurationParts, locale: "ar" | "en", includeSeconds = false): string {
  const arabicDigits = (n: number) =>
    String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  if (locale === "ar") {
    const units: string[] = [];
    if (parts.days > 0) units.push(`${arabicDigits(parts.days)} يوم`);
    if (parts.hours > 0) units.push(`${arabicDigits(parts.hours)} ساعة`);
    if (parts.minutes > 0) units.push(`${arabicDigits(parts.minutes)} دقيقة`);
    if (parts.seconds > 0 && includeSeconds) units.push(`${arabicDigits(parts.seconds)} ثانية`);
    return units.length ? units.join(" و ") : "اللحظة";
  }
  const units: string[] = [];
  if (parts.days > 0) units.push(`${parts.days} day${parts.days > 1 ? "s" : ""}`);
  if (parts.hours > 0) units.push(`${parts.hours} hr`);
  if (parts.minutes > 0) units.push(`${parts.minutes} min`);
  if (parts.seconds > 0 && includeSeconds) units.push(`${parts.seconds}s`);
  return units.length ? units.join(" ") : "now";
}