import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { coverSpan, type RecitationSession } from '@/lib/recitation-session';
import {
  MIN_AYAHS_FOR_HEAT, MISSING_DIMENSIONS, SPACING_LADDER_DAYS, cleanRun, dueNow, heatKnown, heatOf,
  intervalDays, overdueDays, pageStates, retention,
} from '@/lib/recitation-memory';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * The muṣḥaf after months of majālis. What matters most here is that the
 * numbers are rates rather than counts — a page recited twenty times collects
 * more faults than one recited once, and ranking by raw faults would paint
 * the pages a student works hardest at as their weakest.
 */

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, '../../public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
  const page = index.pageOf(FAULT_AT);
  if (page === undefined) throw new Error(`no page for anchor ${FAULT_AT}`);
  FAULT_PAGE = page;
});

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

const pageOf = (id: number) => index.pageOf(id);

/**
 * The anchor every fault below is placed at, and the page it sits on.
 *
 * Chosen rather than assumed: al-Baqara's opening page carries five verses,
 * which is under `MIN_AYAHS_FOR_HEAT` — so a test that put its faults there
 * would be measuring the sampling floor instead of the heat.
 */
const FAULT_AT = 40;
let FAULT_PAGE: number;

/** A finished majlis over a stretch wide enough for its pages to be sampled. */
const night = (endedAt: number, faults: ('memory' | 'hesitation')[] = []): RecitationSession => {
  const s = coverSpan(books.session({ goalKind: 'juz1', startAyahId: 8 }), 8, 80);
  return {
    ...s, endedAt, lastSeenAt: endedAt, status: 'ended',
    notes: faults.map(k => books.note(k, FAULT_AT)),
  };
};

/** The state of the page the faults land on — see `FAULT_AT`. */
const firstState = (sessions: RecitationSession[]) => {
  const state = pageStates(sessions, index, pageOf).get(FAULT_PAGE);
  if (!state) throw new Error('the fault page was not recited');
  return state;
};

describe('what a page has been through', () => {
  it('counts the verses recited and the majālis that touched it', () => {
    const page = firstState([night(T0), night(T0 + DAY)]);
    expect(page.sessions).toBe(2);
    expect(page.ayahsRecited).toBeGreaterThan(0);
  });

  it('remembers when it was last recited and last faulted', () => {
    const page = firstState([night(T0, ['memory']), night(T0 + DAY)]);
    expect(page.lastRecitedAt).toBe(T0 + DAY);
    expect(page.lastFaultAt).toBe(T0);
  });

  it('leaves the fault time null on a page that never faulted', () => {
    expect(firstState([night(T0)]).lastFaultAt).toBeNull();
  });

  it('has nothing to say about a muṣḥaf never opened', () => {
    expect(pageStates([], index, pageOf).size).toBe(0);
  });
});

describe('heat', () => {
  /** The reason it is a rate. */
  it('does not call a well-worked page weak for collecting more faults', () => {
    const once = firstState([night(T0, ['memory'])]);
    const often = firstState([
      night(T0, ['memory']), night(T0 + DAY, ['memory']), night(T0 + 2 * DAY, ['memory']),
    ]);
    // Three faults against three times the verses is the same rate, not worse.
    expect(heatOf(often)).toBeCloseTo(heatOf(once), 5);
  });

  it('runs hotter when the faults are denser', () => {
    const light = firstState([night(T0, ['memory'])]);
    const heavy = firstState([night(T0, ['memory', 'memory', 'memory'])]);
    expect(heatOf(heavy)).toBeGreaterThan(heatOf(light));
  });

  it('is cool for a clean page', () => {
    expect(heatOf(firstState([night(T0)]))).toBe(0);
  });

  /**
   * An unsampled page is not a cool page. `heatKnown` is how the interface
   * tells «no faults» from «no evidence».
   */
  it('says it does not know, below the sampling floor', () => {
    const thin = { ...firstState([night(T0)]), ayahsRecited: MIN_AYAHS_FOR_HEAT - 1 };
    expect(heatKnown(thin)).toBe(false);
    expect(heatOf(thin)).toBe(0);
  });

  it('never exceeds one, however bad the page', () => {
    const awful = { ...firstState([night(T0)]), ayahsRecited: 10, faultWeight: 300 };
    expect(heatOf(awful)).toBe(1);
  });

  /**
   * The scale has to have room in it. An earlier draft saturated at one
   * memorisation slip per ten verses, which painted a shaky page and a lost
   * one exactly the same red — and made the two tests above pass by clamping
   * rather than by measuring.
   */
  it('leaves headroom above a single slip on a page', () => {
    const oneSlip = { ...firstState([night(T0)]), ayahsRecited: 10, faultWeight: 3 };
    expect(heatOf(oneSlip)).toBeGreaterThan(0);
    expect(heatOf(oneSlip)).toBeLessThan(1);
  });
});

describe('spacing', () => {
  it('starts a page at the bottom of the ladder', () => {
    expect(intervalDays(firstState([night(T0, ['memory'])]))).toBe(SPACING_LADDER_DAYS[0]);
  });

  it('lengthens the interval as clean majālis accumulate', () => {
    const twice = firstState([night(T0), night(T0 + DAY)]);
    const many = firstState([0, 1, 2, 3, 4, 5].map(i => night(T0 + i * DAY)));
    expect(intervalDays(many)).toBeGreaterThan(intervalDays(twice));
  });

  it('sends a page that faulted last time back to the start', () => {
    const clean = firstState([0, 1, 2, 3].map(i => night(T0 + i * DAY)));
    const faulted = firstState([
      ...[0, 1, 2].map(i => night(T0 + i * DAY)),
      night(T0 + 3 * DAY, ['memory']),
    ]);
    expect(cleanRun(faulted)).toBe(0);
    expect(intervalDays(faulted)).toBeLessThan(intervalDays(clean));
  });

  it('is not due before its interval has passed', () => {
    const page = firstState([night(T0, ['memory'])]);
    expect(overdueDays(page, T0 + DAY / 2)).toBe(0);
  });

  it('is due once it has', () => {
    const page = firstState([night(T0, ['memory'])]);
    expect(overdueDays(page, T0 + 5 * DAY)).toBeGreaterThan(0);
  });

  it('lists the longest overdue first', () => {
    const states = pageStates(
      [night(T0, ['memory']), night(T0 + 20 * DAY, ['memory'])], index, pageOf,
    );
    const due = dueNow(states.values(), T0 + 60 * DAY);
    expect(due.length).toBeGreaterThan(0);
    for (let i = 1; i < due.length; i++) {
      expect(overdueDays(due[i - 1], T0 + 60 * DAY))
        .toBeGreaterThanOrEqual(overdueDays(due[i], T0 + 60 * DAY));
    }
  });
});

describe('the retention index', () => {
  const measure = (sessions: RecitationSession[], now: number) => retention(
    pageStates(sessions, index, pageOf).values(),
    sessions.flatMap(s => s.notes),
    now,
  );

  it('scores a clean, freshly recited portion high on every dimension', () => {
    const r = measure([night(T0)], T0);
    expect(r.recall).toBe(1);
    expect(r.fluency).toBe(1);
    expect(r.accuracy).toBe(1);
    expect(r.spacing).toBe(1);
  });

  it('drops recall for memorisation slips and fluency for hesitations', () => {
    const slips = measure([night(T0, ['memory', 'memory', 'memory'])], T0);
    const pauses = measure([night(T0, ['hesitation', 'hesitation', 'hesitation'])], T0);
    expect(slips.recall).toBeLessThan(1);
    expect(slips.fluency).toBe(1);
    expect(pauses.fluency).toBeLessThan(1);
    expect(pauses.recall).toBe(1);
  });

  it('drops spacing when everything has gone overdue', () => {
    expect(measure([night(T0)], T0 + 400 * DAY).spacing).toBe(0);
  });

  it('stays within nought and one', () => {
    const r = measure([night(T0, Array(60).fill('memory'))], T0 + 400 * DAY);
    for (const v of Object.values(r)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The dimension the user asked for that cannot honestly be computed: telling
   * a student a slip came from a look-alike verse needs a checked dataset of
   * mutashābihāt, and there is none. Named rather than invented, so an
   * interface can say what it cannot show.
   */
  it('names the dimension it cannot measure instead of faking it', () => {
    const r = measure([night(T0)], T0);
    expect(MISSING_DIMENSIONS).toContain('similarity');
    expect(Object.keys(r)).not.toContain('similarity');
  });
});
