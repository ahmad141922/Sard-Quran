import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { foldQuranText, normalizeDigits, searchMushaf } from '@/lib/mushaf/reader-search';

/**
 * The reader's one search box, asked the way people actually ask.
 *
 * Every case here is a phrasing someone types instead of scrolling: a
 * reference, a half-remembered name, a page number, a line of the Book.
 */
let index: QuranIndex;

beforeAll(() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
});

const first = (q: string, lang: 'ar' | 'en' = 'ar') => searchMushaf(q, index, lang)[0];

describe('the reader finds a place from a reference', () => {
  it('reads «2:255» as al-Baqarah 255', () => {
    expect(first('2:255').jump).toEqual({ kind: 'ayah', surah: 2, ayah: 255 });
  });

  it('reads it with Arabic-Indic digits and an Arabic comma', () => {
    expect(first('٢،٢٥٥').jump).toEqual({ kind: 'ayah', surah: 2, ayah: 255 });
  });

  it('reads a name and a number, in either script', () => {
    expect(first('البقرة ٢٥٥').jump).toEqual({ kind: 'ayah', surah: 2, ayah: 255 });
    expect(first('baqarah 255', 'en').jump).toEqual({ kind: 'ayah', surah: 2, ayah: 255 });
    expect(first('al-kahf 10', 'en').jump).toEqual({ kind: 'ayah', surah: 18, ayah: 10 });
  });

  it('says where the verse is, not only which it is', () => {
    const hit = first('2:255');
    expect(hit.detail).toContain('صفحة');
    expect(hit.detail).toContain('جزء');
  });

  it('refuses a verse that does not exist', () => {
    // Al-Fatiha has seven.
    expect(searchMushaf('1:99', index, 'ar').every(h => h.jump.kind !== 'ayah')).toBe(true);
  });

  it('reads a page and a juz when they are named', () => {
    expect(first('صفحة ٦٠٤').jump).toEqual({ kind: 'page', page: 604 });
    expect(first('page 604', 'en').jump).toEqual({ kind: 'page', page: 604 });
    expect(first('جزء ٣').jump).toEqual({ kind: 'juz', juz: 3 });
    expect(first("juz 3", 'en').jump).toEqual({ kind: 'juz', juz: 3 });
  });

  it('answers a bare number three ways, surah first', () => {
    const kinds = searchMushaf('18', index, 'ar').map(h => h.jump.kind);
    expect(kinds).toEqual(['surah', 'page', 'juz']);
  });

  it('drops the readings a bare number cannot carry', () => {
    // 300 is a page and nothing else: there is no surah 300 and no juz' 300.
    expect(searchMushaf('300', index, 'ar').map(h => h.jump.kind)).toEqual(['page']);
  });
});

describe('the reader finds a surah by name', () => {
  it('forgives the hamza, the «ال» and the spelling', () => {
    const codes = (q: string) => searchMushaf(q, index, 'ar').filter(h => h.jump.kind === 'surah')
      .map(h => (h.jump as { surah: number }).surah);
    expect(codes('الكهف')).toContain(18);
    expect(codes('كهف')).toContain(18);
    expect(codes('الاسراء')).toContain(17);
    expect(codes('الإسراء')).toContain(17);
  });

  it('finds it in English too, hyphen or none', () => {
    const codes = (q: string) => searchMushaf(q, index, 'en').filter(h => h.jump.kind === 'surah')
      .map(h => (h.jump as { surah: number }).surah);
    expect(codes('kahf')).toContain(18);
    expect(codes('al-kahf')).toContain(18);
    expect(codes('alkahf')).toContain(18);
  });

  it('says how long the surah is, counted and written as Arabic writes it', () => {
    const kahf = searchMushaf('الكهف', index, 'ar').find(h => h.jump.kind === 'surah');
    expect(kahf?.detail).toBe('١١٠ آية');
    // Three to ten take the broken plural, and one and two take no numeral.
    const kawthar = searchMushaf('الكوثر', index, 'ar').find(h => h.jump.kind === 'surah');
    expect(kawthar?.detail).toBe('٣ آيات');
    expect(searchMushaf('الكوثر', index, 'en').find(h => h.jump.kind === 'surah')?.detail).toBe('3 ayahs');
  });

  it('writes every number in the script of the language', () => {
    expect(searchMushaf('2:255', index, 'ar')[0].title).toContain('٢٥٥');
    expect(searchMushaf('2:255', index, 'ar')[0].detail).toContain('٤٢');
    expect(searchMushaf('2:255', index, 'en')[0].detail).toContain('42');
  });
});

describe('the reader finds a verse by its words', () => {
  it('matches text typed without any diacritics', () => {
    const hit = searchMushaf('الحمد لله رب العالمين', index, 'ar')
      .find(h => h.jump.kind === 'ayah');
    expect(hit?.jump).toEqual({ kind: 'ayah', surah: 1, ayah: 2 });
  });

  it('shows the words it matched', () => {
    const hit = searchMushaf('مالك يوم الدين', index, 'ar').find(h => h.jump.kind === 'ayah');
    expect(hit?.detail && hit.detail.length).toBeGreaterThan(0);
  });

  it('keeps the list short enough to read', () => {
    // «الله» is in most of the Book; the answer must still be a list. The cap
    // is on the verses — the surah named «الله» would be an answer, not a tail.
    const hits = searchMushaf('الله', index, 'ar');
    expect(hits.filter(h => h.detail && h.jump.kind === 'ayah').length).toBeLessThanOrEqual(20);
    expect(hits.length).toBeLessThanOrEqual(25);
  });

  it('says nothing rather than something wrong', () => {
    expect(searchMushaf('زززززز', index, 'ar')).toEqual([]);
    expect(searchMushaf('   ', index, 'ar')).toEqual([]);
  });

  it('does not go hunting for a two-letter fragment', () => {
    // Too short to mean anything; the box waits rather than dumping the Book.
    expect(searchMushaf('ال', index, 'ar')).toEqual([]);
  });
});

describe('the folding these rest on', () => {
  it('reads digits of any script as numbers', () => {
    expect(normalizeDigits('٢٥٥')).toBe('255');
    expect(normalizeDigits('صفحة ٦٠٤')).toBe('صفحة 604');
  });

  it('strips the marks a keyboard cannot make', () => {
    expect(foldQuranText('الرَّحْمَٰنِ')).toBe('الرحمن');
    expect(foldQuranText('إِيَّاكَ')).toBe('اياك');
    expect(foldQuranText('الصلاة')).toBe('الصلاه');
  });
});
