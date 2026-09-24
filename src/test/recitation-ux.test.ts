import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { getMushaf } from '@/lib/mushaf/registry';
import {
  buildPageIndex, firstPageOfSurah, lastPageOfSurah, type MushafPageIndexFile,
} from '@/lib/mushaf/page-index';
import { surahEndPosition, type CanonicalBook, type EditionBook } from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex } from '@/lib/mushaf/text-pages';
import { isTap, pageIntentOf, SWIPE_MIN_PX } from '@/lib/mushaf/swipe';
import { completeSurah, coveredCount } from '@/lib/recitation-session';
import { migrateSession } from '@/lib/recitation-migrate';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * Finishing a surah, and turning a page with a finger.
 *
 * The two rules under test: the closing page of a surah is a fact about the
 * edition — asked of its own page index, never of a table of Hafs numbers —
 * and the button that offers to finish appears when that page opens, not when
 * the marker reaches the last verse.
 */
const pkg = (id: string) => resolve(process.cwd(), 'sard/public/mushafs', id);
const EDITIONS = ['hafs-kfqc', 'warsh-kfqc', 'qalun-kfqc', 'duri-abu-amr-kfqc', 'shubah-kfqc'];
const installed = EDITIONS.every(id => existsSync(join(pkg(id), 'page-index.json')));

let index: QuranIndex;
let books: TestBooks;
let canonical: CanonicalBook;
const book: Record<string, EditionBook> = {};

beforeAll(() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
  canonical = canonicalBookFromQuranIndex(index);
  if (!installed) return;
  for (const id of EDITIONS) {
    book[id] = {
      def: getMushaf(id)!,
      pages: buildPageIndex(
        JSON.parse(readFileSync(join(pkg(id), 'page-index.json'), 'utf8')) as MushafPageIndexFile,
      ),
    };
  }
});

/** What the overlay computes: is the page on screen this surah's closing page? */
const showsFinish = (id: string, surah: number, printedPage: number) =>
  lastPageOfSurah(book[id].pages, surah) === printedPage;

describe.skipIf(!installed)('the closing page of a surah', () => {
  it('is read from each edition and not shared between them', () => {
    for (const id of EDITIONS) {
      // An-Nisa, whose last verse is 176 in Hafs and 175 in the other two.
      const page = lastPageOfSurah(book[id].pages, 4);
      expect(page, id).toBe(106);
      const last = book[id].pages.lastAyahOf(4)!;
      expect(book[id].pages.pageOf(4, last), id).toBe(page);
    }
    // The number is the same here because these three are set to one layout —
    // which is exactly why it must be asked of each edition rather than assumed
    // for the next one that is not.
    expect(lastPageOfSurah(book['hafs-kfqc'].pages, 4))
      .toBe(lastPageOfSurah(book['warsh-kfqc'].pages, 4));
  });

  it('covers every surah of every edition, with the surah’s own last verse', () => {
    for (const id of EDITIONS) {
      for (let surah = 1; surah <= 114; surah++) {
        const last = lastPageOfSurah(book[id].pages, surah);
        const first = firstPageOfSurah(book[id].pages, surah);
        expect(last, `${id} ${surah}`).toBeGreaterThan(0);
        expect(first!, `${id} ${surah}`).toBeLessThanOrEqual(last!);
        expect(book[id].pages.ayahsOfPage(last!).some(a => a.surah === surah)).toBe(true);
      }
    }
  });

  it('is where the surah ends, not where the page happens to end', () => {
    // Page 106 carries the end of an-Nisa *and* the opening of al-Ma'ida. The
    // majlis is about an-Nisa, so the page counts as its closing page.
    const page = book['hafs-kfqc'].pages.ayahsOfPage(106);
    expect(page.some(a => a.surah === 4)).toBe(true);
    expect(page.some(a => a.surah === 5)).toBe(true);
    expect(showsFinish('hafs-kfqc', 4, 106)).toBe(true);
    // And al-Ma'ida, which only begins there, is nowhere near finished.
    expect(showsFinish('hafs-kfqc', 5, 106)).toBe(false);
  });

  it('is the only page that offers to finish, whichever way the teacher got there', () => {
    expect(showsFinish('hafs-kfqc', 4, 105)).toBe(false);
    expect(showsFinish('hafs-kfqc', 4, 106)).toBe(true);
    // Turning back withdraws it again.
    expect(showsFinish('hafs-kfqc', 4, 104)).toBe(false);
  });

  it('offers from the first moment for a surah that fits on one page', () => {
    for (const id of EDITIONS) {
      // Al-Ikhlas: opens and closes on page 604.
      expect(firstPageOfSurah(book[id].pages, 112), id).toBe(lastPageOfSurah(book[id].pages, 112));
      expect(showsFinish(id, 112, 604), id).toBe(true);
    }
  });

  it('offers immediately when the majlis begins on the closing page', () => {
    for (const id of EDITIONS) {
      // Al-Baqarah's closing page carries several of its verses, so a majlis
      // can begin on that page well before its final one.
      const last = lastPageOfSurah(book[id].pages, 2)!;
      const opening = book[id].pages.ayahsOfPage(last).find(a => a.surah === 2)!;
      expect(opening.ayah, id).toBeLessThan(book[id].pages.lastAyahOf(2)!);
      expect(book[id].pages.pageOf(2, opening.ayah), id).toBe(last);
      // Starting there, the offer stands from the outset — it never waits for
      // the marker to reach the surah's final verse.
      expect(showsFinish(id, 2, last), id).toBe(true);
    }
  });
});

describe.skipIf(!installed)('finishing the surah', () => {
  it('ends at that surah’s last verse in the edition being recited from', () => {
    const ends = EDITIONS.map(id => surahEndPosition(book[id], canonical, 4)!);
    expect(ends.map(e => `${e.mushafId} ${e.surah}:${e.ayah}`)).toEqual([
      'hafs-kfqc 4:176',
      'warsh-kfqc 4:175',
      'qalun-kfqc 4:175',
      'duri-abu-amr-kfqc 4:175',
      'shubah-kfqc 4:176',
    ]);
    // Every one of them is the same verse — the same words, three numberings.
    expect(new Set(ends.map(e => e.anchor.id)).size).toBe(1);
    for (const e of ends) expect(e.anchor).toMatchObject({ surah: 4, ayah: 176, exact: true });
  });

  it('never borrows the Hafs number for a majlis read in another book', () => {
    for (const id of ['warsh-kfqc', 'qalun-kfqc', 'duri-abu-amr-kfqc']) {
      for (const surah of [2, 4, 18, 74, 114]) {
        const end = surahEndPosition(book[id], canonical, surah)!;
        expect(end.ayah, `${id} ${surah}`).toBe(book[id].pages.lastAyahOf(surah));
        expect(end.ayahCounting).not.toBe('kufi');
      }
    }
  });
});

describe.skipIf(!installed)('confirming a surah is progress, not an ending', () => {
  it('credits the surah and leaves the majlis open', () => {
    // An-Nisa from its first verse, in the Warsh muṣḥaf.
    const start = index.idOf(4, 1)!;
    let s = books.session({ goalKind: 'juz5', startAyahId: start, now: 0 });
    s = { ...s, mushafId: 'warsh-kfqc', riwayaId: 'warsh', ayahCounting: 'madani-first' };
    const end = surahEndPosition(book['warsh-kfqc'], canonical, 4)!;
    const next = index.idOf(5, 1)!;

    const after = completeSurah(s, start, end.anchor.id, books.at(next));
    expect(after.status).toBe('active');
    expect(after.endedAt).toBeNull();
    // Every ayah of an-Nisa is credited, in one span.
    expect(coveredCount(after.covered)).toBe(index.surahRanges[3].lastId - start + 1);
    // …and the majlis has moved on to the next surah, which will get its own
    // offer to finish when its closing page opens.
    expect(after.sessionSurah).toBe(5);
    expect(after.current.anchor.id).toBe(next);
  });

  it('never credits back past where the majlis began', () => {
    // Started at an-Nisa 100, so the first 99 verses are not this student's.
    const start = index.idOf(4, 100)!;
    let s = books.session({ goalKind: 'juz5', startAyahId: start, now: 0 });
    const end = index.surahRanges[3].lastId;
    s = completeSurah(s, start, end, books.at(end + 1));
    expect(s.covered).toEqual([[start, end]]);
  });

  it('stops at the end of the book rather than running off it', () => {
    const last = index.totalAyahs;
    let s = books.session({ goalKind: 'full', startAyahId: index.idOf(114, 1)!, now: 0 });
    s = completeSurah(s, index.idOf(114, 1)!, last, null);
    expect(s.sessionSurah).toBe(114);
    expect(s.current.anchor.id).toBe(index.idOf(114, 1));
    expect(coveredCount(s.covered)).toBe(6);
  });
});

describe('a majlis knows which surah it is about', () => {
  it('records it at the start rather than reading it off the marker', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: index.idOf(4, 100)!, now: 0 });
    expect(s.sessionSurah).toBe(4);
    // The marker will wander onto the next surah on the closing page; the
    // majlis is still about an-Nisa.
    expect(s.current.surah).toBe(4);
  });

  it('gives an old session the surah it began in', () => {
    const legacy = {
      id: 'old', studentName: 'x',
      goal: { kind: 'juz1' as const, startAyahId: index.idOf(4, 1)!, endAyahId: index.idOf(4, 176)! },
      currentAyahId: index.idOf(5, 2)!,
      covered: [], segments: [], notes: [],
      startedAt: 0, endedAt: 0, lastSeenAt: 0, status: 'ended' as const,
      qiraah: 'hafs', mushaf: 'madinah' as const,
      // An old session may carry the marking unit that used to be offered.
      unit: 'surah',
    };
    const s = migrateSession(legacy, index);
    expect(s.sessionSurah).toBe(4);
    // The marker had drifted into al-Ma'ida; the majlis is still an-Nisa's.
    expect(s.current.surah).toBe(5);
  });
});

describe('turning the page with a finger', () => {
  const rtl = { rtl: true };

  it('reads a rightward drag as forward, because the next page lies left', () => {
    expect(pageIntentOf(80, 5, rtl)).toBe('next');
    expect(pageIntentOf(-80, 5, rtl)).toBe('previous');
  });

  it('follows the book, not the screen, when the direction flips', () => {
    expect(pageIntentOf(80, 0, { rtl: false })).toBe('previous');
    expect(pageIntentOf(-80, 0, { rtl: false })).toBe('next');
  });

  it('ignores a drag too short to be deliberate', () => {
    expect(pageIntentOf(SWIPE_MIN_PX - 1, 0, rtl)).toBeNull();
    expect(pageIntentOf(SWIPE_MIN_PX, 0, rtl)).toBe('next');
    expect(pageIntentOf(4, 2, rtl)).toBeNull();
  });

  it('ignores a drag that is mostly up or down', () => {
    // Scrolling a tall page must not turn it.
    expect(pageIntentOf(60, 200, rtl)).toBeNull();
    expect(pageIntentOf(60, 60, rtl)).toBeNull();
    // Slanted but clearly horizontal still counts.
    expect(pageIntentOf(120, 40, rtl)).toBe('next');
  });

  it('knows a tap from a drag, wobble included', () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(6, -4)).toBe(true);
    expect(isTap(40, 0)).toBe(false);
    // A tap that wobbles is still a tap, and never a page turn.
    expect(pageIntentOf(6, -4, rtl)).toBeNull();
  });
});
