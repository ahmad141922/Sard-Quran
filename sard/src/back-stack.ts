/**
 * What Android's back button closes, and in which order.
 *
 * A WebView answers back by destroying the app. The shell answers it instead by
 * closing whatever is open, one layer at a time, and only a press with nothing
 * left to close reaches the system — which minimises rather than exits, so a
 * majlis is still there on return.
 *
 * The order lives here, on its own, for two reasons. The first is that it is a
 * fact about the screen rather than about any one panel, and it was previously
 * spelled out as a run of `if`s inside a listener registered once — where a
 * layer added later is simply forgotten, which is exactly what happened to the
 * progress screen and to all three matn panels. A missing layer is worse than
 * no handler at all: the press does the system's thing, the app disappears, and
 * the panel the reciter meant to dismiss is still there when they come back.
 * The second is that a list is testable and a closure over React state is not.
 *
 * Two deliberate omissions:
 *
 *   the majlis itself   `session` is here and closing it means *minimising* —
 *                       returning to the home screen with the session still
 *                       running. Ending one is a decision, never the residue of
 *                       a gesture.
 *
 *   a matn in progress  not in the list at all. It has no card on the home
 *                       screen to come back through, so closing it would strand
 *                       a session that cannot be reopened. Back there minimises
 *                       the app, and the matn is where it was on return.
 *
 * A screen that raises panels of its own — the muṣḥaf reader's index, the
 * majlis's detail dialog — answers first, through the ref they register into.
 * This list only knows about the layers this screen itself owns.
 */

/** The layers the home screen can raise, named. */
export type SardLayer =
  | 'reading'
  | 'report'
  | 'matnReport'
  | 'setup'
  | 'matnSetup'
  | 'progress'
  | 'session';

/**
 * Topmost first — the stacking order, not the order they were written.
 *
 * The two reports sit above their own setups because a report is opened *from*
 * a session and a setup is not; `session` is last because everything else is
 * raised over it.
 */
export const BACK_ORDER: readonly SardLayer[] = [
  'reading', 'report', 'matnReport', 'setup', 'matnSetup', 'progress', 'session',
] as const;

/** Which layer a back press should close, or null when there is none. */
export function layerToClose(open: Partial<Record<SardLayer, boolean>>): SardLayer | null {
  return BACK_ORDER.find(layer => open[layer]) ?? null;
}
