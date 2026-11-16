import type { AsrJuristic, CalculationMethodId, PrayerId } from "./prayer";
import { DEFAULT_METHOD, PRAYERS_ADHAN } from "./prayer";

export interface AdhanSound {
  id: string;
  label: string;
  url: string;
}

export const ADHAN_SOUNDS: AdhanSound[] = [
  {
    id: "alafasy",
    label: "sound.alafasy",
    url: "https://cdn.aladhan.com/audio/adhans/a9.mp3",
  },
  {
    id: "alafasy-2",
    label: "sound.alafasy2",
    url: "https://cdn.aladhan.com/audio/adhans/a7.mp3",
  },
  {
    id: "nafees",
    label: "sound.nafees",
    url: "https://cdn.aladhan.com/audio/adhans/a1.mp3",
  },
  {
    id: "zahrani",
    label: "sound.zahrani",
    url: "https://cdn.aladhan.com/audio/adhans/a11-mansour-al-zahrani.mp3",
  },
  {
    id: "dubai",
    label: "sound.dubai",
    url: "https://cdn.aladhan.com/audio/adhans/a4.mp3",
  },
  {
    id: "turkey",
    label: "sound.turkey",
    url: "https://cdn.aladhan.com/audio/adhans/a2.mp3",
  },
];

export const DEFAULT_LOCATION = { latitude: 30.0444, longitude: 31.2357 }; // Cairo

export type PrayerSettings = {
  enabled: boolean;
  autoLocation: boolean;
  latitude: number;
  longitude: number;
  method: CalculationMethodId;
  asr: AsrJuristic;
  adhanSoundId: string;
  adhanEnabled: boolean;
  preAdhanReminderEnabled: boolean;
  preAdhanLeadMin: number;
  iqamaOffsetMin: number;
  iqamaReminderEnabled: boolean;
  iqamaReminderLeadMin: number;
  reminderSoundEnabled: boolean;
  browserNotifications: boolean;
  /**
   * Per-prayer switches for the pre-prayer reminder. `preAdhanReminderEnabled`
   * is the master switch and keeps its original stored name so existing users
   * keep whatever they had — these only narrow it down.
   */
  prePrayerPerPrayer: Record<PrayerId, boolean>;
  /** Optional Arabic/English spoken alert when a prayer is near. */
  prePrayerVoiceEnabled: boolean;
  /** White Days (13/14/15) reminders. Opt-in: never fire unasked. */
  whiteDaysReminderEnabled: boolean;
  /** "HH:MM" local time for the two white-days reminders. */
  whiteDaysReminderTime: string;
  /** Hijri calendar correction in days, -2…+2. */
  whiteDaysHijriOffset: number;
};

const allPrayers = (value: boolean): Record<PrayerId, boolean> =>
  PRAYERS_ADHAN.reduce(
    (acc, prayer) => ({ ...acc, [prayer]: value }),
    {} as Record<PrayerId, boolean>
  );

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  enabled: true,
  autoLocation: true,
  latitude: DEFAULT_LOCATION.latitude,
  longitude: DEFAULT_LOCATION.longitude,
  method: DEFAULT_METHOD,
  asr: "standard",
  adhanSoundId: "alafasy",
  adhanEnabled: true,
  preAdhanReminderEnabled: true,
  preAdhanLeadMin: 10,
  iqamaOffsetMin: 15,
  iqamaReminderEnabled: true,
  iqamaReminderLeadMin: 5,
  reminderSoundEnabled: true,
  browserNotifications: false,
  prePrayerPerPrayer: allPrayers(true),
  prePrayerVoiceEnabled: false,
  whiteDaysReminderEnabled: false,
  whiteDaysReminderTime: "20:00",
  whiteDaysHijriOffset: 0,
};

const KEY = "ward:v2:prayer";

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function sanitizePrayerSettings(raw: unknown): PrayerSettings {
  const d = DEFAULT_PRAYER_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, prePrayerPerPrayer: { ...d.prePrayerPerPrayer } };
  const r = raw as Record<string, unknown>;

  const method = METHODS_IDS.includes(r.method as CalculationMethodId)
    ? (r.method as CalculationMethodId)
    : d.method;
  const asr = r.asr === "hanafi" ? "hanafi" : "standard";
  const soundId = ADHAN_SOUNDS.some((s) => s.id === r.adhanSoundId)
    ? (r.adhanSoundId as string)
    : d.adhanSoundId;

  /* Per-prayer switches: missing keys inherit the default (on), so an existing
   * install that predates this feature keeps the reminder it already had. */
  const perRaw = r.prePrayerPerPrayer;
  const prePrayerPerPrayer = allPrayers(true);
  if (perRaw && typeof perRaw === "object") {
    for (const prayer of PRAYERS_ADHAN) {
      const v = (perRaw as Record<string, unknown>)[prayer];
      if (typeof v === "boolean") prePrayerPerPrayer[prayer] = v;
    }
  }

  const whiteDaysTime =
    typeof r.whiteDaysReminderTime === "string" &&
    /^([01]?\d|2[0-3]):[0-5]\d$/.test(r.whiteDaysReminderTime.trim())
      ? r.whiteDaysReminderTime.trim().padStart(5, "0")
      : d.whiteDaysReminderTime;

  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    autoLocation: typeof r.autoLocation === "boolean" ? r.autoLocation : d.autoLocation,
    latitude: num(r.latitude, d.latitude),
    longitude: num(r.longitude, d.longitude),
    method,
    asr,
    adhanSoundId: soundId,
    adhanEnabled: typeof r.adhanEnabled === "boolean" ? r.adhanEnabled : d.adhanEnabled,
    preAdhanReminderEnabled:
      typeof r.preAdhanReminderEnabled === "boolean" ? r.preAdhanReminderEnabled : d.preAdhanReminderEnabled,
    /* Same bounds the fields enforce (1–120 / 1–60), so a value typed into an
       older build cannot leave the reminder scheduled hours off. */
    preAdhanLeadMin: Math.min(120, Math.max(1, Math.floor(num(r.preAdhanLeadMin, d.preAdhanLeadMin)))),
    iqamaOffsetMin: Math.max(0, Math.floor(num(r.iqamaOffsetMin, d.iqamaOffsetMin))),
    iqamaReminderEnabled:
      typeof r.iqamaReminderEnabled === "boolean" ? r.iqamaReminderEnabled : d.iqamaReminderEnabled,
    iqamaReminderLeadMin: Math.min(60, Math.max(1, Math.floor(num(r.iqamaReminderLeadMin, d.iqamaReminderLeadMin)))),
    reminderSoundEnabled:
      typeof r.reminderSoundEnabled === "boolean" ? r.reminderSoundEnabled : d.reminderSoundEnabled,
    browserNotifications:
      typeof r.browserNotifications === "boolean" ? r.browserNotifications : d.browserNotifications,
    prePrayerPerPrayer,
    prePrayerVoiceEnabled:
      typeof r.prePrayerVoiceEnabled === "boolean" ? r.prePrayerVoiceEnabled : d.prePrayerVoiceEnabled,
    whiteDaysReminderEnabled:
      typeof r.whiteDaysReminderEnabled === "boolean"
        ? r.whiteDaysReminderEnabled
        : d.whiteDaysReminderEnabled,
    whiteDaysReminderTime: whiteDaysTime,
    whiteDaysHijriOffset: Math.max(-2, Math.min(2, Math.trunc(num(r.whiteDaysHijriOffset, d.whiteDaysHijriOffset)))),
  };
}

export function loadPrayerSettings(): PrayerSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizePrayerSettings(JSON.parse(raw)) : { ...DEFAULT_PRAYER_SETTINGS };
  } catch {
    return { ...DEFAULT_PRAYER_SETTINGS };
  }
}

export function savePrayerSettings(settings: PrayerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota errors */
  }
}

const METHODS_IDS: CalculationMethodId[] = [
  "MWL",
  "ISNA",
  "Egypt",
  "Makkah",
  "Karachi",
  "Tehran",
  "Jafari",
];

/* ── Fired-event dedupe (per day) ── */

const FIRED_KEY = "ward:v2:prayer:fired";

export type FiredEvent = "adhan" | "pre" | "iqamaReminder" | "iqama";

export function firedKey(dateKey: string, prayer: string, event: FiredEvent): string {
  return `${dateKey}:${prayer}:${event}`;
}

export function loadFiredEvents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markFired(key: string): void {
  try {
    const existing = loadFiredEvents();
    if (!existing.includes(key)) {
      localStorage.setItem(FIRED_KEY, JSON.stringify([...existing, key].slice(-400)));
    }
  } catch {
    /* ignore */
  }
}

export function isFired(key: string): boolean {
  return loadFiredEvents().includes(key);
}