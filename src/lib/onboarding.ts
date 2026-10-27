/**
 * First-launch onboarding state.
 *
 * Kept in its own localStorage key on purpose: `src/lib/storage.ts` owns the
 * ward dataset and is covered by app-data tests, while onboarding is pure UI
 * chrome that must never disturb the ward data shape.
 */

const KEY = "ward:v2:onboarding:v1";

export type OnboardingState = {
  seen: boolean;
  completedAt: string | null;
};

const EMPTY: OnboardingState = { seen: false, completedAt: null };

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      seen: parsed.seen === true,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function completeOnboarding(): OnboardingState {
  const next: OnboardingState = { seen: true, completedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private-mode storage can throw; the overlay simply shows again. */
  }
  return next;
}
