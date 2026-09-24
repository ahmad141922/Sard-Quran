import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import {
  addMark, canIssueCertificate, coverSpan, createSession, groupedNoteLines, noteCounts,
  noteKindsFor, notesPerPage, removeMark, sessionMarks, sessionMode, surahPressure,
  surahPressureAcross,
} from '@/lib/recitation-session';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * Reciting alone is a different act, not a majlis with an empty chair.
 *
 * Two things follow, and both are enforced in the model rather than left to
 * the interface: the third button records a mark instead of a tajweed note,
 * and no certificate is issued. The tests that matter most here are the ones
 * about what a mark is *not* — it is not evidence of a mistake, and nothing
 * that counts mistakes may count it.
 */

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, '../../public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
});

const solo = (s: ReturnType<TestBooks['session']>) => ({ ...s, mode: 'solo' as const });

describe('session mode', () => {
  it('reads a session recorded before the mode existed as a majlis', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: 1 });
    expect(s.mode).toBeUndefined();
    expect(sessionMode(s)).toBe('majlis');
  });

  it('leaves a majlis unmarked so it serialises as it always did', () => {
    const s = createSession({
      studentName: 'x', goalKind: 'juz1', mode: 'majlis',
      start: books.at(1), end: books.at(20), index,
    });
    expect(s.mode).toBeUndefined();
  });

  it('records solo, because that one is not the default', () => {
    const s = createSession({
      studentName: 'x', goalKind: 'juz1', mode: 'solo',
      start: books.at(1), end: books.at(20), index,
    });
    expect(sessionMode(s)).toBe('solo');
  });
});

describe('the buttons after the first two', () => {
  /** Four since the wrong-vowel note was added — appended, so no old button moved. */
  it('offers the tajweed and wrong-vowel notes in a majlis', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: 1 });
    expect(noteKindsFor(s)).toEqual(['hesitation', 'memory', 'tajweed', 'shakl']);
  });

  it('drops both when nobody is listening — a reciter cannot catch their own', () => {
    const s = solo(books.session({ goalKind: 'juz1', startAyahId: 1 }));
    expect(noteKindsFor(s)).toEqual(['hesitation', 'memory']);
  });

  it('keeps the first two identical, so the two modes stay comparable', () => {
    const majlis = books.session({ goalKind: 'juz1', startAyahId: 1 });
    const alone = solo(majlis);
    expect(noteKindsFor(alone)).toEqual(noteKindsFor(majlis).slice(0, 2));
  });
});

describe('marks', () => {
  it('reads a session with no marks as an empty list, not undefined', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: 1 });
    expect(s.marks).toBeUndefined();
    expect(sessionMarks(s)).toEqual([]);
  });

  it('appends and removes, and keeps the position it was taken at', () => {
    const s = addMark(books.session({ goalKind: 'juz1', startAyahId: 1 }), books.at(7));
    expect(sessionMarks(s)).toHaveLength(1);
    expect(sessionMarks(s)[0].position.ayah).toBe(books.at(7).ayah);

    const back = removeMark(s, sessionMarks(s)[0].id);
    expect(sessionMarks(back)).toEqual([]);
  });

  it('does not touch the notes list', () => {
    const s = addMark(books.session({ goalKind: 'juz1', startAyahId: 1 }), books.at(7));
    expect(s.notes).toEqual([]);
    expect(noteCounts(s)).toEqual({ hesitation: 0, memory: 0, tajweed: 0, shakl: 0 });
  });
});

/**
 * The reason marks are a separate list at all. A mark says «come back here»,
 * and a surah the reciter merely wants to revisit must not be ranked as one
 * they are failing at.
 */
describe('a mark is not a mistake', () => {
  const withCoverage = () => {
    // Al-Baqarah 1..20 recited, well past MIN_AYAHS_FOR_PRESSURE.
    const s = books.session({ goalKind: 'juz1', startAyahId: 8 });
    return coverSpan(s, 8, 27);
  };

  it('raises no pressure on the surah it sits in', () => {
    const base = withCoverage();
    const marked = addMark(addMark(base, books.at(10)), books.at(12));
    expect(surahPressure(marked, index).items).toEqual(surahPressure(base, index).items);
  });

  it('is invisible to notes-per-page', () => {
    const base = withCoverage();
    const marked = addMark(base, books.at(10));
    expect(notesPerPage(marked, index)).toBe(notesPerPage(base, index));
  });

  it('while a real note does move the number', () => {
    const base = withCoverage();
    const noted = { ...base, notes: [books.note('memory', 10)] };
    expect(surahPressure(noted, index).items[0].score)
      .toBeGreaterThan(surahPressure(base, index).items[0]?.score ?? 0);
  });
});

describe('certificates', () => {
  it('are issued for a majlis', () => {
    expect(canIssueCertificate(books.session({ goalKind: 'juz1', startAyahId: 1 }))).toBe(true);
  });

  it('are refused for a solo session — nobody heard it', () => {
    expect(canIssueCertificate(solo(books.session({ goalKind: 'juz1', startAyahId: 1 })))).toBe(false);
  });
});

describe('marks read like notes in a report', () => {
  it('group by surah with their ayah numbers', () => {
    const s = addMark(addMark(books.session({ goalKind: 'juz1', startAyahId: 8 }), books.at(9)), books.at(12));
    const lines = groupedNoteLines(sessionMarks(s), s.mushafId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('البقرة');
  });
});

/**
 * One majlis is a small sample. The surah a memoriser keeps losing shows
 * itself over weeks, which is the span someone reviewing alone cares about.
 */
describe('pressure across sessions', () => {
  const night = (noteAnchors: number[]) => {
    const s = coverSpan(books.session({ goalKind: 'juz1', startAyahId: 8 }), 8, 27);
    return { ...s, notes: noteAnchors.map(a => books.note('memory', a)) };
  };

  it('is the same thing as the single-session ranking for one session', () => {
    const s = night([10]);
    expect(surahPressureAcross([s], index)).toEqual(surahPressure(s, index));
  });

  it('gathers notes from every session', () => {
    const across = surahPressureAcross([night([10]), night([12]), night([14])], index);
    expect(across.items[0].counts.memory).toBe(3);
  });

  /**
   * The denominator is summed, not unioned. Reciting the same twenty ayahs on
   * three nights and slipping once is a third of the rate of slipping once in
   * one night — reviewing something more often must not make it rank worse.
   */
  it('sums the ayahs recited, so a well-reviewed surah does not look worst', () => {
    const once = surahPressureAcross([night([10])], index);
    const thrice = surahPressureAcross([night([10]), night([]), night([])], index);
    expect(thrice.items[0].ayahsCovered).toBe(once.items[0].ayahsCovered * 3);
    expect(thrice.items[0].score).toBeCloseTo(once.items[0].score / 3, 6);
  });

  it('reads no sessions as nothing to rank rather than throwing', () => {
    expect(surahPressureAcross([], index).items).toEqual([]);
  });
});
