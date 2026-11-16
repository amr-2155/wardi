/**
 * Numeric input helpers, kept pure so the "clear the old value and type a new
 * one" behaviour can be tested without a DOM.
 *
 * The old `NumberField` was fully controlled: clearing the box immediately
 * wrote `min` back into the value, so the field repainted with "1" before the
 * user could type and the caret jumped. The fix is to let the field hold a
 * *draft string* while it is being edited and only commit parseable, in-range
 * values. These helpers are that policy; the component is just the shell.
 */

export type NumberBounds = {
  min?: number;
  max?: number;
};

/**
 * Parse a draft; null means "nothing committed yet" (empty, "-", "1.").
 *
 * `decimals` says how many fractional digits the field accepts. Coordinates
 * need them (24.7136), counters do not — and an integer field must not silently
 * round "1.5" into 2, so the precision is part of the parse, not of the
 * rounding that happens afterwards.
 */
export function parseNumberDraft(raw: string, decimals = 0): number | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  if (decimals > 0) {
    // A trailing "." is a legitimate half-typed draft ("24."), so it parses to
    // 24 instead of being rejected mid-keystroke.
    if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  } else if (!/^-?\d+$/.test(text)) {
    return null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Clamp into range; used on blur, never while typing. */
export function clampNumber(value: number, bounds: NumberBounds = {}): number {
  const min = bounds.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds.max ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  return Math.min(max, Math.max(min, value));
}

/** True when a parsed value is inside the allowed bounds. */
export function isInRange(value: number, bounds: NumberBounds = {}): boolean {
  if (bounds.min !== undefined && value < bounds.min) return false;
  if (bounds.max !== undefined && value > bounds.max) return false;
  return true;
}

/**
 * Decide what to commit while typing. Returns `undefined` when the draft is
 * incomplete or out of range, which tells the caller to leave the last valid
 * value untouched and keep the draft on screen.
 */
export function commitNumberDraft(
  raw: string,
  bounds: NumberBounds = {},
  decimals = 0
): number | undefined {
  const parsed = parseNumberDraft(raw, decimals);
  if (parsed === null) return undefined;
  if (!isInRange(parsed, bounds)) return undefined;
  return decimals > 0 ? Number(parsed.toFixed(decimals)) : Math.round(parsed);
}

/**
 * Resolve a draft on blur: parse if possible, clamp into range, and fall back
 * to the previous value when the box was left empty. Never returns NaN.
 */
export function resolveNumberDraft(
  raw: string,
  bounds: NumberBounds = {},
  fallback = 0,
  decimals = 0
): number {
  const parsed = parseNumberDraft(raw, decimals);
  const base = parsed === null ? fallback : parsed;
  const clamped = clampNumber(base, bounds);
  return decimals > 0 ? Number(clamped.toFixed(decimals)) : Math.round(clamped);
}
