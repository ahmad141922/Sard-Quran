import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import {
  addCorrection, addMark, coverSpan, makeCorrection,
} from '@/lib/recitation-session';
import {
  MIN_PAGES_TO_COMPARE, compareSessions, previousSessionOf, reviewOrder, reviewPlaces,
  sessionFigures, worthACard,
} from '@/lib/recitation-review';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * The model stores by kind; a student reviewing reads by place.
 *
 * Everything here is that turn — and the comparison, whose whole job is to
 * refuse a flattering number when the two sessions were different sizes.
 */

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, '../../public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
});

const ordinal = (p: { anchor: { id: number } }) => p.anchor.id;

describe('gathering what happened, by place', () => {
  it('puts everything recorded at one verse on one line', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 8 });
    s = { ...s, notes: [books.note('memory', 10), books.note('hesitation', 10)] };
    s = addMark(s, books.at(10));
    s = addCorrection(s, makeCorrection(books.at(10), 3_000, 'clip'));

    const places = reviewPlaces(s, ordinal);
    expect(places).toHaveLength(1);
    expect(places[0].notes).toHaveLength(2);
    expect(places[0].marks).toHaveLength(1);
    expect(places[0].corrections).toHaveLength(1);
  });

  it('keeps separate verses separate, in reading order', () => {
    const s = {
      ...books.session({ goalKind: 'juz1', startAyahId: 8 }),
      notes: [books.note('memory', 14), books.note('hesitation', 9)],
    };
    expect(reviewPlaces(s, ordinal).map(p => p.ordinal)).toEqual([9, 14]);
  });

  /**
   * A mark says «come back» without saying anything went wrong, and a
   * correction is the teacher teaching. Both belong on the line; neither
   * belongs in the number that ranks it.
   */
  it('weighs the notes only', () => {
    let bare = books.session({ goalKind: 'juz1', startAyahId: 8 });
    bare = addMark(bare, books.at(10));
    bare = addCorrection(bare, makeCorrection(books.at(10), 3_000, 'c'));
    expect(reviewPlaces(bare, ordinal)[0].weight).toBe(0);

    const noted = { ...bare, notes: [books.note('memory', 10)] };
    expect(reviewPlaces(noted, ordinal)[0].weight).toBe(3);
  });

  it('ranks the heaviest first but never drops the light ones', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 8 });
    s = addMark(s, books.at(20));
    s = { ...s, notes: [books.note('hesitation', 9), books.note('memory', 14)] };

    const ranked = reviewOrder(reviewPlaces(s, ordinal));
    expect(ranked.map(p => p.ordinal)).toEqual([14, 9, 20]);
    expect(ranked).toHaveLength(3);
  });

  it('has nothing to say about a clean session', () => {
    expect(reviewPlaces(books.session({ goalKind: 'juz1', startAyahId: 8 }), ordinal)).toEqual([]);
  });
});

describe('comparing a majlis with the one before it', () => {
  const figures = (notes: number, pages: number) => sessionFigures(
    { notes: Array.from({ length: notes }, () => books.note('memory', 10)) }, pages,
  );

  it('reads a lower rate as improvement', () => {
    const c = compareSessions(figures(4, 10), figures(12, 10));
    expect(c.comparable).toBe(true);
    expect(c.deltaRate).toBeLessThan(0);
  });

  /**
   * The reason this function exists. "Last week 17, this week 8" is a sentence
   * anybody understands and a lie whenever the sessions were different sizes.
   */
  it('refuses to compare a page against a juzʾ', () => {
    const c = compareSessions(figures(2, 1), figures(17, 20));
    expect(c.comparable).toBe(false);
  });

  it('needs both sides to be big enough, not just one', () => {
    expect(compareSessions(figures(3, MIN_PAGES_TO_COMPARE), figures(3, 1)).comparable).toBe(false);
    expect(compareSessions(figures(3, 1), figures(3, MIN_PAGES_TO_COMPARE)).comparable).toBe(false);
    expect(
      compareSessions(figures(3, MIN_PAGES_TO_COMPARE), figures(3, MIN_PAGES_TO_COMPARE)).comparable,
    ).toBe(true);
  });

  it('reads a session with no pages as a rate of zero rather than dividing by it', () => {
    expect(figures(3, 0).rate).toBe(0);
  });
});

describe('finding the previous session', () => {
  const s = (id: string, name: string, startedAt: number, ended = true) => ({
    id, studentName: name, startedAt, endedAt: ended ? startedAt + 1000 : null,
  });

  it('takes the latest finished one of the same reciter, before this', () => {
    const now = s('c', 'محمّد', 300);
    const all = [now, s('a', 'محمّد', 100), s('b', 'محمّد', 200), s('x', 'أحمد', 250)];
    expect(previousSessionOf(now, all)?.id).toBe('b');
  });

  it('ignores an unfinished one — it has nothing to compare yet', () => {
    const now = s('c', 'محمّد', 300);
    expect(previousSessionOf(now, [now, s('b', 'محمّد', 200, false)])).toBeUndefined();
  });

  it('reads a trailing space as the same boy', () => {
    const now = s('c', 'محمّد', 300);
    expect(previousSessionOf(now, [now, s('b', 'محمّد ', 200)])?.id).toBe('b');
  });

  it('finds nothing when this is the first', () => {
    const now = s('a', 'محمّد', 100);
    expect(previousSessionOf(now, [now])).toBeUndefined();
  });
});

describe('the achievement card', () => {
  it('is offered for a real session', () => {
    const s = coverSpan(books.session({ goalKind: 'juz1', startAyahId: 8 }), 8, 27);
    expect(worthACard(s.covered, 22)).toBe(true);
  });

  /** A card for a two-minute session that covered nothing cheapens every real one. */
  it('is not offered when nothing was recited', () => {
    expect(worthACard([], 22)).toBe(false);
  });

  it('is not offered for a session under a minute', () => {
    const s = coverSpan(books.session({ goalKind: 'juz1', startAyahId: 8 }), 8, 27);
    expect(worthACard(s.covered, 0)).toBe(false);
  });
});
