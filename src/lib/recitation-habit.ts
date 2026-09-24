/**
 * Two questions a memoriser asks that the sessions could answer and nobody was
 * asking them: **how long have I kept this up**, and **am I on track**.
 *
 * Both are read off majālis that already exist. Nothing new is recorded, and
 * nothing here is stored on a session — a streak is a fact about a list, not a
 * field somebody could get wrong.
 *
 * ## What a day is
 *
 * A day on which a majlis **recited something**. Opening the tool is not a
 * day, and neither is a session abandoned before the first verse: a count that
 * rewards opening an app is a count about the app, not about the Qurʾān.
 *
 * The boundary is the reciter's own midnight, not UTC. Somebody reciting at
 * eleven at night and again after midnight has done two days, and telling them
 * otherwise because a server is five hours behind would be simply wrong.
 *
 * ## What a streak is not
 *
 * It is not a score, and nothing is taken away for missing a day. The current
 * run survives a today that has not happened yet, because the day is not over
 * — a streak that breaks at midnight for a reciter who reviews after ʿishāʾ
 * would be punishing a clock.
 */

import { coveredCount, type RecitationSession } from './recitation-session';

/** `2026-08-31`, in the reciter's own calendar. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Midnight before `at`, locally — the anchor every window is measured from. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_MS = 86_400_000;

/** Whether a majlis got as far as reciting anything. See the header. */
export function recitedAnything(session: RecitationSession): boolean {
  return coveredCount(session.covered) > 0;
}

/** The distinct days a majlis actually recited on, newest first. */
export function recitingDays(sessions: RecitationSession[]): string[] {
  const days = new Set<string>();
  for (const s of sessions) if (recitedAnything(s)) days.add(dayKey(s.startedAt));
  return [...days].sort().reverse();
}

export interface Streak {
  /** Days in the run ending today, or ending yesterday if today is still open. */
  current: number;
  /** The longest run there has ever been. */
  longest: number;
  /** Distinct days with a majlis, all told. */
  days: number;
  /** Whether today already has one — so the interface need not imply it does. */
  today: boolean;
}

export function streakOf(sessions: RecitationSession[], now = Date.now()): Streak {
  const days = recitingDays(sessions);
  if (!days.length) return { current: 0, longest: 0, days: 0, today: false };

  const has = new Set(days);
  const today = has.has(dayKey(now));

  /*
   * The run counts back from today where today has happened, and from
   * yesterday where it has not — the day is not over, and a streak that breaks
   * at midnight would be punishing a clock rather than measuring anything.
   */
  let current = 0;
  let at = startOfDay(now) - (today ? 0 : DAY_MS);
  while (has.has(dayKey(at))) { current++; at -= DAY_MS; }

  // The longest run ever, walked over the days themselves so gaps of any
  // length cost the same.
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const key of [...days].reverse()) {
    const at2 = startOfDay(new Date(`${key}T12:00:00`).getTime());
    run = previous !== null && Math.round((at2 - previous) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = at2;
  }

  return { current, longest, days: days.length, today };
}

/**
 * How a standing goal is measured out.
 *
 * Rolling windows, not calendar ones. «A juzʾ a month» read as a calendar month
 * means the first of the month wipes the slate and the last week is a cliff;
 * read as the last thirty days it is the same promise without either. It also
 * sidesteps a question this tool has no business answering — which day a week
 * starts on, which is not the same answer everywhere it is used.
 */
export type GoalPeriod = 'day' | 'week' | 'month';

export const PERIOD_DAYS: Record<GoalPeriod, number> = { day: 1, week: 7, month: 30 };

export interface StandingGoal {
  /** Verses to recite in the period. Verses, because that is what is counted. */
  ayahs: number;
  period: GoalPeriod;
}

export interface GoalProgress {
  done: number;
  target: number;
  /** 0..1, clamped — a goal beaten twice over is still a goal met. */
  fraction: number;
  met: boolean;
  /** Verses still to go, never negative. */
  left: number;
  /** How many majālis went into it, so a number has something behind it. */
  sessions: number;
}

/** When the window opened: `days` back, from this morning. */
export function windowFrom(period: GoalPeriod, now = Date.now()): number {
  return startOfDay(now) - (PERIOD_DAYS[period] - 1) * DAY_MS;
}

/**
 * Progress against a standing goal.
 *
 * Verses are **summed, never unioned** — the same choice `surahPressureAcross`
 * makes, and for the same reason: reciting a page twice is twice the work, and
 * a goal that counted it once would tell the reciter who revised most that
 * they had done least.
 */
export function goalProgress(
  goal: StandingGoal, sessions: RecitationSession[], now = Date.now(),
): GoalProgress {
  const from = windowFrom(goal.period, now);
  const within = sessions.filter(s => s.startedAt >= from && s.startedAt <= now);
  const done = within.reduce((sum, s) => sum + coveredCount(s.covered), 0);
  const target = Math.max(1, goal.ayahs);

  return {
    done,
    target,
    fraction: Math.min(1, done / target),
    met: done >= target,
    left: Math.max(0, target - done),
    sessions: within.filter(recitedAnything).length,
  };
}
