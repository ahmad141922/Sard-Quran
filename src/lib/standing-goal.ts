/**
 * The goal the reciter set for themselves, kept between visits.
 *
 * Separate from `recitation-habit.ts`, which is pure and knows nothing about
 * storage: a streak is arithmetic over majālis and must stay testable without
 * a browser. This file is the one line of state the feature has.
 *
 * In localStorage, like the place tags and for the same reason: it is two
 * numbers, it belongs to this device, and a majlis must never wait on it.
 *
 * **Not** on a session, and not synced. A goal is something the reciter is
 * doing now, not a fact about a majlis that happened — writing it into the
 * session record would put a changeable intention inside an account of what
 * took place.
 */

import type { GoalPeriod, StandingGoal } from './recitation-habit';

const KEY = 'tajweedoo:standing-goal';

const PERIODS: GoalPeriod[] = ['day', 'week', 'month'];

/** What the tool offers rather than a free number: a page, a ḥizb, a juzʾ. */
export const GOAL_PRESETS: { ayahs: number; period: GoalPeriod }[] = [
  { ayahs: 15, period: 'day' },
  { ayahs: 100, period: 'week' },
  { ayahs: 200, period: 'month' },
];

/**
 * The goal, or null where none was set.
 *
 * Null is the resting state and is not a nag: somebody reviewing without a
 * target is doing nothing wrong, and the panel simply offers one.
 */
export function standingGoal(): StandingGoal | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StandingGoal>;
    const ayahs = Number(parsed.ayahs);
    const period = parsed.period;
    // A stored value from a future version, or one somebody edited by hand,
    // reads as no goal rather than as a broken one.
    if (!Number.isFinite(ayahs) || ayahs <= 0) return null;
    if (!period || !PERIODS.includes(period)) return null;
    return { ayahs: Math.round(ayahs), period };
  } catch {
    return null;
  }
}

export function setStandingGoal(goal: StandingGoal | null): void {
  try {
    if (!goal) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(goal));
  } catch {
    // A private window, or storage that is full. The majlis carries on.
  }
}
