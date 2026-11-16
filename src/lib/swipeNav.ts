/**
 * Horizontal swipe → page navigation, as a pure decision function.
 *
 * Two screens ask the same question every time a finger leaves the glass
 * ("was that a page turn?"), so the rules live here instead of inside a touch
 * handler where they can drift: a tap must never turn a page, a vertical drag
 * must stay a scroll, and a drag that starts in the system gesture strip must
 * be ignored so Android's back gesture keeps working.
 *
 * The mapping is the RTL book order the reader sees: swiping LEFT (dx < 0)
 * uncovers the NEXT page, swiping RIGHT (dx > 0) goes back. The buttons call
 * the same `go()` with the same sign, so touch and buttons can never disagree.
 */

export type SwipeDirection = "next" | "prev";

export type SwipeInput = {
  /** Horizontal travel in CSS pixels (negative = the finger moved left). */
  dx: number;
  /** Vertical travel in CSS pixels. */
  dy: number;
  /** Where the gesture started, for the system-edge guard. */
  startX: number;
  /** Viewport width in CSS pixels. */
  viewportWidth: number;
  /** Minimum horizontal travel for a deliberate swipe. */
  minDistance?: number;
  /** Width of the system gesture strip on each edge. */
  edge?: number;
  /** How much more horizontal than vertical the gesture must be. */
  dominance?: number;
};

export const SWIPE_MIN_DISTANCE = 48;
export const SWIPE_EDGE = 24;
export const SWIPE_DOMINANCE = 1.4;

export function resolveSwipeNav({
  dx,
  dy,
  startX,
  viewportWidth,
  minDistance = SWIPE_MIN_DISTANCE,
  edge = SWIPE_EDGE,
  dominance = SWIPE_DOMINANCE,
}: SwipeInput): SwipeDirection | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  /* A tap, or a small wobble while pressing a button: not a page turn. */
  if (Math.abs(dx) < minDistance) return null;
  /* Vertical intent wins, so scrolling a long dhikr never flips the page. */
  if (Math.abs(dx) < Math.abs(dy) * dominance) return null;
  /* Android's back gesture lives on the screen edges; leaving it alone also
     stops the page turning while the user is swiping the system bar. */
  if (Number.isFinite(viewportWidth)) {
    if (startX <= edge || startX >= viewportWidth - edge) return null;
  }
  return dx < 0 ? "next" : "prev";
}
