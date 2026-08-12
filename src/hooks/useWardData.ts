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

function applyThemeClass(theme: ThemeMode): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
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
  updateSetting: <K extends keyof WardSettings>(key: K, value: WardSettings[K]) => void;
  toggleAutoIncrease: () => void;
  setManualOverride: (pages: number) => void;
  clearManualOverride: () => void;
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

  const setTodayProgress = useCallback(
    (value: number) => {
      setProgress({ date: today, pages: Math.max(0, Math.min(value, dailyPages)) });
    },
    [today, dailyPages]
  );

  const changeProgress = useCallback(
    (delta: number) => {
      setProgress((prev) => {
        const base = prev && prev.date === today ? prev.pages : 0;
        return { date: today, pages: Math.max(0, Math.min(base + delta, dailyPages)) };
      });
    },
    [today, dailyPages]
  );

  const setProgressValue = useCallback(
    (value: number) => {
      setTodayProgress(value);
    },
    [setTodayProgress]
  );

  const completeToday = useCallback(() => {
    if (todayReading) return;
    const reading: Reading = {
      id: crypto.randomUUID(),
      date: today,
      khatma: settings.khatmaNumber,
      startPage,
      endPage,
      pages: dailyPages,
      completed: true,
      mode: settings.manualOverride && settings.manualOverride.date === today ? "manual" : "auto",
    };
    setHistory((prev) => [reading, ...prev]);
    setSettings((prev) => {
      const finished = endPage >= prev.totalPages;
      return {
        ...prev,
        currentPage: finished ? 1 : endPage + 1,
        khatmaNumber: finished ? prev.khatmaNumber + 1 : prev.khatmaNumber,
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
    updateSetting,
    toggleAutoIncrease,
    setManualOverride,
    clearManualOverride,
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
