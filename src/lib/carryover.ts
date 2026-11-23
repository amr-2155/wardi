/**
 * Unfinished-ward carryover — pure logic.
 *
 * A previous day's ward is "unfinished" when it was planned, partially read,
 * and never completed. Each such day is one `Reading` record keyed by date, so
 * its original date, planned range and amount already read are preserved. The
 * user's decision is stored on that same record, which gives us three
 * properties the old implicit rollover could not offer:
 *
 *   - nothing is silently merged into today (the record stays untouched),
 *   - a decision is made once and never counted twice (idempotent),
 *   - "postpone" is a real persisted state, not a discarded value.
 *
 * No new storage key: the fields ride on `ward:v2:history`, which backup,
 * reset and the registry already understand.
 */
import type { CarryoverChoice, Reading } from "./types";

export type UnfinishedWard = {
  id: string;
  date: string;
  khatma: number;
  /** Full planned range of that day's ward. */
  startPage: number;
  endPage: number;
  /** Pages actually confirmed read from that ward. */
  pagesRead: number;
  plannedPages: number;
  remaining: number;
  decision: CarryoverChoice | null;
  decisionDate: string | null;
  adjustedTarget: number | null;
};

/** Inclusive size of the ward that was planned for a day. */
export function plannedPagesOf(r: Reading): number {
  const start = r.plannedStart ?? r.startPage;
  const end = r.plannedEnd ?? r.endPage;
  const a = Math.max(1, Math.min(start, end));
  const b = Math.max(a, Math.max(start, end));
  return Math.max(1, b - a + 1);
}

/** Pages still owed on a day. Completed days owe nothing. */
export function remainingOf(r: Reading): number {
  if (r.completed) return 0;
  return Math.max(0, plannedPagesOf(r) - Math.max(0, r.pages));
}

const toUnfinished = (r: Reading): UnfinishedWard => ({
  id: r.id,
  date: r.date,
  khatma: r.khatma,
  startPage: r.plannedStart ?? r.startPage,
  endPage: r.plannedEnd ?? r.endPage,
  pagesRead: r.pages,
  plannedPages: plannedPagesOf(r),
  remaining: remainingOf(r),
  decision: r.carryoverDecision ?? null,
  decisionDate: r.carryoverDecisionDate ?? null,
  adjustedTarget: r.carryoverAdjustedTarget ?? null,
});

/** Every unfinished ward from previous days in one khatma, oldest first. */
export function unfinishedWards(
  history: readonly Reading[],
  today: string,
  khatma: number
): UnfinishedWard[] {
  return history
    .filter((r) => !r.completed && r.date < today && r.khatma === khatma && remainingOf(r) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toUnfinished);
}

export type CarryoverState = {
  /** Awaiting the user's choice — this is what the prompt card is about. */
  pending: UnfinishedWard[];
  /** Explicitly postponed but still safely stored. */
  postponed: UnfinishedWard[];
  /** Continue / add already chosen (kept for the review list). */
  resolved: UnfinishedWard[];
  all: UnfinishedWard[];
  pendingRemaining: number;
  postponedRemaining: number;
  /** Earliest original date still owed, for an honest "since" label. */
  oldestDate: string | null;
};

export function carryoverState(
  history: readonly Reading[],
  today: string,
  khatma: number
): CarryoverState {
  const all = unfinishedWards(history, today, khatma);
  const pending = all.filter((w) => w.decision === null);
  const postponed = all.filter((w) => w.decision === "postpone");
  const resolved = all.filter((w) => w.decision === "continue" || w.decision === "add");
  return {
    pending,
    postponed,
    resolved,
    all,
    pendingRemaining: pending.reduce((sum, w) => sum + w.remaining, 0),
    postponedRemaining: postponed.reduce((sum, w) => sum + w.remaining, 0),
    oldestDate: all.length > 0 ? all[0].date : null,
  };
}

export type CarryoverDecisionResult = {
  history: Reading[];
  changed: boolean;
  /** Pages added to today's target (0 unless the choice was "add"). */
  addedPages: number;
  /** The resulting target for today. */
  adjustedTarget: number;
};

/**
 * Apply one explicit decision to every still-unresolved unfinished ward.
 * Repeated calls are no-ops because a ward with a real decision is no longer
 * resolvable — the same pages can never be added twice.
 */
export function applyCarryoverDecision(params: {
  history: readonly Reading[];
  today: string;
  khatma: number;
  choice: CarryoverChoice;
  baseTarget: number;
  /** Continue handles one ward at a time (the oldest); add/postpone handle all. */
  onlyId?: string;
}): CarryoverDecisionResult {
  const { history, today, khatma, choice, baseTarget, onlyId } = params;
  const all = unfinishedWards(history, today, khatma);
  /* "Postpone" only touches brand-new debt. Continue/add may also upgrade a
     previously postponed ward if the user later changes their mind. */
  let targets = all.filter((w) =>
    choice === "postpone" ? w.decision === null : w.decision === null || w.decision === "postpone"
  );
  if (onlyId) {
    targets = targets.filter((w) => w.id === onlyId);
  }
  if (targets.length === 0) {
    return { history: [...history], changed: false, addedPages: 0, adjustedTarget: baseTarget };
  }
  const ids = new Set(targets.map((w) => w.id));
  const addedPages = choice === "add" ? targets.reduce((sum, w) => sum + w.remaining, 0) : 0;
  const adjustedTarget = Math.max(1, baseTarget) + addedPages;
  const next = history.map((r) =>
    ids.has(r.id)
      ? {
          ...r,
          carryoverDecision: choice,
          carryoverDecisionDate: today,
          ...(choice === "add" ? { carryoverAdjustedTarget: adjustedTarget } : {}),
        }
      : r
  );
  return { history: next, changed: true, addedPages, adjustedTarget };
}
