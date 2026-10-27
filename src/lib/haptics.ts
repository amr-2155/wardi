/**
 * Celebration haptics (Web Vibration API only — no plugins).
 *
 * Centralizes every `navigator.vibrate` call so the pattern vocabulary stays
 * consistent and a device without a vibrator (or a throwing WebView) never
 * breaks the flow that triggered it.
 *
 * There is deliberately no short per-tap tick any more. A dhikr counted to 100
 * fires the vibrator 100 times inside a few seconds, which is exactly the
 * buzzing rattle that made counting unpleasant; the pulse is now reserved for
 * the last repetition, where it carries information instead of noise.
 */

function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* Older WebViews can throw on vibrate; never break the caller. */
  }
}

/**
 * Last repetition of a counted dhikr: three pulses that swell, so it reads as
 * one deliberate "done" rather than a single blip lost in the hand. Timing is
 * the Web Vibration API's [vibrate, pause, ...] shape, in milliseconds.
 */
export function dhikrFinal(): void {
  buzz([18, 55, 28, 55, 46]);
}

/**
 * One repetition of a counted dhikr: a single, short pulse. It is deliberately
 * soft and brief — a hundred repetitions must feel like counting, not like a
 * phone rattling inside a drawer.
 */
export function dhikrTap(): void {
  buzz(12);
}

/** Ward completed: warm triple pulse. */
export function celebrateWard(): void {
  buzz([25, 40, 25]);
}

/** Khatma completed: longer fanfare. */
export function celebrateKhatma(): void {
  buzz([40, 60, 40, 60, 80]);
}
