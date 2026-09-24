import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { buildQuranIndex } from '@/lib/quran-index';
import { madinahEdition } from '@/lib/mushaf-editions';
import type { QuranVerse } from '@/lib/quran-data';

/**
 * The printed line breaks of the Madinah muṣḥaf.
 *
 * They are what lets a word be marked at all. The plate carries one polygon per
 * verse and nothing per word, so on the picture a word cannot be lit; the text
 * renderer draws one element per word but, without these, ran the page as free
 * prose — which is not the page anybody learnt from.
 *
 * Everything below is checked against the app's own text rather than against a
 * transcription: the file is only trustworthy insofar as it agrees with the
 * muṣḥaf already shipped.
 */

const layout = JSON.parse(
  readFileSync('sard/public/mushaf-madinah-lines.json', 'utf8'),
) as {
  totalPages: number;
  pageLines: number[][];
  knownDrift: { page: number; ours: number; theirs: number }[];
};

/** The vendored layout rows the file was built from — headings included. */
const source = JSON.parse(
  readFileSync('scripts/data/qpc-v2-lines.json', 'utf8'),
) as { lines: number[][][] };

const raw = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as QuranVerse[];
const index = buildQuranIndex(raw, { ...madinahEdition(raw), pageLines: layout.pageLines });

/** Tokens of a verse: its words, then its end-of-verse marker. */
const tokensOf = (v: QuranVerse) => v.aya_text.replace(/\u200f/g, '').trim().split(/\s+/).filter(Boolean);

const wordsOnPage = new Map<number, number>();
for (const v of raw) wordsOnPage.set(v.page, (wordsOnPage.get(v.page) ?? 0) + tokensOf(v).length);

describe('the file itself', () => {
  it('covers the whole muṣḥaf', () => {
    expect(layout.totalPages).toBe(604);
    expect(layout.pageLines).toHaveLength(604);
  });

  /**
   * The two sources split four words differently — the muqaṭṭaʿāt among them.
   * Pinned by page so a later data update shows up as a failing test rather
   * than as a line that quietly moved.
   */
  it('names every page the two sources count differently, and there are four', () => {
    expect(layout.knownDrift.map(d => d.page)).toEqual([236, 262, 451, 482]);
  });
});

describe('every page, against the muṣḥaf the app already ships', () => {
  /**
   * Fifteen lines to a page — but only some of them carry verses. A surah
   * heading and a basmalah each take a line of the leaf without being a line of
   * text, and a heading can sit at the foot of the page **before** the surah
   * starts: page 76 carries an-Nisāʾ's, while an-Nisāʾ 1 is on page 77. So the
   * invariant is not «fifteen verse lines» but «verse lines plus heading lines
   * make fifteen», and that is what catches a row lost in transit.
   */
  it('accounts for all fifteen lines of every full page', () => {
    const headings = new Map<number, number>();
    source.lines.forEach((rows, i) => {
      headings.set(i + 1, rows.filter(r => r[1] !== 0).length);
    });
    const counts = layout.pageLines.map(b => b.length + 1);
    expect(counts.every(n => n <= 15)).toBe(true);

    const wrong: number[] = [];
    counts.forEach((n, i) => {
      const page = i + 1;
      // Pages 1 and 2 are the decorated opening leaves, set inside a frame.
      if (page <= 2) return;
      if (n + (headings.get(page) ?? 0) !== 15) wrong.push(page);
    });
    expect(wrong).toEqual([]);
  });

  it('never starts a line past the end of its own page', () => {
    const bad: number[] = [];
    layout.pageLines.forEach((breaks, i) => {
      const words = wordsOnPage.get(i + 1) ?? 0;
      if (breaks.some(b => b <= 0 || b >= words)) bad.push(i + 1);
    });
    expect(bad).toEqual([]);
  });

  it('lists the breaks of each page in order, with no repeats', () => {
    const bad: number[] = [];
    layout.pageLines.forEach((breaks, i) => {
      const sorted = [...breaks].sort((a, b) => a - b);
      if (String(sorted) !== String(breaks) || new Set(breaks).size !== breaks.length) {
        bad.push(i + 1);
      }
    });
    expect(bad).toEqual([]);
  });
});

describe('what the reader now gets', () => {
  it('lays a page out as lines of words rather than as free prose', () => {
    const lines = index.pageWordLines(3);
    expect(lines).toHaveLength(15);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });

  it('loses no word of the page in the process', () => {
    for (const page of [3, 50, 300, 500]) {
      const laid = index.pageWordLines(page).reduce((n, l) => n + l.length, 0);
      expect(laid).toBe(wordsOnPage.get(page));
    }
  });

  it('keeps the page in reciting order', () => {
    const flat = index.pageWordLines(300).flat();
    const ids = flat.map(w => w.ayahId);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  /**
   * The number the follower speaks in. `At.word` is an index into the verse's
   * printed words, so a word can only be marked on the page if the page's words
   * carry the same index — checked here against the verse's own tokens rather
   * than against a count taken from the same place.
   */
  it('numbers each word by its place in its own verse', () => {
    for (const page of [3, 77, 300]) {
      const seen = new Map<number, number[]>();
      for (const w of index.pageWordLines(page).flat()) {
        if (!seen.has(w.ayahId)) seen.set(w.ayahId, []);
        seen.get(w.ayahId)!.push(w.word);
      }
      for (const [id, indices] of seen) {
        // Every verse on a Madinah page is whole, so its words run 0..n-1.
        const n = tokensOf(raw[id - 1]).length;
        expect(indices).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });

  /** Without the layout it is one long line, which is the state this replaces. */
  it('is the layout doing it, not the renderer', () => {
    const bare = buildQuranIndex(raw, madinahEdition(raw));
    expect(bare.pageWordLines(3)).toHaveLength(0);
  });
});
