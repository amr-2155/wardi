/**
 * Streak-freeze shields.
 *
 * Own localStorage key (same precedent as onboarding): `src/lib/userData.ts`
 * is hash-frozen, so new UI-chrome state must not join its registry. A shield
 * is earned per 7-day best streak (capped), and the hook auto-spends banked
 * shields on gap days via `planFreezeUse`.
 */

const KEY = "ward:v2:freezes:v1";
const MAX_BANKED = 3;

export function loadFreezeUsed(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { used?: unknown };
    return Array.isArray(parsed.used) ? parsed.used.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export function saveFreezeUsed(used: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ used }));
  } catch {
    /* Private-mode storage can throw; shields simply stop persisting. */
  }
}

/** Shields earned from the raw best streak, capped so they stay meaningful. */
export function earnedShields(bestStreak: number): number {
  return Math.min(MAX_BANKED, Math.floor(Math.max(0, bestStreak) / 7));
}
