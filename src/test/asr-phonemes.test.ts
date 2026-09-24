import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { phonemesFromFile } from '@/lib/asr/phonemes';
import { findCandidates, agreement } from '@/lib/asr/align';

/**
 * The expected side of the comparison, checked against the index the app
 * actually ships rather than a fixture.
 *
 * A fixture would prove the parser works. What has to be true is that the
 * 6,236 āyāt on disk say what this module claims they say — including the two
 * things it promises *not* to be able to see.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const index = phonemesFromFile(raw);

const ref = (surah: number, ayah: number, anchorId = surah * 1000 + ayah) =>
  ({ surah, ayah, anchorId });

describe('the shipped index', () => {
  it('covers the whole muṣḥaf', () => {
    expect(index.size).toBe(6236);
    expect(index.has(1, 1)).toBe(true);
    expect(index.has(114, 6)).toBe(true);
    expect(index.has(2, 286)).toBe(true);
  });

  it('knows nothing about a verse that does not exist', () => {
    expect(index.has(2, 287)).toBe(false);
    expect(index.expected([ref(2, 287)])).toEqual([]);
  });

  it('names where it came from, so the credit ships with the data', () => {
    expect(index.attribution[0].url).toContain('quran-tajweed-phonetics');
    expect(index.attribution[0].license).toBe('NPL-1.2');
  });
});

describe('the sounds of a passage', () => {
  it('gives al-Fātiḥa 1 as the sounds of its four words', () => {
    const out = index.expected([ref(1, 1)]);
    expect(out).toHaveLength(15);
    expect(new Set(out.map(p => p.word))).toEqual(new Set([0, 1, 2, 3]));
    expect(out.every(p => p.anchorId === 1001)).toBe(true);
  });

  it('carries each verse of a passage on its own anchor, in reading order', () => {
    const out = index.expected([ref(1, 1), ref(1, 2)]);
    const anchors = [...new Set(out.map(p => p.anchorId))];
    expect(anchors).toEqual([1001, 1002]);
  });

  /**
   * Every sound of the Qur'an has a spelling the model can produce, so the
   * longest verse in the book must come back whole — 526 sounds across its
   * **128** printed words, none dropped for want of a spelling.
   *
   * That figure was 107 while the boundaries came from the phonetic
   * transcription, whose groups run words together. 128 is what the muṣḥaf
   * actually prints, and the change is the whole point of the new source.
   */
  it('drops nothing from the longest verse in the book', () => {
    const out = index.expected([ref(2, 282)]);
    expect(out).toHaveLength(526);
    expect(new Set(out.map(p => p.word)).size).toBe(128);
    expect(out.every(p => typeof p.symbol === 'string' && p.symbol.length > 0)).toBe(true);

    // And it really is the longest, so this is the hardest case there is.
    const longer = Object.keys(raw.ayahs).filter(k => {
      const [su, ay] = k.split(':').map(Number);
      return index.expected([ref(su, ay)]).length > 526;
    });
    expect(longer).toEqual([]);
  });
});

describe('what it refuses to pretend to know', () => {
  /**
   * The ones the builder names. Their sounds are known; their word boundaries
   * are not, and are reported as null rather than guessed.
   *
   * Most are the muqaṭṭaʿāt, where «الم» is one written word and three spoken
   * ones — neither reading wrong, and no honest way to choose between them.
   */
  it('gives no word for the āyāt whose boundaries do not line up', () => {
    expect(raw.withoutWordBoundaries).toHaveLength(94);
    for (const key of raw.withoutWordBoundaries) {
      const [surah, ayah] = key.split(':').map(Number);
      expect(index.has(surah, ayah)).toBe(true);
      expect(index.hasWords(surah, ayah)).toBe(false);
      const out = index.expected([ref(surah, ayah)]);
      expect(out.length).toBeGreaterThan(0);
      expect(out.every(p => p.word === null)).toBe(true);
    }
  });

  it('knows word boundaries everywhere else', () => {
    expect(index.hasWords(1, 1)).toBe(true);
    expect(index.hasWords(2, 282)).toBe(true);
    expect(index.hasWords(114, 6)).toBe(true);
  });

  /**
   * The claim the module header makes, held to the shipped data: tafkhīm and
   * tarqīq are one symbol here, so no alignment can ever separate them.
   */
  it('cannot distinguish tafkhīm from tarqīq, and says so by construction', () => {
    const spellings = new Map<string, string[]>();
    raw.vocab.forEach((precise: string, i: number) => {
      const m = raw.model[i];
      if (m == null) return;
      spellings.set(m, [...(spellings.get(m) ?? []), precise]);
    });
    const collapsed = [...spellings.values()].filter(v => v.length > 1);
    expect(collapsed.length).toBeGreaterThan(0);
    // Every collapse is a tafkhīm mark disappearing, never two real sounds
    // being confused for one another.
    for (const group of collapsed) {
      const stripped = new Set(group.map(s => s.replace(/\^/g, '')));
      expect(stripped.size).toBe(1);
    }
  });
});

describe('feeding the aligner', () => {
  it('reports nothing when the recitation matches the muṣḥaf', () => {
    const expected = index.expected([ref(1, 1)]);
    const heard = expected.map((p, i) => ({ symbol: p.symbol, confidence: 0.95, atMs: i * 90 }));
    expect(findCandidates(expected, heard)).toEqual([]);
    expect(agreement(expected, heard)).toBe(1);
  });

  it('points at the verse a stumble happened in', () => {
    const expected = index.expected([ref(1, 1), ref(1, 2)]);
    const heard = expected.map((p, i) => ({ symbol: p.symbol, confidence: 0.95, atMs: i * 90 }));
    // Break two sounds inside the second verse.
    const at = expected.findIndex(p => p.anchorId === 1002) + 2;
    heard[at] = { ...heard[at], symbol: 'zzz' };
    heard[at + 1] = { ...heard[at + 1], symbol: 'qqq' };

    const found = findCandidates(expected, heard);
    expect(found).toHaveLength(1);
    expect(found[0].anchorId).toBe(1002);
    expect(found[0].word).not.toBeNull();
  });

  it('still points at the verse where words are unknown', () => {
    const expected = index.expected([ref(19, 1)]);
    const heard = expected.map((p, i) => ({ symbol: p.symbol, confidence: 0.95, atMs: i * 90 }));
    heard[3] = { ...heard[3], symbol: 'zzz' };
    heard[4] = { ...heard[4], symbol: 'qqq' };

    const found = findCandidates(expected, heard);
    expect(found).toHaveLength(1);
    expect(found[0].anchorId).toBe(19001);
    expect(found[0].word).toBeNull();
  });
});


/**
 * The seam between this module and the model on the device.
 *
 * The index stores sounds as symbols, and the decoder emits symbols read out of
 * the model's own `tokens.txt`. If the two alphabets ever drift apart, every
 * comparison silently becomes a mismatch and the reciter is told they erred
 * everywhere. So the table is checked, not assumed.
 */
describe('the model own symbol table', () => {
  const table = new Map<string, number>(
    readFileSync('sard/public/asr/tokens.txt', 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map(line => {
        const at = line.lastIndexOf(' ');
        return [line.slice(0, at), Number(line.slice(at + 1))] as [string, number];
      }),
  );
  const needed = new Set((raw.model as (string | null)[]).filter(Boolean) as string[]);

  it('is complete: 251 ids, none missing, none twice', () => {
    expect(table.size).toBe(251);
    expect([...table.values()].sort((x, y) => x - y))
      .toEqual(Array.from({ length: 251 }, (_, i) => i));
  });

  /**
   * The model card's one loud warning: the raw `phoneme_units.json` ids are
   * offset by one against the CTC output layer, and decoding with them yields
   * plausible rubbish rather than an error. Blank sitting at 250 is what marks
   * this as the trained table and not the inventory beside it.
   */
  it('puts blank at 250, which is what says this is the right table', () => {
    expect(table.get('<blank>')).toBe(250);
  });

  /** The claim the whole comparison rests on. */
  it('can spell every sound the mushaf index needs', () => {
    expect(needed.size).toBe(217);
    expect([...needed].filter(sym => !table.has(sym))).toEqual([]);
  });

  it('holds sounds the recitation never needs, which is not a fault', () => {
    const spare = [...table.keys()].filter(sym => sym !== '<blank>' && !needed.has(sym));
    expect(spare).toHaveLength(33);
  });
});

/**
 * Word boundaries, and the measurement that decided where they come from.
 *
 * The obvious source — the spaced transcription shipped beside the tokens —
 * agreed with the printed verse **34%** of the time, because its «words» are
 * phonetic groups: idghām and a linking tanwīn run «هدى من ربهم» into one. A
 * highlight built on that would have been on the wrong word two times in
 * three. The per-sound word index in the phonetics file gives 98.5%.
 */
describe('where a sound sits in the printed verse', () => {
  const quran = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as {
    sura_no: number; aya_no: number; aya_text_emlaey: string;
  }[];

  it('covers all but a handful of the muṣḥaf', () => {
    const without = raw.withoutWordBoundaries.length;
    expect(6236 - without).toBeGreaterThan(6100);
    expect(without / 6236).toBeLessThan(0.02);
  });

  /** The check the builder itself applies, re-run over everything it shipped. */
  it('gives every verse exactly as many words as the muṣḥaf prints', () => {
    const missed: string[] = [];
    for (const row of quran) {
      const key = `${row.sura_no}:${row.aya_no}`;
      if (raw.withoutWordBoundaries.includes(key)) continue;

      const sounds = index.expected([
        { surah: row.sura_no, ayah: row.aya_no, anchorId: 1 },
      ]);
      const words = new Set(sounds.map(p => p.word));
      const printed = row.aya_text_emlaey.split(' ').filter(Boolean).length;
      if (words.size !== printed) missed.push(`${key}: ${words.size} vs ${printed}`);
    }
    expect(missed).toEqual([]);
  });

  it('numbers the words from zero, with none skipped', () => {
    for (const [surah, ayah] of [[1, 1], [2, 255], [36, 2], [114, 6]]) {
      const sounds = index.expected([{ surah, ayah, anchorId: 1 }]);
      const words = [...new Set(sounds.map(p => p.word))];
      expect(words).toEqual(words.map((_, i) => i));
    }
  });

  /** al-Fātiḥa 1 is «بسم الله الرحمن الرحيم» — four words, in that order. */
  it('puts the sounds of a known verse in the right four words', () => {
    const sounds = index.expected([{ surah: 1, ayah: 1, anchorId: 1 }]);
    const perWord = new Map<number, number>();
    for (const p of sounds) perWord.set(p.word as number, (perWord.get(p.word as number) ?? 0) + 1);

    expect([...perWord.keys()]).toEqual([0, 1, 2, 3]);
    // Every word has sounds, and they run in reading order.
    expect([...perWord.values()].every(n => n > 0)).toBe(true);
    expect(sounds.map(p => p.word)).toEqual([...sounds.map(p => p.word)].sort((a, b) =>
      (a as number) - (b as number)));
  });
});
