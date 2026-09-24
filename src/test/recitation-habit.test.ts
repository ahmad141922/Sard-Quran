import { describe, it, expect } from 'vitest';

import {
  PERIOD_DAYS, dayKey, goalProgress, recitedAnything, recitingDays, startOfDay, streakOf,
  windowFrom, type StandingGoal,
} from '@/lib/recitation-habit';
import type { RecitationSession } from '@/lib/recitation-session';

/**
 * A streak and a standing goal, read off majālis that already happened.
 *
 * The tests worth reading are the ones about what does **not** count: an app
 * opened and closed is not a day, and a today that has not happened yet does
 * not end a run.
 */

const NOON = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();

/** A majlis on a day, having recited `ayahs` verses. */
const majlis = (at: number, ayahs = 10): RecitationSession => ({
  startedAt: at,
  covered: ayahs > 0 ? [[1, ayahs]] : [],
} as never);

describe('what counts as a day', () => {
  it('is a majlis that recited something', () => {
    expect(recitedAnything(majlis(NOON(2026, 8, 31), 5))).toBe(true);
  });

  /** Opening the tool is not a day. A count of that is a count about the app. */
  it('is not a session that never reached a verse', () => {
    expect(recitedAnything(majlis(NOON(2026, 8, 31), 0))).toBe(false);
    expect(recitingDays([majlis(NOON(2026, 8, 31), 0)])).toEqual([]);
  });

  it('counts two majālis on one day as one day', () => {
    const day = NOON(2026, 8, 31);
    expect(recitingDays([majlis(day), majlis(day + 3600_000)])).toHaveLength(1);
  });

  /**
   * The reciter's own midnight, not UTC. Eleven at night and one in the morning
   * are two days, and telling them otherwise because a server is behind would
   * simply be wrong.
   */
  it('splits the day at the reciter’s own midnight', () => {
    const late = new Date(2026, 7, 30, 23, 30).getTime();
    const early = new Date(2026, 7, 31, 0, 30).getTime();
    expect(dayKey(late)).not.toBe(dayKey(early));
    expect(recitingDays([majlis(late), majlis(early)])).toHaveLength(2);
  });

  it('reads a day the same whatever hour of it is asked about', () => {
    expect(dayKey(NOON(2026, 8, 31))).toBe(dayKey(new Date(2026, 7, 31, 4).getTime()));
    expect(startOfDay(NOON(2026, 8, 31))).toBe(new Date(2026, 7, 31, 0, 0, 0, 0).getTime());
  });
});

describe('the current run', () => {
  const now = NOON(2026, 8, 31);
  const daysAgo = (n: number) => NOON(2026, 8, 31 - n);

  it('is nothing at all before the first majlis', () => {
    expect(streakOf([], now)).toEqual({ current: 0, longest: 0, days: 0, today: false });
  });

  it('counts consecutive days up to today', () => {
    const s = [0, 1, 2, 3].map(n => majlis(daysAgo(n)));
    const streak = streakOf(s, now);
    expect(streak.current).toBe(4);
    expect(streak.today).toBe(true);
  });

  /**
   * The day is not over. A streak that breaks at midnight would be punishing a
   * clock rather than measuring anything — and this tool is used after ʿishāʾ.
   */
  it('survives a today that has not happened yet', () => {
    const s = [1, 2, 3].map(n => majlis(daysAgo(n)));
    const streak = streakOf(s, now);
    expect(streak.current).toBe(3);
    expect(streak.today).toBe(false);
  });

  it('ends at the first missed day', () => {
    const s = [1, 2, 4, 5].map(n => majlis(daysAgo(n)));
    expect(streakOf(s, now).current).toBe(2);
  });

  it('is nothing when the last majlis was the day before yesterday', () => {
    expect(streakOf([majlis(daysAgo(2))], now).current).toBe(0);
  });

  it('does not let an abandoned session hold a run together', () => {
    const s = [majlis(daysAgo(0)), majlis(daysAgo(1), 0), majlis(daysAgo(2))];
    expect(streakOf(s, now).current).toBe(1);
  });
});

describe('the longest run there has been', () => {
  const now = NOON(2026, 8, 31);
  const daysAgo = (n: number) => NOON(2026, 8, 31 - n);

  it('is remembered even after it was broken', () => {
    // Five in a row a fortnight ago, two in a row now.
    const s = [0, 1, 14, 15, 16, 17, 18].map(n => majlis(daysAgo(n)));
    const streak = streakOf(s, now);
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(5);
    expect(streak.days).toBe(7);
  });

  it('is the current one where that is the longest', () => {
    const s = [0, 1, 2].map(n => majlis(daysAgo(n)));
    const { current, longest } = streakOf(s, now);
    expect(longest).toBe(3);
    expect(current).toBe(3);
  });

  it('crosses the end of a month without noticing it', () => {
    const s = [
      majlis(NOON(2026, 8, 1)), majlis(NOON(2026, 7, 31)), majlis(NOON(2026, 7, 30)),
    ];
    expect(streakOf(s, NOON(2026, 8, 1)).longest).toBe(3);
  });
});

describe('a standing goal', () => {
  const now = NOON(2026, 8, 31);
  const daysAgo = (n: number) => NOON(2026, 8, 31 - n);
  const juz: StandingGoal = { ayahs: 200, period: 'month' };

  it('counts only what falls inside its window', () => {
    const inside = majlis(daysAgo(3), 50);
    const outside = majlis(daysAgo(40), 500);
    expect(goalProgress(juz, [inside, outside], now).done).toBe(50);
  });

  it('reads as a rolling window, so no day wipes the slate', () => {
    expect(windowFrom('month', now)).toBe(startOfDay(now) - 29 * 86_400_000);
    expect(PERIOD_DAYS).toEqual({ day: 1, week: 7, month: 30 });
  });

  /**
   * Summed, never unioned — the same choice `surahPressureAcross` makes.
   * Reciting a page twice is twice the work, and a goal that counted it once
   * would tell the reciter who revised most that they had done least.
   */
  it('counts a page recited twice as twice the work', () => {
    const twice = [majlis(daysAgo(1), 60), majlis(daysAgo(2), 60)];
    expect(goalProgress(juz, twice, now).done).toBe(120);
  });

  it('says how much is left, and never a negative amount', () => {
    expect(goalProgress(juz, [majlis(daysAgo(1), 80)], now).left).toBe(120);
    expect(goalProgress(juz, [majlis(daysAgo(1), 500)], now).left).toBe(0);
  });

  it('is met once, not more than once', () => {
    const over = goalProgress(juz, [majlis(daysAgo(1), 1000)], now);
    expect(over.met).toBe(true);
    expect(over.fraction).toBe(1);
  });

  it('says how many majālis are behind the number', () => {
    const s = [majlis(daysAgo(1), 30), majlis(daysAgo(2), 30), majlis(daysAgo(3), 0)];
    expect(goalProgress(juz, s, now).sessions).toBe(2);
  });

  it('is nothing at all before anything is recited', () => {
    const none = goalProgress(juz, [], now);
    expect(none).toMatchObject({ done: 0, fraction: 0, met: false, left: 200, sessions: 0 });
  });

  it('cannot be given a target of nothing, which would always be met', () => {
    expect(goalProgress({ ayahs: 0, period: 'day' }, [], now).target).toBe(1);
  });

  it('measures today alone for a daily goal', () => {
    const daily: StandingGoal = { ayahs: 20, period: 'day' };
    const s = [majlis(NOON(2026, 8, 31), 25), majlis(daysAgo(1), 100)];
    expect(goalProgress(daily, s, now).done).toBe(25);
  });
});
