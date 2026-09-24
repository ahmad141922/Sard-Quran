import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { getMushaf } from '@/lib/mushaf/registry';
import { buildPageIndex, type MushafPageIndexFile } from '@/lib/mushaf/page-index';
import {
  carryPositionTo, positionInEdition, samePlace,
  type CanonicalBook, type EditionBook,
} from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
import {
  coverSpan, groupedNoteLines, makeNote, moveTo, progressPct, switchEdition,
} from '@/lib/recitation-session';
import { migrateSession } from '@/lib/recitation-migrate';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * The edition owns the number.
 *
 * A majlis recited from the Warsh muṣḥaf is recorded in Warsh's numbering —
 * that is what the teacher saw and what the report has to print. The anchor is
 * a second thing carried alongside so two editions can be compared at all; it
 * is never what a verse is called.
 */
const pkg = (id: string) => resolve(process.cwd(), 'sard/public/mushafs', id);
const installed = existsSync(join(pkg('warsh-kfqc'), 'page-index.json'))
  && existsSync(join(pkg('qalun-kfqc'), 'page-index.json'));

let index: QuranIndex;
let books: TestBooks;
let canonical: CanonicalBook;
let hafs: EditionBook;
let warsh: EditionBook;
let qalun: EditionBook;

beforeAll(() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
  canonical = canonicalBookFromQuranIndex(index);
  hafs = books.book;
  if (!installed) return;
  const bookOf = (id: string): EditionBook => ({
    def: getMushaf(id)!,
    pages: buildPageIndex(
      JSON.parse(readFileSync(join(pkg(id), 'page-index.json'), 'utf8')) as MushafPageIndexFile,
    ),
  });
  warsh = bookOf('warsh-kfqc');
  qalun = bookOf('qalun-kfqc');
});

describe.skipIf(!installed)('a position taken in a book', () => {
  it('keeps the number that was on the page, and derives only the anchor', () => {
    // The teacher taps al-Baqarah 119 in the Warsh muṣḥaf. That is the number
    // in front of them; the Kufan 120 is bookkeeping.
    const p = positionInEdition(warsh, canonical, { surah: 2, ayah: 119 })!;
    expect(p).toMatchObject({
      mushafId: 'warsh-kfqc', riwayaId: 'warsh', ayahCounting: 'madani-first',
      surah: 2, ayah: 119,
    });
    expect(p.anchor).toMatchObject({ scheme: 'kufi', surah: 2, ayah: 120, exact: true });
    expect(p.anchor.id).toBe(index.idOf(2, 120));
  });

  it('is never renumbered into the other book for display', () => {
    const p = positionInEdition(warsh, canonical, { surah: 18, ayah: 105 })!;
    // Warsh's al-Kahf ends at 105; Hafs's at 110. The record says 105.
    expect(p.ayah).toBe(105);
    expect(p.anchor.ayah).toBe(110);
  });
});

describe.skipIf(!installed)('switching muṣḥaf mid-majlis', () => {
  it('re-expresses the marker and carries the anchor unchanged', () => {
    const start = books.at(index.idOf(2, 125)!);
    const carried = carryPositionTo(warsh, canonical, start)!;
    expect(carried).toMatchObject({ mushafId: 'warsh-kfqc', surah: 2, ayah: 124 });
    // The anchor is what the two books have in common: it does not move.
    expect(carried.anchor.id).toBe(start.anchor.id);
    expect(carried.anchor.ayah).toBe(125);
    expect(samePlace(start, carried)).toBe(true);
  });

  it('marks a conversion it cannot pin to the verse, and says so', () => {
    // Page 42 divides al-Baqarah differently in the two books, so 255 is right
    // to the page and no finer.
    const start = books.at(index.idOf(2, 255)!);
    const carried = carryPositionTo(warsh, canonical, start)!;
    expect(carried.ayah).toBe(254);
    expect(carried.anchor.exact).toBe(false);
    expect(samePlace(start, carried)).toBe(false);
  });

  it('leaves every note exactly as it was taken', () => {
    let s = books.session({ goalKind: 'full', startAyahId: 1, now: 0 });
    // Two notes taken while reading the Warsh muṣḥaf…
    const inWarsh = positionInEdition(warsh, canonical, { surah: 2, ayah: 119 })!;
    s = switchEdition(s, inWarsh);
    s = { ...s, notes: [makeNote('memory', inWarsh, 0)] };
    expect(s.mushafId).toBe('warsh-kfqc');

    // …and now the teacher switches back to Hafs.
    const back = carryPositionTo(hafs, canonical, s.current)!;
    s = switchEdition(s, back);
    expect(s.mushafId).toBe('hafs-kfqc');
    expect(s.current.ayah).toBe(120);

    // The note is still a Warsh note, with Warsh's number.
    expect(s.notes[0].position).toMatchObject({
      mushafId: 'warsh-kfqc', riwayaId: 'warsh', ayahCounting: 'madani-first', ayah: 119,
    });
  });

  it('names the riwaya on a report that mixes two of them', () => {
    const warshNote = makeNote('memory', positionInEdition(warsh, canonical, { surah: 2, ayah: 119 })!, 0);
    const hafsNote = makeNote('hesitation', books.at(index.idOf(2, 200)!), 0);
    const lines = groupedNoteLines([warshNote, hafsNote], 'hafs-kfqc');
    expect(lines).toHaveLength(2);
    expect(lines.some(l => l.includes('119') && l.includes('ورش'))).toBe(true);
    expect(lines.some(l => l.includes('200') && l.includes('حفص'))).toBe(true);
  });

  it('measures the same majlis identically whichever book it is read in', () => {
    // Measurement runs on anchors, so changing edition mid-session neither
    // credits nor loses a single ayah.
    let s = books.session({ goalKind: 'juz1', startAyahId: 1, now: 0 });
    s = coverSpan(s, 1, 100);
    const before = progressPct(s);
    s = switchEdition(s, carryPositionTo(warsh, canonical, s.current)!);
    expect(progressPct(s)).toBe(before);
    expect(s.covered).toEqual([[1, 100]]);
  });
});

describe.skipIf(!installed)('a third riwaya in the same majlis', () => {
  it('records a Qalun position in Qalun numbering', () => {
    const p = positionInEdition(qalun, canonical, { surah: 18, ayah: 105 })!;
    expect(p).toMatchObject({
      mushafId: 'qalun-kfqc', riwayaId: 'qalun', ayahCounting: 'madani-first',
      surah: 18, ayah: 105, origin: 'read',
    });
    // Al-Kahf's last verse is 110 in the Kufan count — bookkeeping, not what
    // is printed in front of the student.
    expect(p.anchor).toMatchObject({ surah: 18, ayah: 110, exact: true });
  });

  it('carries between Qalun and Warsh without converting anything', () => {
    const inQalun = positionInEdition(qalun, canonical, { surah: 2, ayah: 124 })!;
    const inWarsh = carryPositionTo(warsh, canonical, inQalun)!;
    // The two books number alike, so the number does not move and nothing is
    // approximate.
    expect(inWarsh).toMatchObject({ mushafId: 'warsh-kfqc', surah: 2, ayah: 124 });
    expect(inWarsh.anchor.exact).toBe(true);
    expect(samePlace(inQalun, inWarsh)).toBe(true);
  });

  it('keeps each note in the book it was taken in, across three switches', () => {
    let s = books.session({ goalKind: 'full', startAyahId: 1, now: 0 });

    // Hafs: a note at al-Baqarah 125.
    const hafsAt = books.at(index.idOf(2, 125)!);
    s = { ...s, notes: [...s.notes, makeNote('memory', hafsAt, 0)] };

    // Switch to Qalun and take another.
    s = switchEdition(s, carryPositionTo(qalun, canonical, hafsAt)!);
    expect(s.current).toMatchObject({ mushafId: 'qalun-kfqc', surah: 2, ayah: 124 });
    s = { ...s, notes: [...s.notes, makeNote('hesitation', s.current, 0)] };

    // And on to Warsh.
    s = switchEdition(s, carryPositionTo(warsh, canonical, s.current)!);
    expect(s.mushafId).toBe('warsh-kfqc');

    expect(s.notes.map(n => [n.position.mushafId, n.position.surah, n.position.ayah])).toEqual([
      ['hafs-kfqc', 2, 125],
      ['qalun-kfqc', 2, 124],
    ]);
    const lines = groupedNoteLines(s.notes, s.mushafId);
    expect(lines.some(l => l.includes('125') && l.includes('حفص'))).toBe(true);
    expect(lines.some(l => l.includes('124') && l.includes('قالون'))).toBe(true);
  });

  it('measures the majlis identically whichever of the three it is read in', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 1, now: 0 });
    s = coverSpan(s, 1, 148);
    const pct = progressPct(s);
    for (const b of [qalun, warsh, hafs]) {
      s = switchEdition(s, carryPositionTo(b, canonical, s.current)!);
      expect(progressPct(s)).toBe(pct);
    }
    expect(s.covered).toEqual([[1, 148]]);
  });
});

describe('sessions written before the position model', () => {
  it('are read forward as what they were: the Madinah Hafs muṣḥaf', () => {
    const legacy = {
      id: 'old', studentName: 'محمد',
      goal: { kind: 'juz1' as const, startAyahId: 1, endAyahId: 148 },
      currentAyahId: 20,
      covered: [[1, 20]] as [number, number][],
      segments: [], notes: [
        { id: 'n1', at: 0, kind: 'memory' as const, ayahId: 12, surah: 2, ayah: 5 },
      ],
      startedAt: 0, endedAt: 0, lastSeenAt: 0, status: 'ended' as const,
      qiraah: 'hafs', mushaf: 'madinah' as const,
    };
    const s = migrateSession(legacy, index);
    expect(s).toMatchObject({
      mushafId: 'hafs-kfqc', riwayaId: 'hafs', ayahCounting: 'kufi', modelVersion: 2,
    });
    expect(s.current).toMatchObject({ surah: 2, ayah: 13, anchor: { id: 20, exact: true } });
    expect(s.goal.end.anchor.id).toBe(148);
    // The note already carried its surah and ayah, so nothing was looked up.
    expect(s.notes[0].position).toMatchObject({ surah: 2, ayah: 5, mushafId: 'hafs-kfqc' });
    expect(s.covered).toEqual([[1, 20]]);
    // The old marker field is gone rather than left to rot beside the new one.
    expect((s as unknown as { currentAyahId?: number }).currentAyahId).toBeUndefined();
    expect((s as unknown as { qiraah?: string }).qiraah).toBeUndefined();
  });
});

describe('the edition an ayah field belongs to', () => {
  it.skipIf(!installed)('bounds the picker by the edition, not by Hafs', () => {
    expect(warsh.pages.lastAyahOf(18)).toBe(105);
    expect(hafs.pages.lastAyahOf(18)).toBe(110);
  });

  it.skipIf(!installed)('refuses another edition’s pages under this edition’s name', () => {
    // The pair {Qalun, Warsh's pages} would answer every question plausibly:
    // the two number alike, so nothing would look wrong until an edition that
    // does not turns up. It is rejected on identity, not on plausibility.
    expect(editionBook(getMushaf('qalun-kfqc')!, warsh.pages as never, canonical)).toBeNull();
    expect(editionBook(getMushaf('warsh-kfqc')!, warsh.pages as never, canonical)).not.toBeNull();
  });

  it('reads an edition with no page index of its own only when it counts alike', () => {
    const hafsOnly = editionBook(getMushaf('hafs-kfqc')!, null, canonical);
    expect(hafsOnly).not.toBeNull();
    // Warsh numbers differently, so without its own index there is nothing to
    // read it against — better no book than the wrong one.
    expect(editionBook(getMushaf('warsh-kfqc')!, null, canonical)).toBeNull();
  });

  it('moves the marker without touching what was already credited', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 1, now: 0 });
    s = coverSpan(s, 1, 10);
    s = moveTo(s, books.at(50));
    expect(s.current.anchor.id).toBe(50);
    expect(s.covered).toEqual([[1, 10]]);
  });
});
