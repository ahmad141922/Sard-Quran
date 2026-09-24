/**
 * Turning the page with a finger.
 *
 * Kept as one pure decision so the thresholds are testable and the gesture and
 * the buttons cannot drift apart: both end in the same `goToNextPage` /
 * `goToPreviousPage`.
 */

/**
 * How far the finger must travel before it counts as a page turn rather than a
 * tap that wobbled. Roughly a thumb's width on a phone: small enough to feel
 * responsive, far past the few pixels a tap moves.
 */
export const SWIPE_MIN_PX = 44;

/**
 * How much more horizontal than vertical the travel must be. A drag that is
 * mostly up or down is someone scrolling, not turning a page.
 */
export const SWIPE_DOMINANCE = 1.4;

/** Anything shorter than this is a tap, whatever it looks like. */
export const TAP_SLOP_PX = 10;

export type PageIntent = 'next' | 'previous' | null;

export interface SwipeOptions {
  minPx?: number;
  dominance?: number;
  /**
   * Which way the book runs. The muṣḥaf is right-to-left whatever the
   * interface language, and this app already puts the *next* page on the left:
   * the left edge turns forward and ArrowLeft moves forward. So dragging
   * rightwards pulls that next page in, and the rule is derived from the
   * book's direction rather than hard-coded to a screen side.
   */
  rtl?: boolean;
}

/**
 * What a completed drag means, if anything.
 *
 * Returns null for a tap, for a mostly-vertical drag, and for anything too
 * short to be deliberate.
 */
export function pageIntentOf(dx: number, dy: number, opts: SwipeOptions = {}): PageIntent {
  const minPx = opts.minPx ?? SWIPE_MIN_PX;
  const dominance = opts.dominance ?? SWIPE_DOMINANCE;
  const rtl = opts.rtl ?? true;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < minPx) return null;
  if (ax <= ay * dominance) return null;
  const forward = rtl ? dx > 0 : dx < 0;
  return forward ? 'next' : 'previous';
}

/** True while the pointer has not moved far enough to stop being a tap. */
export function isTap(dx: number, dy: number, slop = TAP_SLOP_PX): boolean {
  return Math.abs(dx) <= slop && Math.abs(dy) <= slop;
}
