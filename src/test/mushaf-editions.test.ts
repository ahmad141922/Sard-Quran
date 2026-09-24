import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import {
  MADINAH_LANDMARKS, editionFromIndexFile, madinahEdition, pageRangesOf, validateEdition,
  type MushafIndexFile,
} from '@/lib/mushaf-editions';

let raw: QuranVerse[];
let index: QuranIndex;

beforeAll(() => {
  raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8'));
  index = buildQuranIndex(raw);
});

describe('the Madinah layout', () => {
  it('is what the shipped mushaf JSON paginates to', () => {
    expect(index.mushaf).toBe('madinah');
    expect(index.totalPages).toBe(604);
  });

  it('puts the landmarks on the pages a teacher expects', () => {
    for (const { surah, ayah, page } of MADINAH_LANDMARKS) {
      const id = index.idOf(surah, ayah)!;
      expect(index.pageOf(id), `${surah}:${ayah}`).toBe(page);
    }
  });

  it('derives page ranges that tile the whole mushaf with no gap', () => {
    const ranges = pageRangesOf(madinahEdition(index.verses), index.totalAyahs);
    expect(ranges[0].firstId).toBe(1);
    expect(ranges[ranges.length - 1].lastId).toBe(index.totalAyahs);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].firstId).toBe(ranges[i - 1].lastId + 1);
    }
  });

  it('agrees with the page column it was built from', () => {
    for (const v of index.verses) expect(index.pageOf(v.id)).toBe(v.page);
  });
});

describe('a supplied page index', () => {
  /** A deliberately small, well-formed stand-in: one page per juz'. */
  const soundFile = (): MushafIndexFile => ({
    id: 'shamarly',
    totalPages: 30,
    pageStarts: index.juzRanges.map(r => {
      const loc = index.locOf(r.firstId)!;
      return [loc.surah, loc.ayah] as [number, number];
    }),
  });

  it('is accepted when complete and monotonic', () => {
    const edition = editionFromIndexFile(soundFile(), index.idOf);
    expect(validateEdition(edition, index.totalAyahs)).toEqual([]);
    expect(buildQuranIndex(raw, edition).totalPages).toBe(30);
  });

  it('repaginates the mushaf without touching juz or surah boundaries', () => {
    const rebuilt = buildQuranIndex(raw, editionFromIndexFile(soundFile(), index.idOf));
    expect(rebuilt.pageOf(1)).toBe(1);
    expect(rebuilt.pageOf(index.juzRanges[29].firstId)).toBe(30);
    expect(rebuilt.juzRanges).toEqual(index.juzRanges);
    expect(rebuilt.surahRanges).toEqual(index.surahRanges);
  });

  it('is refused when the count does not match', () => {
    const file = soundFile();
    file.totalPages = 522;
    const problems = validateEdition(editionFromIndexFile(file, index.idOf), index.totalAyahs);
    expect(problems.join(' ')).toMatch(/totalPages/);
  });

  it('is refused when it does not start at the first ayah', () => {
    const file = soundFile();
    file.pageStarts[0] = [2, 1];
    const problems = validateEdition(editionFromIndexFile(file, index.idOf), index.totalAyahs);
    expect(problems.join(' ')).toMatch(/page 1 must begin/);
  });

  it('is refused when a page starts before the one before it', () => {
    const file = soundFile();
    [file.pageStarts[3], file.pageStarts[4]] = [file.pageStarts[4], file.pageStarts[3]];
    const problems = validateEdition(editionFromIndexFile(file, index.idOf), index.totalAyahs);
    expect(problems.join(' ')).toMatch(/starts at or before/);
  });

  it('is refused when it names an ayah that does not exist', () => {
    const file = soundFile();
    file.pageStarts[5] = [2, 999];
    const problems = validateEdition(editionFromIndexFile(file, index.idOf), index.totalAyahs);
    expect(problems.join(' ')).toMatch(/not an ayah/);
  });
});

describe('page labels', () => {
  it('are the internal index when the mushaf starts at page 1', () => {
    expect(index.pageLabel(1)).toBe(1);
    expect(index.pageLabel(604)).toBe(604);
  });

  it('are shifted for an edition whose first text page is not page 1', () => {
    const edition = { ...madinahEdition(index.verses), firstPageNumber: 2 };
    const shifted = buildQuranIndex(raw, edition);
    expect(shifted.pageLabel(1)).toBe(2);
    expect(shifted.pageLabel(shifted.totalPages)).toBe(605);
  });
});

describe('the Shamarly page index', () => {
  const path = resolve(process.cwd(), 'public/mushaf-shamarly.json');
  const installed = existsSync(path);
  const file = installed ? (JSON.parse(readFileSync(path, 'utf8')) as MushafIndexFile) : null;

  it.skipIf(!installed)('passes validation', () => {
    const edition = editionFromIndexFile(file!, index.idOf);
    expect(validateEdition(edition, index.totalAyahs)).toEqual([]);
  });

  it.skipIf(!installed)('runs to printed page 522, opening on page 2', () => {
    const edition = editionFromIndexFile(file!, index.idOf);
    const shamarly = buildQuranIndex(raw, edition);
    expect(edition.firstPageNumber).toBe(2);
    expect(shamarly.totalPages).toBe(521);
    expect(shamarly.pageLabel(1)).toBe(2);
    expect(shamarly.pageLabel(shamarly.totalPages)).toBe(522);
  });

  it.skipIf(!installed)('tiles the whole mushaf, and repaginates nothing else', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    const ranges = shamarly.pageRanges;
    expect(ranges[0].firstId).toBe(1);
    expect(ranges[ranges.length - 1].lastId).toBe(6236);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].firstId).toBe(ranges[i - 1].lastId + 1);
    }
    expect(shamarly.juzRanges).toEqual(index.juzRanges);
    expect(shamarly.surahRanges).toEqual(index.surahRanges);
  });

  /** Pins the pagination so a later data swap cannot move it silently. */
  it.skipIf(!installed)('places the landmarks where this edition prints them', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    const at = (surah: number, ayah: number) => shamarly.pageLabel(shamarly.pageOf(shamarly.idOf(surah, ayah)!));
    expect(at(1, 1)).toBe(2);      // al-Fatihah
    expect(at(2, 255)).toBe(36);   // Ayat al-Kursi
    expect(at(18, 1)).toBe(243);   // al-Kahf
    expect(at(36, 1)).toBe(369);   // Yasin
    expect(at(67, 1)).toBe(478);   // al-Mulk
    expect(at(78, 1)).toBe(498);   // an-Naba'
    expect(at(114, 6)).toBe(522);  // an-Nas
  });

  it.skipIf(!installed)('breaks pages mid-ayah, the way the print does', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    const splits = (file!.pageStartWord ?? []).filter(w => w > 0).length;
    expect(splits).toBeGreaterThan(200);
    // The one page verified against a photograph of the print: page 87 opens
    // part-way through an-Nisa 172, its first half sitting on page 86.
    const page87 = 87 - (file!.firstPageNumber ?? 1) + 1;
    const frags = shamarly.pageFragments(page87);
    expect(frags[0].verse.sura_no).toBe(4);
    expect(frags[0].verse.aya_no).toBe(172);
    expect(frags[0].from).toBe(16);
  });

  /** The whole point of fragments is that nothing is lost at a seam. */
  it.skipIf(!installed)('renders every word of the mushaf exactly once', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    const rendered = new Map<number, number>();
    for (let p = 1; p <= shamarly.totalPages; p++) {
      for (const { verse, from, to } of shamarly.pageFragments(p)) {
        const total = verse.aya_text.trim().split(/\s+/).length;
        const end = to < 0 ? total : to;
        expect(from, `${verse.sura_no}:${verse.aya_no} p${p}`).toBeLessThanOrEqual(end);
        rendered.set(verse.id, (rendered.get(verse.id) ?? 0) + (end - from));
      }
    }
    expect(rendered.size).toBe(shamarly.totalAyahs);
    const wrong = [...rendered.entries()]
      .filter(([id, n]) => n !== shamarly.verseById(id)!.aya_text.trim().split(/\s+/).length)
      .slice(0, 5);
    expect(wrong, `ayahs whose word count does not add up: ${JSON.stringify(wrong)}`).toEqual([]);
  });

  it.skipIf(!installed)('paginates differently from Madinah, as it must', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    expect(shamarly.totalPages).not.toBe(index.totalPages);
    const kursi = index.idOf(2, 255)!;
    expect(shamarly.pageLabel(shamarly.pageOf(kursi))).not.toBe(index.pageLabel(index.pageOf(kursi)));
  });
});

describe('the Shamarly line layout', () => {
  const path = resolve(process.cwd(), 'public/mushaf-shamarly.json');
  const installed = existsSync(path);
  const file = installed ? (JSON.parse(readFileSync(path, 'utf8')) as MushafIndexFile) : null;

  it.skipIf(!installed)('lays out every page in at most fifteen lines', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    for (let p = 1; p <= shamarly.totalPages; p++) {
      const lines = shamarly.pageWordLines(p);
      expect(lines.length, `page ${p}`).toBeGreaterThan(0);
      expect(lines.length, `page ${p}`).toBeLessThanOrEqual(15);
      expect(lines.every(l => l.length > 0), `page ${p} has an empty line`).toBe(true);
    }
  });

  /** Breaking into lines must not lose or duplicate a single word. */
  it.skipIf(!installed)('preserves the page word for word', () => {
    const shamarly = buildQuranIndex(raw, editionFromIndexFile(file!, index.idOf));
    for (let p = 1; p <= shamarly.totalPages; p++) {
      const flat = shamarly.pageWordLines(p).flat().map(w => w.text);
      const fromFragments: string[] = [];
      for (const { verse, from, to } of shamarly.pageFragments(p)) {
        const toks = verse.aya_text.trim().split(/\s+/);
        fromFragments.push(...toks.slice(from, to < 0 ? undefined : to));
      }
      expect(flat, `page ${p}`).toEqual(fromFragments);
    }
  });

  it.skipIf(!installed)('keeps Madinah flowing, since it has no line data', () => {
    expect(index.pageWordLines(1)).toEqual([]);
  });
});
