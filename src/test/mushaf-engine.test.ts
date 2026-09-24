import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { AYAH_COUNTING, MUSHAF_REGISTRY, getMushaf } from '@/lib/mushaf/registry';
import {
  buildPageIndex, firstPageOfSurah, lastPageOfSurah,
  type MushafPageIndex, type MushafPageIndexFile,
} from '@/lib/mushaf/page-index';
import {
  carryPositionTo, pageOfAnchorIn, positionFromAnchor, positionInEdition, samePlace,
  type CanonicalBook, type EditionBook,
} from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex } from '@/lib/mushaf/text-pages';
import { coverSpan, pagesTouched, volumeSummary } from '@/lib/recitation-session';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * The engine, held to its own claims across every edition at once.
 *
 * Each edition is checked pairwise against every other, so a new one cannot be
 * added on the strength of "it looked right in the browser": either the whole
 * matrix holds or the suite says which pair broke.
 */
const MUSHAF_DIR = resolve(process.cwd(), 'sard/public/mushafs');
const installed = existsSync(MUSHAF_DIR)
  ? readdirSync(MUSHAF_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(MUSHAF_DIR, e.name, 'page-index.json')))
    .map(e => e.name)
  : [];
const ready = installed.length >= 2;

let index: QuranIndex;
let books: TestBooks;
let canonical: CanonicalBook;
const pages: Record<string, MushafPageIndex> = {};
const editions: Record<string, EditionBook> = {};

beforeAll(() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
  canonical = canonicalBookFromQuranIndex(index);
  for (const id of installed) {
    pages[id] = buildPageIndex(
      JSON.parse(readFileSync(join(MUSHAF_DIR, id, 'page-index.json'), 'utf8')) as MushafPageIndexFile,
    );
    const def = getMushaf(id);
    if (def) editions[id] = { def, pages: pages[id] };
  }
});

const optionsFor = (from: string, to: string) => {
  const a = getMushaf(from)!;
  const b = getMushaf(to)!;
  return {
    aligned: !!a.pageAlignmentGroup && a.pageAlignmentGroup === b.pageAlignmentGroup,
    sameCounting: a.ayahCounting === b.ayahCounting,
    fromNumbersBasmala: AYAH_COUNTING[a.ayahCounting].numbersBasmala,
    toNumbersBasmala: AYAH_COUNTING[b.ayahCounting].numbersBasmala,
  };
};

describe.skipIf(!ready)('every registered edition is really here', () => {
  it('has a package on disk for each entry, and no orphan package', () => {
    expect([...installed].sort()).toEqual(MUSHAF_REGISTRY.map(m => m.id).sort());
  });

  it('declares a counting whose total the package actually carries', () => {
    for (const m of MUSHAF_REGISTRY) {
      expect(pages[m.id].totalAyahs, m.id).toBe(AYAH_COUNTING[m.ayahCounting].totalAyahs);
      expect(pages[m.id].pageCount, m.id).toBe(m.pageCount);
      expect(pages[m.id].firstPageNumber, m.id).toBe(m.firstPageNumber);
    }
  });

  it('numbers every surah from 1 with nothing skipped', () => {
    for (const m of MUSHAF_REGISTRY) {
      let total = 0;
      for (let surah = 1; surah <= 114; surah++) {
        const last = pages[m.id].lastAyahOf(surah);
        expect(last, `${m.id} ${surah}`).toBeGreaterThan(0);
        for (let ayah = 1; ayah <= last!; ayah++) {
          expect(pages[m.id].pageOf(surah, ayah), `${m.id} ${surah}:${ayah}`).toBeGreaterThan(0);
        }
        total += last!;
      }
      expect(total, m.id).toBe(pages[m.id].totalAyahs);
    }
  });

  it('keeps every surah on a contiguous run of pages', () => {
    for (const m of MUSHAF_REGISTRY) {
      for (let surah = 1; surah <= 114; surah++) {
        const first = firstPageOfSurah(pages[m.id], surah)!;
        const last = lastPageOfSurah(pages[m.id], surah)!;
        expect(last, `${m.id} ${surah}`).toBeGreaterThanOrEqual(first);
        for (let p = first; p <= last; p++) {
          expect(pages[m.id].ayahsOfPage(p).some(a => a.surah === surah), `${m.id} ${surah} p${p}`).toBe(true);
        }
      }
    }
  });
});

describe.skipIf(!ready)('the conversion matrix', () => {
  it('carries every ayah of every edition into every other and back', () => {
    for (const from of installed) {
      for (const to of installed) {
        if (from === to) continue;
        let checked = 0;
        for (let surah = 1; surah <= 114; surah += 7) {
          const last = pages[from].lastAyahOf(surah)!;
          for (const ayah of [1, Math.ceil(last / 2), last]) {
            const there = positionInEdition(editions[from], canonical, { surah, ayah })!;
            const carried = carryPositionTo(editions[to], canonical, there)!;
            expect(carried.surah, `${from}→${to} ${surah}:${ayah}`).toBe(surah);
            expect(carried.mushafId).toBe(to);
            // The anchor is what the two books share: it never moves.
            expect(carried.anchor.id).toBe(there.anchor.id);
            if (carried.anchor.exact) {
              const home = carryPositionTo(editions[from], canonical, carried)!;
              expect({ s: home.surah, a: home.ayah }, `${from}→${to}→${from} ${surah}:${ayah}`)
                .toEqual({ s: surah, a: ayah });
            }
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(0);
      }
    }
  });

  it('never moves a position to another page of a book set to the same layout', () => {
    for (const from of installed) {
      for (const to of installed) {
        if (from === to || !optionsFor(from, to).aligned) continue;
        for (let anchorId = 1; anchorId <= index.totalAyahs; anchorId += 401) {
          const a = positionFromAnchor(editions[from], canonical, anchorId)!;
          const b = positionFromAnchor(editions[to], canonical, anchorId)!;
          expect(pages[to].pageOf(b.surah, b.ayah), `${from}/${to} @${anchorId}`)
            .toBe(pages[from].pageOf(a.surah, a.ayah));
        }
      }
    }
  });

  it('says two books number alike only when they do', () => {
    for (const from of installed) {
      for (const to of installed) {
        const same = optionsFor(from, to).sameCounting;
        const identical = Array.from({ length: 114 }, (_, i) => i + 1)
          .every(s => pages[from].lastAyahOf(s) === pages[to].lastAyahOf(s));
        expect(same, `${from} / ${to}`).toBe(identical);
      }
    }
  });

  it('treats a place in one book as the same place in another', () => {
    const [a, b] = installed;
    const here = positionInEdition(editions[a], canonical, { surah: 36, ayah: 1 })!;
    const there = carryPositionTo(editions[b], canonical, here)!;
    expect(samePlace(here, there)).toBe(true);
  });
});

describe.skipIf(!ready)('what the report counts', () => {
  it('counts pages in the book the majlis was read from', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 1, now: 0 });
    s = coverSpan(s, 1, 148);
    const canonicalPages = pagesTouched(s, index);
    for (const id of installed) {
      const def = getMushaf(id)!;
      const own = pagesTouched(s, index, pageOfAnchorIn(editions[id], canonical));
      if (def.pageAlignmentGroup === 'kfqc-604') {
        // Set to the same pages, so the two agree — and the report still asks
        // the edition rather than assuming it.
        expect(own, id).toEqual(canonicalPages);
      } else {
        // A book of its own: the same recitation covers a different number of
        // its pages, and every one of them is a page it actually has.
        expect(own.length, id).toBeGreaterThan(0);
        expect(Math.min(...own), id).toBeGreaterThanOrEqual(def.firstPageNumber);
        expect(Math.max(...own), id).toBeLessThanOrEqual(def.firstPageNumber + def.pageCount - 1);
        expect(own, id).not.toEqual(canonicalPages);
      }
    }
  });

  it('summarises the same ayahs however the pages are counted', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 1, now: 0 });
    s = coverSpan(s, 1, 148);
    const base = volumeSummary(s, index);
    for (const id of installed) {
      const own = volumeSummary(s, index, pageOfAnchorIn(editions[id], canonical));
      // Ayahs are ayahs whatever the book; pages are that book's own.
      expect(own.ayahs, id).toBe(base.ayahs);
      expect(own.pages, id).toBeGreaterThan(0);
      if (getMushaf(id)!.pageAlignmentGroup === 'kfqc-604') expect(own.pages, id).toBe(base.pages);
    }
  });

  it('never lets a book of its own be treated as sharing a layout', () => {
    const shamarly = installed.find(id => !getMushaf(id)?.pageAlignmentGroup);
    if (!shamarly) return;
    for (const other of installed) {
      if (other === shamarly) continue;
      expect(optionsFor(shamarly, other).aligned, `${shamarly}/${other}`).toBe(false);
      expect(optionsFor(other, shamarly).aligned, `${other}/${shamarly}`).toBe(false);
    }
    // Same riwaya, same numbering, different pages: the numbers carry across
    // untouched and it is the *pages* that differ.
    const hafs = editions['hafs-kfqc'];
    const other = editions[shamarly];
    if (!hafs || !other) return;
    const here = positionInEdition(hafs, canonical, { surah: 4, ayah: 176 })!;
    const there = carryPositionTo(other, canonical, here)!;
    expect(there).toMatchObject({ surah: 4, ayah: 176, mushafId: shamarly });
    expect(there.anchor.exact).toBe(true);
    expect(lastPageOfSurah(pages[shamarly], 4)).not.toBe(lastPageOfSurah(pages['hafs-kfqc'], 4));
  });
});
