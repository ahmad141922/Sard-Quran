import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { findCandidates, type ExpectedPhoneme, type HeardPhoneme } from '@/lib/asr/align';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import { sourceOf, sourceOfCandidate } from '@/lib/asr/source';

/**
 * Naming the verse a reciter slid into, on the real phoneme index.
 *
 * The pair is the textbook one: al-Baqara 58 and al-Aʿrāf 161 tell the same
 * event in nearly the same words, and a memoriser of one carries the other's
 * wording across.
 */

const phonemes = phonemesFromFile(JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8')));
const verse = (surah: number, ayah: number) => phonemes.expected([{ surah, ayah, anchorId: surah * 1000 + ayah }]);
const words = (p: ExpectedPhoneme[], from: number, to: number) => p.filter(x => x.word !== null && x.word >= from && x.word < to);
const asHeard = (p: ExpectedPhoneme[]): HeardPhoneme[] => p.map((x, i) => ({ symbol: x.symbol, confidence: null, atMs: i * 80 }));

describe('the verse the words came from', () => {
  const baqara58 = verse(2, 58);
  const araf161 = verse(7, 161);

  it('names al-Aʿrāf 161 when its opening is recited in place of al-Baqara 58’s', () => {
    // «وإذ قيل لهم اسكنوا هذه القرية» … then on with al-Baqara.
    const said = asHeard([...words(araf161, 0, 6), ...words(baqara58, 5, 99)]);
    const found = findCandidates(baqara58, said);
    expect(found.length).toBeGreaterThan(0);
    const src = sourceOfCandidate(phonemes, found[0], said, [{ surah: 2, ayah: 58 }]);
    expect(src).toMatchObject({ surah: 7, ayah: 161 });
    expect(src!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('names nothing for a word that occurs in dozens of places', () => {
    // «الكريم» for «الرحيم» in al-Fātiḥa 3 — a real slip, but from nowhere in particular.
    const fatiha3 = verse(1, 3);
    const said = asHeard([...words(fatiha3, 0, 1), ...words(verse(82, 6), 3, 4)]);
    const found = findCandidates(fatiha3, said, { minRunUnrated: 2 });
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      expect(sourceOfCandidate(phonemes, c, said, [{ surah: 1, ayah: 3 }])).toBeNull();
    }
  });

  it('names nothing when the recited verse itself matches as well — the model misheard', () => {
    const said = words(baqara58, 0, 6).map(x => x.symbol);
    expect(sourceOf(phonemes, said, [{ surah: 2, ayah: 58 }])).toBeNull();
  });

  it('names nothing for sounds that match no verse well', () => {
    const noise = Array.from({ length: 12 }, (_, i) => baqara58[(i * 7) % baqara58.length].symbol);
    expect(sourceOf(phonemes, noise, [{ surah: 2, ayah: 58 }])).toBeNull();
  });

  it('never runs for an omission — nothing was said to come from anywhere', () => {
    const said = asHeard(words(baqara58, 0, 3).concat(words(baqara58, 8, 99)));
    for (const c of findCandidates(baqara58, said).filter(c => c.kind === 'omission')) {
      expect(sourceOfCandidate(phonemes, c, said, [{ surah: 2, ayah: 58 }])).toBeNull();
    }
  });
});
