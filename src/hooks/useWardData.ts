"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, todayKey } from "@/lib/dates";
import {
  clearAllData,
  loadData,
  sanitizeHistory,
  sanitizeProgress,
  sanitizeSettings,
  saveData,
  toExportJSON,
} from "@/lib/storage";
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
  computeStreak,
  effectiveDailyPages,
  khatmaProgressPercent,
  nextIncreaseInfo,
  pageRange,
  type IncreaseInfo,
} from "@/lib/ward";
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
  importJSON: (text: string) => boolean;
};

export function useWardData(): WardData {
  const [settings, setSettings] = useState<WardSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<Reading[]>([]);
  const [progress, setProgress] = useState<DayProgress | null>(null);
  const [loaded, setLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- initial hydration-safe load from localStorage */
  useEffect(() => {
    const data = loadData();
    setSettings(data.settings);
    setHistory(data.history);
    setProgress(data.progress);
    setLoaded(true);
    applyThemeClass(data.settings.theme);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) return;
    saveData({ settings, history, progress });
  }, [settings, history, progress, loaded]);

  const today = useMemo(() => todayKey(), []);
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

  const todayProgress = useMemo(() => {
    if (!progress || progress.date !== today) return 0;
    return Math.min(Math.max(0, progress.pages), dailyPages);
  }, [progress, today, dailyPages]);

  const remainingPages = Math.max(0, dailyPages - todayProgress);
  const todayPercent = dailyPages > 0 ? Math.round((todayProgress / dailyPages) * 100) : 0;
  const isDone = todayProgress >= dailyPages;

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
  const streak = useMemo(() => computeStreak(completedDates, today), [completedDates, today]);
  const bestStreak = useMemo(() => computeBestStreak(completedDates), [completedDates]);
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
      const next = Math.max(0, Math.min(Math.floor(pages), dailyPages));
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
    [today, todayReading, dailyPages, startPage, settings]
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
      pages: dailyPages,
      completed: true,
      mode: settings.manualOverride && settings.manualOverride.date === today ? "manual" : "auto",
    };
    setHistory((prev) => upsertReading(prev, reading));
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
    setProgress({ date: today, pages: dailyPages });
  }, [todayReading, today, settings, startPage, endPage, dailyPages]);

  const undoLastReading = useCallback(() => {
    if (history.length === 0) return;
    const last = history[0];
    setHistory((prev) => prev.slice(1));
    setSettings((s) => ({
      ...s,
      currentPage: last.startPage,
      khatmaNumber:
        last.endPage >= s.totalPages && s.khatmaNumber > 1 ? s.khatmaNumber - 1 : s.khatmaNumber,
    }));
    if (progress && progress.date === last.date) setProgress(null);
  }, [history, progress]);

  const startNewKhatma = useCallback(() => {
    if (!window.confirm("هل تريد بدء ختمة جديدة والبدء من صفحة 1؟")) return;
    setSettings((prev) => ({
      ...prev,
      khatmaNumber: prev.khatmaNumber + 1,
      currentPage: 1,
    }));
    setProgress(null);
  }, []);

  const resetApp = useCallback(() => {
    if (!window.confirm("هل تريد حذف جميع بيانات الورد نهائيًا؟")) return;
    clearAllData();
    setSettings({ ...DEFAULT_SETTINGS });
    setHistory([]);
    setProgress(null);
    applyThemeClass(DEFAULT_SETTINGS.theme);
  }, []);

  const applyTheme = useCallback((theme: ThemeMode) => {
    applyThemeClass(theme);
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const exportJSON = useCallback(
    () => toExportJSON({ settings, history, progress }),
    [settings, history, progress]
  );

  const importJSON = useCallback((text: string): boolean => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const newSettings = sanitizeSettings(parsed.settings ?? parsed);
      const newHistory = sanitizeHistory(parsed.history);
      const newProgress = sanitizeProgress(parsed.progress);
      setSettings(newSettings);
      setHistory(newHistory);
      setProgress(newProgress);
      applyThemeClass(newSettings.theme);
      return true;
    } catch {
      return false;
    }
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
    importJSON,
  };
}
