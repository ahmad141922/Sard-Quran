import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { buildQuranIndex } from '@/lib/quran-index';
import { groupedNoteLines } from '@/lib/recitation-session';
import type { QuranVerse } from '@/lib/quran-data';
import { testBooks } from './session-helpers';

/**
 * The words a note was put on, in the report a teacher sends home.
 *
 * Two things are pinned. The report a family already knows does not change by
 * a single character unless words were actually noted - so a caller that does
 * not ask for words gets exactly the old lines. And when words are shown they
 * sit in brackets after the verse number, never as «5:3», which anybody who
 * reads the Qur'an takes for surah five, verse three.
 *
 * The label here is a plain marker rather than the Arabic one, so no Arabic is
 * typed in an assertion; which words and where is what is being checked.
 */

const raw = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as QuranVerse[];
const books = testBooks(buildQuranIndex(raw));

/** Anchor 5 is al-Fatiha 5; words are numbered from zero, shown from one. */
const onWord = (word: number, kind: 'memory' | 'shakl' = 'shakl') =>
  ({ ...books.note(kind, 5), word });
const onVerse = (kind: 'memory' | 'shakl' = 'memory') => books.note(kind, 5);

const label = (words: number[]) => 'w' + words.map(w => w + 1).join('+');

describe('a report that does not ask for words', () => {
  /** Nothing a family has already seen changes because a word was picked. */
  it('reads exactly as it did before words existed', () => {
    expect(groupedNoteLines([onWord(2)])).toEqual(groupedNoteLines([onVerse()]));
  });
});

describe('a report that asks for words', () => {
  it('names the word after the verse number, in brackets', () => {
    const [line] = groupedNoteLines([onWord(2)], undefined, label);
    expect(line.endsWith('5 (w3)')).toBe(true);
  });

  /** Never the compact form a reader takes for a surah and a verse. */
  it('never writes verse and word as «5:3»', () => {
    const [line] = groupedNoteLines([onWord(2)], undefined, label);
    expect(line).not.toContain('5:3');
  });

  it('lists the verse once when it was noted as a whole and on a word', () => {
    const both = groupedNoteLines([onVerse(), onWord(2)], undefined, label);
    expect(both).toEqual(groupedNoteLines([onWord(2)], undefined, label));
  });

  it('lists every word noted on a verse, once each, in reading order', () => {
    const [line] = groupedNoteLines([onWord(4), onWord(0), onWord(4, 'memory')], undefined, label);
    expect(line.endsWith('5 (w1+5)')).toBe(true);
  });

  /** A verse noted only as a whole gets no brackets at all. */
  it('adds nothing to a verse no word of which was noted', () => {
    const [line] = groupedNoteLines([onVerse()], undefined, label);
    expect(line).toEqual(groupedNoteLines([onVerse()])[0]);
    expect(line).not.toContain('(');
  });
});
