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

/** How the user chose to handle an unfinished ward day. */
export type CarryoverChoice = "continue" | "add" | "postpone";

export type Reading = {
  id: string;
  date: string;
  khatma: number;
  /** What was actually read today (may be narrower than the plan). */
  startPage: number;
  endPage: number;
  /**
   * The ward range planned for that day. Unlike `startPage`/`endPage` — which
   * shrink to the pages actually read — this is fixed when the ward is set, so
   * the reader always knows the full range it is counting against.
   */
  plannedStart?: number;
  plannedEnd?: number;
  pages: number;
  completed: boolean;
  mode: ReadingMode;
  /* ── Unfinished-ward carryover (optional, backward compatible) ──
     Stored on the day's own record so the original date, planned range and
     amount read are preserved. No separate key: backup/reset already cover
     history, and an old record without these fields simply has no decision. */
  carryoverDecision?: CarryoverChoice;
  /** Date on which the user made the decision. */
  carryoverDecisionDate?: string;
  /** Today's adjusted target when "add remainder" was chosen (provenance). */
  carryoverAdjustedTarget?: number;
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
export type FullViewId =
  | "reading"
  | "plan"
  | "stats"
  | "quran"
  | "ayah"
  | "mushaf"
  | "prayer"
  | "adhkar"
  | "niyyah"
  | "occasions";

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
