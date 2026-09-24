import { describe, it, expect, beforeEach } from 'vitest';

import {
  DEFAULT_REMINDER, EVERY_DAY, SCHEDULE_DAYS,
  fromClock, loadReminder, nextAfter, saveReminder, toClock, upcoming,
  type Reminder, type Weekday,
} from '@/lib/reminder';

/**
 * The reminder a memoriser sets for their own ward.
 *
 * Nearly every test here is about it staying **quiet**: not sounding on a day
 * it was not asked for, not sounding twice, and above all not sounding on a day
 * the person has already recited. A reminder that nags somebody for something
 * they have already done is one they switch off, and a switched-off reminder
 * helps nobody.
 *
 * Local time throughout, built with the Date constructor rather than parsed
 * from a string, so the suite says the same thing in every timezone.
 */

/** Local noon on a given day — a fixed point that no offset can move past midnight. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

/** 2026-09-09 is a Wednesday; the tests lean on that. */
const WED = at(2026, 9, 9);

const every = (over: Partial<Reminder> = {}): Reminder =>
  ({ on: true, at: 20 * 60, days: EVERY_DAY, ...over });

const clockOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${toClock(d.getHours() * 60 + d.getMinutes())}`;
};

describe('when it would sound', () => {
  it('is silent while it is off', () => {
    expect(nextAfter({ ...every(), on: false }, WED)).toBeNull();
    expect(upcoming({ ...every(), on: false }, WED)).toEqual([]);
  });

  it('is silent when no day was chosen', () => {
    expect(nextAfter(every({ days: [] }), WED)).toBeNull();
  });

  it('sounds later the same day when the hour has not passed', () => {
    expect(clockOf(nextAfter(every(), WED)!)).toBe('2026-9-9 20:00');
  });

  it('waits for tomorrow once the hour has gone by', () => {
    const evening = at(2026, 9, 9, 21, 30);
    expect(clockOf(nextAfter(every(), evening)!)).toBe('2026-9-10 20:00');
  });

  /** On the minute is not «after» it: a reminder must never fire twice. */
  it('does not sound again at the very moment it just sounded', () => {
    const exactly = at(2026, 9, 9, 20, 0);
    expect(clockOf(nextAfter(every(), exactly)!)).toBe('2026-9-10 20:00');
  });

  it('honours a chosen day and skips the rest of the week', () => {
    // Wednesday is 3; asking for Friday alone must reach the 11th.
    const friday: Weekday[] = [5];
    expect(clockOf(nextAfter(every({ days: friday }), WED)!)).toBe('2026-9-11 20:00');
  });
});

describe('the run of times handed to the system', () => {
  it('gives a week of them, one a day, in order', () => {
    const list = upcoming(every(), WED);
    expect(list).toHaveLength(SCHEDULE_DAYS);
    expect([...list].sort((a, b) => a - b)).toEqual(list);
    expect(new Set(list.map(t => new Date(t).getDate())).size).toBe(SCHEDULE_DAYS);
  });

  it('gives only the chosen days', () => {
    const list = upcoming(every({ days: [1, 3] as Weekday[] }), WED);
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) expect([1, 3]).toContain(new Date(t).getDay());
  });

  /** The whole point: somebody who has recited today is not reminded today. */
  it('drops the day that has already been recited', () => {
    const morning = at(2026, 9, 9, 7, 0);
    const recited = at(2026, 9, 9, 9, 30);
    const withOut = upcoming(every(), morning, { recitedAt: recited });
    const withIn = upcoming(every(), morning, { recitedAt: null });
    expect(clockOf(withIn[0])).toBe('2026-9-9 20:00');
    expect(clockOf(withOut[0])).toBe('2026-9-10 20:00');
    // Dropped, not postponed: the run still reaches as far ahead.
    expect(withOut.every(t => !isSameDate(t, recited))).toBe(true);
  });

  it('is unaffected by a recitation on some other day', () => {
    const morning = at(2026, 9, 9, 7, 0);
    const yesterday = at(2026, 9, 8, 9, 30);
    expect(clockOf(upcoming(every(), morning, { recitedAt: yesterday })[0]))
      .toBe('2026-9-9 20:00');
  });
});

const isSameDate = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

describe('the clock field', () => {
  it('goes out and comes back unchanged', () => {
    for (const m of [0, 5 * 60 + 30, 20 * 60, 23 * 60 + 59]) {
      expect(fromClock(toClock(m))).toBe(m);
    }
  });

  it('refuses what is not a time', () => {
    for (const bad of ['', 'ward', '24:00', '20:60', '20', '8:0']) {
      expect(fromClock(bad)).toBeNull();
    }
  });
});

describe('what is kept on the device', () => {
  beforeEach(() => localStorage.clear());

  it('starts off, so nothing sounds at somebody who did not ask', () => {
    expect(loadReminder().on).toBe(false);
    expect(loadReminder()).toEqual(DEFAULT_REMINDER);
  });

  it('comes back as it was saved', () => {
    const mine = every({ at: 5 * 60 + 45, days: [5, 6] as Weekday[] });
    saveReminder(mine);
    expect(loadReminder()).toEqual(mine);
  });

  it('falls back rather than throwing on nonsense', () => {
    localStorage.setItem('tajweedoo:ward-reminder', '{"on":true,"at":99999,"days":"all"}');
    const back = loadReminder();
    expect(back.on).toBe(true);
    expect(back.at).toBe(DEFAULT_REMINDER.at);
    expect(back.days).toEqual(EVERY_DAY);
  });

  it('survives a corrupt entry', () => {
    localStorage.setItem('tajweedoo:ward-reminder', 'not json');
    expect(loadReminder()).toEqual(DEFAULT_REMINDER);
  });
});
