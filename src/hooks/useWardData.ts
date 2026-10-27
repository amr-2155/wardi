"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, msUntilNextMidnight, todayKey } from "@/lib/dates";
import { clearAllData, loadData, saveData } from "@/lib/storage";
import { reminderSignature } from "@/lib/reminderTime";
import {
  scheduleWardReminder,
  ensureReminderForToday,
  type ReminderStatus,
} from "@/lib/wardReminder";
import {
  applyBackup,
  createBackup,
  parseBackup,
  type ImportPlan,
  type ImportResult,
} from "@/lib/backup";
import {
  DEFAULT_SETTINGS,
  type DayProgress,
  type ManualOverride,
  type Reading,
  type ReadingMode,
  type ThemeMode,
  type WardSettings,
} from "@/lib/types";
import {
  computeBestStreak,
  effectiveDailyPages,
  khatmaProgressPercent,
  nextIncreaseInfo,
  pageRange,
  planFreezeUse,
  wardPagesAvailable,
  type IncreaseInfo,
} from "@/lib/ward";
import { earnedShields, loadFreezeUsed, saveFreezeUsed } from "@/lib/freezes";
import { applyAccentClass, loadAccent } from "@/lib/accent";
import {
  compensationPlan,
  wardRollover,
  type CompensationPlan,
  type WardRolloverInfo,
} from "@/lib/quran/progress";

function applyThemeClass(theme: ThemeMode): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * History is the single record of what was read on a day: there is at most one
 * entry per date, so a partial day is upgraded in place instead of duplicated.
 */
function upsertReading(prev: Reading[], reading: Reading): Reading[] {
  const idx = prev.findIndex((item) => item.date === reading.date);
  if (idx < 0) return [reading, ...prev];
  const next = [...prev];
  next[idx] = reading;
  return next;
}

export type WardData = {
  loaded: boolean;
  settings: WardSettings;
  history: Reading[];
  today: string;
  todayReading: Reading | undefined;
  todayProgress: number;
  startPage: number;
  dailyPages: number;
  /**
   * Pages that genuinely exist in today's ward. On the final khatma day the
   * remaining mushaf is shorter than the scheduled ward, so this is the
   * honest denominator for progress, completion and the recorded page count.
   */
  todayPages: number;
  endPage: number;
  remainingPages: number;
  todayPercent: number;
  isDone: boolean;
  tomorrowStart: number;
  tomorrowEnd: number;
  tomorrowPages: number;
  khatmaPercent: number;
  streak: number;
  bestStreak: number;
  /** Unspent streak-freeze shields (earned per 7-day best streak, max 3). */
  shieldsLeft: number;
  totalRead: number;
  totalDays: number;
  weekRead: number;
  increaseInfo: IncreaseInfo | null;
  /** Pages owed from previous unsettled days (null when nothing is owed). */
  backlog: WardRolloverInfo | null;
  /** Suggested catch-up pace derived from the backlog. */
  catchUp: CompensationPlan | null;
  updateSetting: <K extends keyof WardSettings>(key: K, value: WardSettings[K]) => void;
  toggleAutoIncrease: () => void;
  setManualOverride: (pages: number) => void;
  clearManualOverride: () => void;
  setTodayWard: (from: number, pages: number) => void;
  changeProgress: (delta: number) => void;
  setProgressValue: (value: number) => void;
  completeToday: () => void;
  undoLastReading: () => void;
  startNewKhatma: () => void;
  resetApp: () => void;
  applyTheme: (theme: ThemeMode) => void;
  exportJSON: () => string;
  /**
   * Phase 1 of import: parse + validate. Pure, never writes. Returns a plan
   * the UI can show for confirmation, or a typed rejection.
   */
  previewImport: (text: string) => ImportResult;
  /**
   * Phase 2: apply a previously validated plan. This is the only import path
   * that writes, and it refuses anything that did not come from previewImport.
   */
  confirmImport: (result: ImportResult) => boolean;
  /** User-data keys that survived the last reset; empty means a clean state. */
  residueAfterReset: string[];
  /** What the OS actually did with the reminder last. Never optimistic. */
  reminderStatus: ReminderStatus;
  /** Re-apply after a permission grant or a settings change. */
  rescheduleReminder: () => void;
};

export function useWardData(): WardData {
  const [settings, setSettings] = useState<WardSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<Reading[]>([]);
  const [progress, setProgress] = useState<DayProgress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState<string>(todayKey());
  const [residueAfterReset, setResidueAfterReset] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect -- initial hydration-safe load from localStorage */
  useEffect(() => {
    const data = loadData();
    setSettings(data.settings);
    setHistory(data.history);
    setProgress(data.progress);
    setLoaded(true);
    applyThemeClass(data.settings.theme);
    applyAccentClass(loadAccent());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Live system theme.
     `applyThemeClass` reads the media query once per call, so on "system" the
     app kept the class it computed at mount: flipping the phone between light
     and dark changed nothing until some other state change re-ran it. Subscribe
     so the OS setting takes effect immediately, and only while it is the
     setting that is actually in force. */
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeClass("system");
    /* Safari < 14 and some embedded WebViews only have the deprecated form. */
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [settings.theme]);

  /* Live date rollover.
     The active day used to be captured once at mount, so a session left open
     across midnight kept writing to yesterday: today's ring reset never
     happened, streaks read the wrong day, and a read could be filed under a
     stale date. Three triggers cover the real cases:
       - an exact timer at the next local midnight (foreground, precise),
       - visibilitychange (the OS woke a backgrounded app),
       - focus/pageshow (the user came back to the tab).
     The setter is identity-stable when the day has not changed, so an extra
     trigger firing costs no re-render and no duplicate write. */
  /* Day rollover.
     The active day used to be captured once at mount, so a session left open
     across midnight kept writing to yesterday: today's ring reset never
     happened, streaks read the wrong day, and a read could be filed under a
     stale date. Three triggers cover the real cases:
       - an exact timer at the next local midnight (foreground, precise),
       - visibilitychange (the OS woke a backgrounded app),
       - focus/pageshow (the user came back to the tab).
     The setter is identity-stable when the day has not changed, so an extra
     trigger firing costs no re-render and no duplicate write. */
  useEffect(() => {
    if (!loaded) return;

    /* The ward reminder is armed as a ONE-SHOT `{ at }` alarm, so it fires
       once and is then gone. Nothing on the OS re-arms it for the next day:
       the plugin only re-arms genuinely repeating schedules (`on`/`every`).
       That left `ensureReminderForToday` with zero call sites, so a user who
       simply did not open the app on the following day got no reminder at all.

       Reconciling the schedule belongs to THIS effect, not to a new one. This
       already owns the only day-boundary signal in the app, and
       `reconcileDayRef` records which day the schedule was last armed for --
       which makes it strictly a subset of `today`: its identity cannot change
       while the day is unchanged, so a repeated focus/visibility/pageshow
       event (all of which call `sync()`) can never trigger a second
       `LocalNotifications.schedule()` call for the same day.

       Day state still advances through `setToday` exactly as before, so this
       is the same lifecycle mechanism, not a parallel one. */
    const reconcileDayRef = { current: null as string | null };

    const reconcileReminderForDay = (day: string) => {
      if (reconcileDayRef.current === day) return;
      reconcileDayRef.current = day;
      /* Deliberately rebuilt from the same primitives the scheduler effect
         uses, so the re-armed notification carries the SAME body it would
         have had if the app had been opened on this day normally. No new
         persisted values, no duplicated derivation logic worth maintaining. */
      const pages = wardPagesAvailable(
        Math.min(settings.totalPages, Math.max(1, settings.currentPage)),
        effectiveDailyPages(settings, day),
        settings.totalPages
      );
      const from = Math.min(settings.totalPages, Math.max(1, settings.currentPage));
      const to = pageRange(from, pages, settings.totalPages).end;
      void ensureReminderForToday({
        enabled: settings.notificationsEnabled,
        time: settings.reminderTime,
        pages,
        fromPage: from,
        toPage: to,
        doneToday: false,
      });
    };

    const sync = () => {
      const next = todayKey();
      reconcileReminderForDay(next);
      setToday((prev) => (prev === next ? prev : next));
    };

    let timer: ReturnType<typeof setTimeout> | undefined;

    const armMidnightTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        sync();
        armMidnightTimer();
      }, msUntilNextMidnight());
    };

    const onWake = () => {
      sync();
      armMidnightTimer();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") onWake();
    };

    armMidnightTimer();
    sync();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
    /* `today` is intentionally NOT a dependency: it changes every midnight
       and would tear the whole listener set down and rebuild it. `sync()`
       re-arms on the actual day change, which is what this effect is for.
       `settings` is read through a ref-free closure on purpose -- the only
       fields that matter (enabled/time) are already re-read by the scheduler
       effect, and adding them here would re-add listeners on every setting
       edit. Lint is disabled for the line rather than worked around, because
       the closure deliberately reads the latest committed settings via the
       render that installed these listeners. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    void saveData({ settings, history, progress });
  }, [settings, history, progress, loaded]);

  const todayReading = useMemo(
    () => history.find((item) => item.date === today),
    [history, today]
  );

  const dailyPages = useMemo(() => effectiveDailyPages(settings, today), [settings, today]);
  const startPage = Math.min(settings.totalPages, Math.max(1, settings.currentPage));
  const range = useMemo(() => pageRange(startPage, dailyPages, settings.totalPages), [
    startPage,
    dailyPages,
    settings.totalPages,
  ]);
  const endPage = range.end;

  /* Real pages available in today's ward.
     On the final khatma day the mushaf runs out before the scheduled ward does,
     so `dailyPages` overstates what can actually be read. Using the scheduled
     number as the denominator made the final day impossible to complete (ring
     stuck below 100%) and made completeToday record pages never read. */
  const todayPages = wardPagesAvailable(startPage, dailyPages, settings.totalPages);

  const todayProgress = useMemo(() => {
    if (!progress || progress.date !== today) return 0;
    return Math.min(Math.max(0, progress.pages), todayPages);
  }, [progress, today, todayPages]);

  const remainingPages = Math.max(0, todayPages - todayProgress);
  const todayPercent = todayPages > 0 ? Math.round((todayProgress / todayPages) * 100) : 0;
  const isDone = todayProgress >= todayPages;

  const tomorrow = addDays(today, 1);
  const tomorrowPages = effectiveDailyPages(settings, tomorrow);
  const tomorrowRange = pageRange(range.next, tomorrowPages, settings.totalPages);

  const khatmaPercent = useMemo(
    () => khatmaProgressPercent(settings.currentPage, settings.totalPages),
    [settings.currentPage, settings.totalPages]
  );

  const completedDates = useMemo(
    () => new Set(history.filter((item) => item.completed).map((item) => item.date)),
    [history]
  );
  const bestStreak = useMemo(() => computeBestStreak(completedDates), [completedDates]);
  /* Streak-freeze shields: earned from the raw best streak, auto-spent on gap
     days by the pure planner. `computeStreak` (lib/ward.ts) stays untouched as
     the tested raw baseline; the displayed streak is the shield-adjusted one. */
  const [freezeUsed, setFreezeUsed] = useState<string[]>(() => loadFreezeUsed());
  const freezeBanked = earnedShields(bestStreak);
  const freezePlan = useMemo(
    () =>
      planFreezeUse(
        completedDates,
        today,
        Math.max(0, freezeBanked - freezeUsed.length)
      ),
    [completedDates, today, freezeBanked, freezeUsed]
  );
  const streak = freezePlan.streak;
  const shieldsLeft = Math.max(0, freezeBanked - freezeUsed.length - freezePlan.useDates.length);
  /* Persist newly consumed shields. Terminates: after the save, the plan
     recomputes with the same gap set already marked used, so no new dates
     appear and the effect goes quiet. */
  /* eslint-disable react-hooks/set-state-in-effect -- persistence, not derivation */
  useEffect(() => {
    const fresh = freezePlan.useDates.filter((d) => !freezeUsed.includes(d));
    if (fresh.length === 0) return;
    const next = [...freezeUsed, ...fresh];
    saveFreezeUsed(next);
    setFreezeUsed(next);
  }, [freezePlan, freezeUsed]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const totalDays = completedDates.size;
  const totalRead = useMemo(
    () => history.reduce((sum, item) => sum + (item.completed ? item.pages : 0), 0),
    [history]
  );
  const weekRead = useMemo(() => {
    const weekStart = addDays(today, -6);
    return history
      .filter((item) => item.completed && item.date >= weekStart && item.date <= today)
      .reduce((sum, item) => sum + item.pages, 0);
  }, [history, today]);

  const increaseInfo = useMemo(() => nextIncreaseInfo(settings, today), [settings, today]);

  /* Backlog: days scheduled before today that were never completed. Scanning
     stops at the oldest recorded day (or the plan start on a fresh install) so
     a new user is never charged a year of debt. Partial pages already read on
     those days are credited back through readFor(). */
  const backlog = useMemo(() => {
    const firstRecorded = history.reduce<string | null>(
      (min, item) => (min === null || item.date < min ? item.date : min),
      null
    );
    const floor = firstRecorded ?? settings.increaseStartDate;
    if (floor > today) return null;
    const info = wardRollover({
      completedDates: [...completedDates],
      skippedDates: [],
      today,
      pagesFor: (day) => effectiveDailyPages(settings, day),
      readFor: (day) => history.find((item) => item.date === day)?.pages ?? 0,
      minDate: floor,
    });
    return info.remainingPages > 0 ? info : null;
  }, [completedDates, history, settings, today]);

  const catchUp = useMemo(
    () => (backlog ? compensationPlan(backlog.remainingPages, dailyPages) : null),
    [backlog, dailyPages]
  );

  /* Reading reminder (W1/B1).
     `notificationsEnabled` and `reminderTime` were persisted and displayed but
     never read, so the toggle did nothing. This is the consumer. The signature
     guard makes it re-schedule only on a real change, so the midnight rollover
     and repeated focus/resume events cannot stack duplicate alarms. The
     reported status is whatever the OS actually returned. */
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>("cancelled");
  const appliedSignature = useRef<string | null>(null);

  const applyReminder = useCallback(
    async (force = false) => {
      const signature = reminderSignature({
        enabled: settings.notificationsEnabled,
        time: settings.reminderTime,
        pages: todayPages,
        fromPage: startPage,
        toPage: endPage,
        doneToday: isDone,
      });
      if (!force && appliedSignature.current === signature) return;
      appliedSignature.current = signature;
      const result = await scheduleWardReminder({
        enabled: settings.notificationsEnabled,
        time: settings.reminderTime,
        pages: todayPages,
        fromPage: startPage,
        toPage: endPage,
        doneToday: isDone,
      });
      setReminderStatus(result.status);
    },
    [settings.notificationsEnabled, settings.reminderTime, todayPages, startPage, endPage, isDone]
  );

  useEffect(() => {
    if (!loaded) return;
    void applyReminder(false);
  }, [loaded, applyReminder]);

  const rescheduleReminder = useCallback(() => {
    void applyReminder(true);
  }, [applyReminder]);

  const updateSetting = useCallback(
    <K extends keyof WardSettings>(key: K, value: WardSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "theme") applyThemeClass(value as ThemeMode);
        return next;
      });
    },
    []
  );

  const toggleAutoIncrease = useCallback(() => {
    setSettings((prev) => {
      if (prev.autoIncrease) {
        return { ...prev, autoIncrease: false, dailyPages: effectiveDailyPages(prev, today) };
      }
      return { ...prev, autoIncrease: true, baseDailyPages: Math.max(1, prev.dailyPages) };
    });
  }, [today]);

  const setManualOverride = useCallback(
    (pages: number) => {
      setSettings((prev) => ({
        ...prev,
        manualOverride: { date: today, pages: Math.max(1, pages) } satisfies ManualOverride,
      }));
    },
    [today]
  );

  const clearManualOverride = useCallback(() => {
    setSettings((prev) => ({ ...prev, manualOverride: null }));
  }, []);

  const setTodayWard = useCallback(
    (from: number, pages: number) => {
      const to = Math.min(settings.totalPages, from + pages - 1);
      const count = Math.max(1, to - from + 1);
      setHistory((prev) => {
        const entry: Reading = {
          id: today,
          date: today,
          khatma: settings.khatmaNumber,
          startPage: from,
          endPage: to,
          // 0 pages: this reserves the day's ward, it does not record reading.
          // backlog's readFor() reads this field, so a planned-but-unread day
          // must not cancel the debt it owes. recordToday fills it in.
          pages: 0,
          completed: false,
          mode: "manual",
        };
        const idx = prev.findIndex((e) => e.date === today);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [entry, ...prev];
      });
      setProgress({ date: today, pages: 0 });
      setSettings((prev) => ({
        ...prev,
        currentPage: from,
        dailyPages: count,
        autoIncrease: false,
        manualOverride: null,
      }));
    },
    [today, settings],
  );

  /* The one write path for "pages read today". It keeps the progress ring and
     the history entry in lockstep, so partial reading is persisted instead of
     living only in the ring and vanishing when the day is left unfinished. */
  const recordToday = useCallback(
    (pages: number) => {
      // Guarded here so EVERY entry point (delta and absolute) shares it: a
      // settled day is never silently downgraded back to a partial entry.
      if (todayReading?.completed) return;
      if (!Number.isFinite(pages)) return;
      // Clamp to the pages that actually exist today, not the scheduled ward,
      // so a final-day read cannot record pages past the end of the mushaf.
      const next = Math.max(0, Math.min(Math.floor(pages), todayPages));
      setProgress({ date: today, pages: next });
      const mode: ReadingMode =
        settings.manualOverride && settings.manualOverride.date === today ? "manual" : "auto";
      setHistory((prev) => {
        if (next === 0) return prev.filter((item) => item.date !== today);
        return upsertReading(prev, {
          id: prev.find((item) => item.date === today)?.id ?? today,
          date: today,
          khatma: settings.khatmaNumber,
          startPage,
          endPage: Math.min(settings.totalPages, startPage + next - 1),
          pages: next,
          completed: false,
          mode,
        });
      });
    },
    [today, todayReading, todayPages, startPage, settings]
  );

  const setTodayProgress = useCallback(
    (value: number) => {
      recordToday(value);
    },
    [recordToday]
  );

  const changeProgress = useCallback(
    (delta: number) => {
      if (!Number.isFinite(delta) || delta === 0) return;
      // History is the source of truth once today's entry exists; the progress
      // ring is only a fallback. Deriving from the ring alone would clobber
      // already-recorded partial pages if the two keys ever diverge.
      const base = todayReading
        ? todayReading.pages
        : progress && progress.date === today
          ? progress.pages
          : 0;
      recordToday(base + delta);
    },
    [progress, todayReading, today, recordToday]
  );

  const setProgressValue = useCallback(
    (value: number) => {
      setTodayProgress(value);
    },
    [setTodayProgress]
  );

  const completeToday = useCallback(() => {
    // Only a day that is ALREADY completed blocks re-completion. An existing
    // incomplete entry (from partial reading or setTodayWard) is upgraded here
    // rather than silently short-circuiting the completion.
    if (todayReading?.completed) return;
    const reading: Reading = {
      id: todayReading?.id ?? today,
      date: today,
      khatma: settings.khatmaNumber,
      startPage,
      endPage,
      // todayPages, not dailyPages: on the final khatma day the ward is
      // truncated by the end of the mushaf, and recording the scheduled number
      // inflated totalRead, averages and the khatma summary.
      pages: todayPages,
      completed: true,
      mode: settings.manualOverride && settings.manualOverride.date === today ? "manual" : "auto",
    };
    setHistory((prev) => upsertReading(prev, reading));
    // Record the exact settings delta so undo can reverse it precisely.
    setSettings((prev) => {
      const finished = endPage >= prev.totalPages;
      const bump = finished && prev.khatmaIncreaseEnabled && prev.khatmaIncreaseAmount > 0
        ? prev.khatmaIncreaseAmount
        : 0;
      return {
        ...prev,
        currentPage: finished ? 1 : endPage + 1,
        khatmaNumber: finished ? prev.khatmaNumber + 1 : prev.khatmaNumber,
        baseDailyPages: finished && prev.autoIncrease ? prev.baseDailyPages + bump : prev.baseDailyPages,
        dailyPages: finished && !prev.autoIncrease ? prev.dailyPages + bump : prev.dailyPages,
      };
    });
    setProgress({ date: today, pages: todayPages });
  }, [todayReading, today, settings, startPage, endPage, todayPages]);

  const undoLastReading = useCallback(() => {
    if (history.length === 0) return;
    const last = history[0];
    setHistory((prev) => prev.slice(1));
    setSettings((s) => {
      // completeToday bumps the ward when it closes a khatma. Undoing that day
      // has to take the bump back, or the plan silently drifts upward on every
      // undo/redo cycle. The condition mirrors completeToday exactly.
      const closedKhatma = last.endPage >= s.totalPages;
      const bump =
        closedKhatma && s.khatmaIncreaseEnabled && s.khatmaIncreaseAmount > 0
          ? s.khatmaIncreaseAmount
          : 0;
      return {
        ...s,
        currentPage: last.startPage,
        khatmaNumber:
          closedKhatma && s.khatmaNumber > 1 ? s.khatmaNumber - 1 : s.khatmaNumber,
        baseDailyPages: s.autoIncrease
          ? Math.max(1, s.baseDailyPages - bump)
          : s.baseDailyPages,
        dailyPages: !s.autoIncrease ? Math.max(1, s.dailyPages - bump) : s.dailyPages,
      };
    });
    if (progress && progress.date === last.date) setProgress(null);
  }, [history, progress]);

  const startNewKhatma = useCallback(() => {
    if (!window.confirm("هل تريد بدء ختمة جديدة والبدء من صفحة 1؟")) return;
    if (!window.confirm("سيتم إنهاء الختمة الحالية. هل أنت متأكد؟")) return;

    // Capture the abandoned khatma in history before the position is lost.
    // Without this, restarting mid-khatma erased the record of everything
    // already read in it. Never clobbers a real entry for today: a day the
    // user actually read keeps its own record.
    const reached = Math.max(0, Math.min(settings.currentPage - 1, settings.totalPages));
    if (reached > 0 && !history.some((item) => item.date === today)) {
      setHistory((h) => [
        {
          id: today,
          date: today,
          khatma: settings.khatmaNumber,
          startPage: 1,
          endPage: reached,
          pages: reached,
          // Closed, not read: the canonical semantics count only completed
          // days toward the streak and totalRead, so an abandoned khatma must
          // not fake a perfect day.
          completed: false,
          mode: "manual" as const,
        },
        ...h,
      ]);
    }

    setSettings((prev) => ({
      ...prev,
      khatmaNumber: prev.khatmaNumber + 1,
      currentPage: 1,
    }));
    setProgress(null);
  }, [settings, history, today]);

  const resetApp = useCallback(() => {
    if (!window.confirm("هل تريد حذف جميع بيانات الورد نهائيًا؟")) return;
    if (!window.confirm("سيتم حذف كل بياناتك المحفوظة على هذا الجهاز نهائيًا. لا يمكن التراجع.")) {
      return;
    }
    const leftover = clearAllData();
    setSettings({ ...DEFAULT_SETTINGS });
    setHistory([]);
    setProgress(null);
    applyThemeClass(DEFAULT_SETTINGS.theme);
    // Surfaced so the UI (and tests) can assert the reset really reached a
    // clean state instead of assuming it did.
    setResidueAfterReset([...leftover.userData, ...leftover.regenerable]);
  }, []);

  const applyTheme = useCallback((theme: ThemeMode) => {
    applyThemeClass(theme);
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const exportJSON = useCallback(
    () => createBackup({ settings, history, progress }),
    [settings, history, progress]
  );

  /** Phase 1 — validate only. Performs no writes. */
  const previewImport = useCallback((text: string): ImportResult => parseBackup(text), []);

  /** Phase 2 — the only import path that writes. */
  const confirmImport = useCallback((result: ImportResult): boolean => {
    if (!result || result.ok !== true) return false;
    const plan: ImportPlan = result;
    applyBackup(plan);
    setSettings(plan.settings);
    setHistory(plan.history);
    setProgress(plan.progress);
    applyThemeClass(plan.settings.theme);
    return true;
  }, []);

  return {
    loaded,
    settings,
    history,
    today,
    todayReading,
    todayProgress,
    startPage,
    dailyPages,
    todayPages,
    endPage,
    remainingPages,
    todayPercent,
    isDone,
    tomorrowStart: tomorrowRange.start,
    tomorrowEnd: tomorrowRange.end,
    tomorrowPages,
    khatmaPercent,
    streak,
    bestStreak,
    shieldsLeft,
    totalRead,
    totalDays,
    weekRead,
    increaseInfo,
    backlog,
    catchUp,
    updateSetting,
    toggleAutoIncrease,
    setManualOverride,
    clearManualOverride,
    setTodayWard,
    changeProgress,
    setProgressValue,
    completeToday,
    undoLastReading,
    startNewKhatma,
    resetApp,
    applyTheme,
    exportJSON,
    previewImport,
    confirmImport,
    residueAfterReset,
    reminderStatus,
    rescheduleReminder,
  };
}
