"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  computeNextFromDay,
  formatTime,
  getCurrentPrayer,
  PRAYER_LABELS,
  PRAYERS_ADHAN,
  type CoordinatesLike,
  type NextPrayer,
  type PrayerId,
  type PrayerTimes,
} from "@/lib/prayer";
import {
  ADHAN_SOUNDS,
  firedKey,
  isFired,
  loadPrayerSettings,
  markFired,
  savePrayerSettings,
  type FiredEvent,
  type PrayerSettings,
} from "@/lib/prayerSettings";
import { getLocaleFromStorage, t as translateKey } from "@/lib/locale";
import {
  ensureNotificationPermission,
  isNativePlatform,
  onAdhanNotificationTap,
  prayerScheduleSignature,
  schedulePrayerNotifications,
} from "@/lib/nativeNotifications";

export type PrayerAlertKind = "adhan" | "reminder" | "iqama" | "iqamaReminder";

export interface PrayerAlert {
  id: number;
  kind: PrayerAlertKind;
  prayer: PrayerId;
  title: string;
  body: string;
  time?: Date;
}

export type LocationStatus = "idle" | "loading" | "ok" | "denied" | "error";

export interface PrayerContextValue {
  settings: PrayerSettings;
  updateSettings: (patch: Partial<PrayerSettings>) => void;
  coords: CoordinatesLike;
  locationStatus: LocationStatus;
  requestLocation: () => void;
  now: Date;
  today: PrayerTimes | null;
  next: NextPrayer | null;
  current: PrayerId | null;
  alert: PrayerAlert | null;
  dismissAlert: () => void;
  playing: boolean;
  testAdhan: (prayer?: PrayerId) => Promise<void>;
  testChime: () => void;
  stopPlayback: () => void;
}

const PrayerContext = createContext<PrayerContextValue | undefined>(undefined);

export function usePrayer(): PrayerContextValue {
  const ctx = useContext(PrayerContext);
  if (!ctx) {
    throw new Error("usePrayer must be used within a PrayerProvider");
  }
  return ctx;
}

const TICK_MS = 1000;
const FIRE_WINDOW_MS = 4000;
const ALERT_MS = 12000;

function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PrayerProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PrayerSettings>(() => loadPrayerSettings());
  const [coords, setCoords] = useState<CoordinatesLike>(() => ({
    latitude: loadPrayerSettings().latitude,
    longitude: loadPrayerSettings().longitude,
  }));
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [now, setNow] = useState<Date>(() => new Date());
  const [today, setToday] = useState<PrayerTimes | null>(null);
  const [next, setNext] = useState<NextPrayer | null>(null);
  const [current, setCurrent] = useState<PrayerId | null>(null);
  const [alert, setAlert] = useState<PrayerAlert | null>(null);
  const [playing, setPlaying] = useState(false);

  const settingsRef = useRef(settings);
  const todayRef = useRef<PrayerTimes | null>(null);
  const alertIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lockedRef = useRef(false);
  const alertTimerRef = useRef<number | null>(null);
  const dayKeyRef = useRef<string>(localDateKey(new Date()));
  const todaySigRef = useRef<string>("");
  /* Which events the OS notification layer already covers. Declared with the
     other refs (not down beside the scheduler effect) because fireAdhan reads
     it, and a ref declared later would be a temporal-dead-zone error in its
     dependency list. */
  const nativeCoveredRef = useRef<{ native: boolean; events: Set<string> }>({
    native: false,
    events: new Set(),
  });

  /* ── Persist settings + keep refs in sync with latest render values ── */
  useEffect(() => {
    savePrayerSettings(settings);
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    todayRef.current = today;
  }, [today]);

  /* ── Geolocation ── */
  const requestLocation = useCallback(() => {
    /* `autoLocation` gates the automatic lookup on start (see the effect
       below); it must not gate an explicit tap. Both the settings panel and
       the prayer screens render the button unconditionally, so returning here
       made a live-looking control do nothing at all. */
    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ latitude: lat, longitude: lng });
        setSettings((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        setLocationStatus("ok");
      },
      () => {
        setLocationStatus("denied");
        setCoords({
          latitude: settingsRef.current.latitude,
          longitude: settingsRef.current.longitude,
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 600000 }
    );
  }, []);

  useEffect(() => {
    if (settings.autoLocation && locationStatus === "idle") {
      const id = window.setTimeout(() => requestLocation(), 0);
      return () => window.clearTimeout(id);
    }
  }, [settings.autoLocation, locationStatus, requestLocation]);

  /* ── Unlock audio on first user interaction (autoplay policy) ── */
  useEffect(() => {
    const unlock = () => {
      lockedRef.current = true;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = audioCtxRef.current ?? new Ctx();
        if (audioCtxRef.current.state === "suspended") {
          void audioCtxRef.current.resume();
        }
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  /* ── Audio primitives ── */
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "none";
    }
    return audioRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  /* ── Teardown ──
     The alert auto-dismiss timer and the audio nodes outlived the provider
     without this: an unmount left a pending setState and a still-playing
     AudioContext holding the audio hardware open. */
  useEffect(
    () => () => {
      if (alertTimerRef.current !== null) window.clearTimeout(alertTimerRef.current);
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.onended = null;
        a.onerror = null;
        a.src = "";
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    },
    []
  );

  const playChime = useCallback(() => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();

      const nowT = ctx.currentTime;
      const notes = [659.25, 880, 659.25, 987.77];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = nowT + i * 0.28;
        const dur = 1.1;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.32, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.05);
      });
    } catch {
      /* ignore */
    }
  }, []);

  /* ── Alerts ── */
  // NOTE: `title`/`body` are locale KEYS (the in-app banner translates them
  // via useLocale). System notifications need resolved strings, so they are
  // translated here with the stored locale (the provider sits above the
  // LocaleContext and cannot use its hook).
  const showAlert = useCallback(
    (kind: PrayerAlertKind, prayer: PrayerId, title: string, body: string, time?: Date) => {
      const id = ++alertIdRef.current;
      setAlert({ id, kind, prayer, title, body, time });
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
      alertTimerRef.current = window.setTimeout(() => setAlert(null), ALERT_MS);
      if (settingsRef.current.browserNotifications && "Notification" in window) {
        try {
          if (Notification.permission === "granted") {
            const locale = getLocaleFromStorage();
            const name = translateKey(locale, PRAYER_LABELS[prayer]);
            const params: Record<string, string | number> = { prayer: name };
            if (time) params.time = formatTime(time, locale === "ar");
            const nTitle = translateKey(locale, title, params);
            const nBody = translateKey(locale, body, params);
            new Notification(nTitle, { body: nBody, tag: `wardi-${kind}-${prayer}` });
          }
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  const dismissAlert = useCallback(() => {
    setAlert(null);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
  }, []);

  /* ── Event firing ── */
  const firedAt = useCallback(
    (eventTime: number, nowTs: number, dk: string, prayer: PrayerId, event: FiredEvent): boolean => {
      const key = firedKey(dk, prayer, event);
      if (isFired(key)) return false;
      const inWindow = nowTs >= eventTime && nowTs <= eventTime + FIRE_WINDOW_MS;
      if (inWindow) {
        markFired(key);
        return true;
      }
      // Grace period: catch events that happened shortly before the app opened.
      if (nowTs > eventTime + FIRE_WINDOW_MS && nowTs <= eventTime + 5 * 60000) {
        markFired(key);
        return true;
      }
      return false;
    },
    []
  );

  /* True when the OS notification layer already owns this event's sound. */
  const nativeCovers = useCallback((kind: string, prayer: PrayerId) => {
    const c = nativeCoveredRef.current;
    return c.native && c.events.has(`${kind}:${prayer}`);
  }, []);

  const fireAdhan = useCallback(
    async (prayer: PrayerId) => {
      const s = settingsRef.current;
      /* The scheduled OS notification plays the bundled adhan on the adhan
         channel. Playing in-app audio as well made the adhan sound twice on
         Android. `nativeCoveredRef` recorded exactly this and was never read;
         now the ticker defers to the native layer. */
      if (nativeCovers("adhan", prayer)) return;
      const sound = ADHAN_SOUNDS.find((x) => x.id === s.adhanSoundId) ?? ADHAN_SOUNDS[0];
      const audio = ensureAudio();
      audio.src = sound.url;
      audio.volume = 1;
      const adhanTime = todayRef.current?.[prayer] ?? new Date();
      try {
        await audio.play();
        setPlaying(true);
        // Lock-screen / media-tray entry for the adhan itself.
        try {
          const nav = navigator as Navigator & {
            mediaSession?: { metadata: unknown };
          };
          if (
            nav.mediaSession &&
            typeof window !== "undefined" &&
            typeof window.MediaMetadata !== "undefined"
          ) {
            const locale = getLocaleFromStorage();
            nav.mediaSession.metadata = new window.MediaMetadata({
              title: translateKey(locale, "adhan.title", {
                prayer: translateKey(locale, PRAYER_LABELS[prayer]),
              }),
              artist: "وردي",
              album: translateKey(locale, "app.name"),
            });
          }
        } catch {
          /* MediaSession unsupported — ignore */
        }
        audio.onended = () => {
          setPlaying(false);
          showAlert("adhan", prayer, "adhan.title", "adhan.playingBody", adhanTime);
        };
        audio.onerror = () => {
          setPlaying(false);
          showAlert("adhan", prayer, "adhan.title", "adhan.playError", adhanTime);
        };
        showAlert("adhan", prayer, "adhan.title", "adhan.playingBody", adhanTime);
      } catch {
        showAlert("adhan", prayer, "adhan.title", "adhan.autoplayNote");
      }
    },
    [ensureAudio, showAlert, nativeCovers]
  );

  const fireReminder = useCallback(
    (prayer: PrayerId, time: Date) => {
      if (lockedRef.current && settingsRef.current.reminderSoundEnabled) playChime();
      // The pre-adhan reminder is NOT the daily ward reminder: `reminder.body`
      // takes {{n}}/{{from}}/{{to}} (ward page numbers), so reusing it here
      // rendered literal ward placeholders in the banner. `prayer.*` keys
      // take {{prayer}} and are the ones this alert actually means.
      showAlert("reminder", prayer, "prayer.reminderTitle", "prayer.reminderBody", time);
    },
    [playChime, showAlert]
  );

  const fireIqamaReminder = useCallback(
    (prayer: PrayerId, time: Date) => {
      if (lockedRef.current && settingsRef.current.reminderSoundEnabled) playChime();
      showAlert("iqamaReminder", prayer, "iqama.reminderTitle", "iqama.soonBody", time);
    },
    [playChime, showAlert]
  );

  const fireIqama = useCallback(
    (prayer: PrayerId, time: Date) => {
      showAlert("iqama", prayer, "iqama.title", "iqama.body", time);
    },
    [showAlert]
  );

  const testAdhan = useCallback(
    async (prayer?: PrayerId) => {
      const s = settingsRef.current;
      const sound = ADHAN_SOUNDS.find((x) => x.id === s.adhanSoundId) ?? ADHAN_SOUNDS[0];
      const audio = ensureAudio();
      audio.src = sound.url;
      audio.volume = 1;
      audio.onended = () => setPlaying(false);
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        showAlert("reminder", prayer ?? "fajr", "adhan.title", "adhan.autoplayNote");
      }
    },
    [ensureAudio, showAlert]
  );

  const testChime = useCallback(() => {
    playChime();
  }, [playChime]);

  /* ── Main ticker ── */
  useEffect(() => {
    const tick = () => {
      const s = settingsRef.current;
      const nowD = new Date();
      setNow(nowD);

      const dk = localDateKey(nowD);
      if (dk !== dayKeyRef.current) {
        dayKeyRef.current = dk;
      }

      const useCoords = { latitude: s.latitude, longitude: s.longitude };
      const { times, next: nx } = computeNextFromDay(nowD, useCoords, s.method, s.asr, nowD);
      /* The day's five timestamps only change when the day, the coordinates or
         the method change — not once per second. Publishing a fresh object each
         tick re-rendered every consumer 86,400 times a day and made the native
         scheduler effect re-sign and re-check its events on every tick. Only
         publish when the values actually differ. */
      const timesSig = PRAYERS_ADHAN.map((p) => times[p].getTime()).join(",");
      if (timesSig !== todaySigRef.current) {
        todaySigRef.current = timesSig;
        setToday(times);
        todayRef.current = times;
      }
      setNext(nx);
      const cur = getCurrentPrayer(times, nowD);
      setCurrent((prev) => (prev === cur ? prev : cur));
      if (!s.enabled) return;

      const nowTs = nowD.getTime();
      const dkToday = dayKeyRef.current;

      for (const p of PRAYERS_ADHAN) {
        const t = times[p].getTime();
        const prayerTime = times[p];

        if (s.adhanEnabled && firedAt(t, nowTs, dkToday, p, "adhan")) {
          void fireAdhan(p);
        }
        if (s.preAdhanReminderEnabled) {
          if (firedAt(t - s.preAdhanLeadMin * 60000, nowTs, dkToday, p, "pre")) {
            fireReminder(p, prayerTime);
          }
        }
        if (s.iqamaOffsetMin > 0) {
          const iqama = t + s.iqamaOffsetMin * 60000;
          const iqamaTime = new Date(iqama);
          if (s.iqamaReminderEnabled) {
            if (firedAt(iqama - s.iqamaReminderLeadMin * 60000, nowTs, dkToday, p, "iqamaReminder")) {
              fireIqamaReminder(p, iqamaTime);
            }
          }
          if (s.adhanEnabled && firedAt(iqama, nowTs, dkToday, p, "iqama")) {
            fireIqama(p, iqamaTime);
          }
        }
      }
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Native background support (Android app) ──
     The JS ticker above dies with a locked screen / killed app, so prayer
     events are ALSO scheduled as OS notifications (exact alarms, Doze-safe).
     Tapping an adhan notification re-opens the app and plays the adhan. */
  const fireAdhanRef = useRef(fireAdhan);
  useEffect(() => {
    fireAdhanRef.current = fireAdhan;
  }, [fireAdhan]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    void ensureNotificationPermission();
    void onAdhanNotificationTap((prayer) => {
      // App was (re-)opened from an adhan notification: play the adhan now.
      void fireAdhanRef.current(prayer);
    });
  }, []);

  const nativeSigRef = useRef<string>("");
  useEffect(() => {
    if (!isNativePlatform() || !today) return;
    const sig = prayerScheduleSignature(dayKeyRef.current, today, settings, coords);
    if (sig === nativeSigRef.current) return;
    nativeSigRef.current = sig;
    void schedulePrayerNotifications({
      times: today,
      settings,
      formatTime: (d: Date) => formatTime(d, getLocaleFromStorage() === "ar"),
    }).then((events) => {
      /* The OS notification will play the bundled adhan sound for these
         events — the app must NOT also play in-app audio (no double sound). */
      nativeCoveredRef.current = { native: true, events };
    });
  }, [today, settings, coords]);

  const value = useMemo<PrayerContextValue>(
    () => ({
      settings,
      updateSettings: (patch: Partial<PrayerSettings>) =>
        setSettings((prev) => ({ ...prev, ...patch })),
      coords,
      locationStatus,
      requestLocation,
      now,
      today,
      next,
      current,
      alert,
      dismissAlert,
      playing,
      testAdhan,
      testChime,
      stopPlayback,
    }),
    [
      settings,
      coords,
      locationStatus,
      requestLocation,
      now,
      today,
      next,
      current,
      alert,
      dismissAlert,
      playing,
      testAdhan,
      testChime,
      stopPlayback,
    ]
  );

  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

/* helper used by components for iqama calc */
export function iqamaOf(t: Date, offsetMin: number): Date {
  return new Date(t.getTime() + offsetMin * 60000);
}