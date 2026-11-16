/**
 * Dhikr tap feedback preferences (completion vibration + chime).
 *
 * Own localStorage key (userData.ts is hash-frozen, same precedent as
 * onboarding/freezes/dedications). Both default ON — the feature is the point,
 * and the toggles are one tap away in the adhkar list.
 *
 * This module also owns the feedback contract itself, because two very
 * different screens count dhikr (the recite flow and the card list) and they
 * must not drift into answering the same tap differently.
 *
 * The split is deliberate and comes from how a dhikr is actually recited:
 * - every repetition gets the soft tick, so counting stays audible without
 *   looking up from the page;
 * - only the LAST repetition gets the distinct resolution tone AND the
 *   vibration. Vibrating on all one hundred would rattle the phone for half a
 *   minute and wear the motor out for the one pulse that carries meaning.
 */

import { dhikrFinal } from "./haptics";
import { playDhikrFinal, playDhikrTap } from "./tick";

const KEY = "ward:v2:dhikr-feedback:v1";

export type DhikrFeedback = { sound: boolean; haptic: boolean };

const DEFAULTS: DhikrFeedback = { sound: true, haptic: true };

export function loadDhikrFeedback(): DhikrFeedback {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<DhikrFeedback>;
    return {
      sound: parsed.sound !== false,
      haptic: parsed.haptic !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDhikrFeedback(prefs: DhikrFeedback): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* Private-mode storage can throw; the toggles simply won't persist. */
  }
}

/**
 * The feedback for landing on a dhikr's last repetition.
 *
 * Called on the final tap only — never per repetition. Both channels are
 * independent so a user can keep the vibration (the useful one) and silence
 * the chime. The sound here is the *final* resolution, warmer and lower than
 * the per-tap tick, so the ear can tell "this one is the last" from "the
 * session is over" without looking at the screen.
 */
export function playCompletionFeedback(prefs: DhikrFeedback): void {
  if (prefs.haptic) dhikrFinal();
  if (prefs.sound) playDhikrFinal();
}

/**
 * One repetition of a counted dhikr. Audible only — soft and brief, so a
 * hundred repetitions feel like counting rather than like a phone rattling
 * inside a drawer. The vibration is reserved for the final repetition.
 */
export function playDhikrTapFeedback(prefs: DhikrFeedback): void {
  if (prefs.sound) playDhikrTap();
}
