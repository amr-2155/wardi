import { todayKey } from "./dates";

export type ThemeMode = "light" | "dark" | "system";

export type ManualOverride = {
  date: string;
  pages: number;
};

export type WardSettings = {
  currentPage: number;
  baseDailyPages: number;
  dailyPages: number;
  autoIncrease: boolean;
  increaseAmount: number;
  increaseEveryDays: number;
  increaseStartDate: string;
  khatmaIncreaseEnabled: boolean;
  khatmaIncreaseAmount: number;
  khatmaNumber: number;
  totalPages: number;
  theme: ThemeMode;
  notificationsEnabled: boolean;
  reminderTime: string;
  manualOverride: ManualOverride | null;
};

export type ReadingMode = "auto" | "manual";

export type Reading = {
  id: string;
  date: string;
  khatma: number;
  startPage: number;
  endPage: number;
  pages: number;
  completed: boolean;
  mode: ReadingMode;
};

export type DayProgress = {
  date: string;
  pages: number;
};

export type WardAppData = {
  settings: WardSettings;
  history: Reading[];
  progress: DayProgress | null;
};

export type WardDay = {
  date: string;
  ayahId: string;
  read: boolean;
  tadabburDone: boolean;
  deferred: boolean;
};

/** One tadabbur journal entry (per ayah, keeps the latest 100). */
export type TadabburJournalEntry = {
  ref: string;
  date: string;
  completedAt: string;
  appliedStep: boolean;
  personalNote: string;
};

export type TabId = "home" | "history" | "khatma" | "library" | "settings";
export type FullViewId = "reading" | "plan" | "stats" | "quran" | "ayah" | "mushaf";

export const DEFAULT_SETTINGS: WardSettings = {
  currentPage: 1,
  baseDailyPages: 25,
  dailyPages: 25,
  autoIncrease: true,
  increaseAmount: 1,
  increaseEveryDays: 14,
  increaseStartDate: todayKey(),
  khatmaIncreaseEnabled: false,
  khatmaIncreaseAmount: 1,
  khatmaNumber: 1,
  totalPages: 604,
  theme: "system",
  notificationsEnabled: false,
  reminderTime: "20:00",
  manualOverride: null,
};
