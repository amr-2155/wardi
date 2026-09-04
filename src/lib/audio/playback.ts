/**
 * Pure verse-transition decisions for sequential surah playback.
 *
 * Extracted from the AudioProvider so the fail-stop contract is unit
 * testable without rendering React:
 * - A finished verse advances to the next index, or completes the surah.
 * - A failed verse is retried ONCE, then fail-stops. It is NEVER skipped:
 *   silently continuing to the next verse would alter the recitation.
 */

/**
 * Index of the next verse to play, or null when the surah is genuinely
 * complete (the just-finished verse was the last one).
 */
export function nextVerseIndex(
  trackCount: number,
  currentIndex: number
): number | null {
  const next = currentIndex + 1;
  return next < trackCount ? next : null;
}

export type VerseFailureOutcome = "retry-same" | "fail-stop";

/**
 * Decide what to do when a verse fails to load/play.
 * First failure → retry the SAME verse. Already retried → fail-stop
 * (save position for manual resume, do not advance).
 */
export function resolveVerseFailureOutcome(
  alreadyRetried: boolean
): VerseFailureOutcome {
  return alreadyRetried ? "fail-stop" : "retry-same";
}
