import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { BAND, WINDOW, agreement, findCandidates } from '@/lib/asr/align';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * What happens when somebody recites a whole juzʾ in one sitting.
 *
 * That reciter — a ḥāfiẓ reviewing alone, at length, with nobody listening — is
 * precisely who this feature exists for, so «it falls over past a page» is not
 * a limitation to accept. An exhaustive Needleman–Wunsch over a juzʾ is 382
 * million cells and 1.4 GB; these tests exist to keep that from coming back.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const index = phonemesFromFile(raw);

/** The first `n` āyāt of the muṣḥaf, in reading order. */
const passage = (n: number) =>
  index.expected(
    Object.keys(raw.ayahs).slice(0, n).map((key, i) => {
      const [surah, ayah] = key.split(':').map(Number);
      return { surah, ayah, anchorId: i + 1 };
    }),
  );

/** Recited exactly as written, with a slip introduced at `slipAt`. */
const recite = (expected: ReturnType<typeof passage>, slipAt?: number): HeardPhoneme[] =>
  expected.map((p, i) => ({
    symbol: slipAt !== undefined && i >= slipAt && i < slipAt + 6 ? `zz${i}` : p.symbol,
    confidence: 0.95,
    atMs: i * 80,
  }));

describe('a page', () => {
  it('is read exactly, and finds a slip in the middle of it', () => {
    const expected = passage(15);
    expect(expected.length).toBeGreaterThan(300);

    expect(findCandidates(expected, recite(expected))).toEqual([]);
    const found = findCandidates(expected, recite(expected, 120));
    expect(found).toHaveLength(1);
    expect(agreement(expected, recite(expected))).toBe(1);
  });
});

describe('a whole juzʾ, recited in one sitting', () => {
  const expected = passage(250);

  it('is a real amount of text', () => {
    expect(expected.length).toBeGreaterThan(15_000);
  });

  it('finishes, rather than asking for a gigabyte', () => {
    const heard = recite(expected);
    // The exhaustive matrix here is 382 million cells. If banding ever comes
    // out, this does not merely slow down — it fails to allocate.
    expect(agreement(expected, heard)).toBe(1);
    expect(findCandidates(expected, heard)).toEqual([]);
  }, 60_000);

  it('still finds one slip in the middle of all of it', () => {
    const found = findCandidates(expected, recite(expected, 8_000));
    expect(found).toHaveLength(1);
    expect(found[0].anchorId).toBeGreaterThan(1);
  }, 60_000);

  it('finds a slip near the very end, where the traceback starts', () => {
    const found = findCandidates(expected, recite(expected, expected.length - 40));
    expect(found).toHaveLength(1);
  }, 60_000);

  /** A verse left out is the drift the band exists to absorb. */
  it('survives a skipped verse, which shifts everything after it', () => {
    const heard = recite(expected);
    const shortened = [...heard.slice(0, 500), ...heard.slice(530)];
    const found = findCandidates(expected, shortened);
    expect(found.length).toBeGreaterThan(0);
    expect(agreement(expected, shortened)).toBeGreaterThan(0.9);
  }, 60_000);
});

describe('banding against the exhaustive answer', () => {
  /**
   * Where the band is wider than the passage the two are the same algorithm,
   * so any disagreement here is a bug in the banding rather than a trade-off.
   */
  it('agrees with an exhaustive alignment on a passage that fits in the band', () => {
    const expected = passage(12);
    expect(expected.length).toBeLessThan(BAND);

    const heard = recite(expected, 100);
    expect(findCandidates(expected, heard))
      .toEqual(findCandidates(expected, heard, { band: expected.length * 2 }));
  });

  /**
   * The one that matters: a passage far larger than the band, where the two
   * are genuinely different algorithms. A verse is dropped so the sequences
   * must actually shift against one another.
   */
  it('agrees with an exhaustive alignment on a passage far larger than it', () => {
    const expected = passage(60);
    expect(expected.length).toBeGreaterThan(BAND * 2);

    const full = recite(expected, 400);
    const heard = [...full.slice(0, 900), ...full.slice(926)];

    expect(agreement(expected, heard))
      .toBe(agreement(expected, heard, expected.length * 2));
    expect(findCandidates(expected, heard))
      .toEqual(findCandidates(expected, heard, { band: expected.length * 2 }));
  }, 60_000);
});

/**
 * The lengths a ḥāfiẓ actually reviews at.
 *
 * Banding made the cost linear, which is not the same as bounded: ten juzʾ
 * still wanted 765 MB and the whole muṣḥaf 1.2 GB. Windowing fixes it at about
 * 8 MB whatever the length, and these are the tests that say so.
 */
describe('reciting far past a juzʾ', () => {
  it('crosses many windows without losing the thread', () => {
    const expected = passage(1200);
    expect(expected.length).toBeGreaterThan(WINDOW * 10);

    const heard = recite(expected);
    expect(findCandidates(expected, heard)).toEqual([]);
    expect(agreement(expected, heard)).toBe(1);
  }, 60_000);

  it('finds a slip in the middle of ten juzʾ', () => {
    const expected = passage(1200);
    const found = findCandidates(expected, recite(expected, 12_000));
    expect(found).toHaveLength(1);
  }, 60_000);

  /** Right on a window seam, which is the one place with less context. */
  it('finds a slip that straddles a window boundary', () => {
    const expected = passage(1200);
    const found = findCandidates(expected, recite(expected, WINDOW - 3));
    expect(found).toHaveLength(1);
  }, 60_000);

  it('finds slips in several different windows at once', () => {
    const expected = passage(1200);
    const heard = recite(expected);
    for (const at of [500, WINDOW + 500, WINDOW * 3 + 500]) {
      for (let i = at; i < at + 6; i++) heard[i] = { ...heard[i], symbol: `qq${i}` };
    }
    expect(findCandidates(expected, heard)).toHaveLength(3);
  }, 60_000);

  /**
   * The whole book in one sitting — which nobody does, since it is half a day
   * of continuous recitation. It is here because the failure it replaced was
   * not slowness but a 1.2 GB allocation, and «too slow to be worth it» is a
   * different kind of answer from «the app dies».
   *
   * Measured at about fourteen seconds for 311,878 symbols on a desktop, so
   * appreciably longer on a phone. Ten juzʾ — the longest anyone credibly
   * records at once — is two seconds, and that is the case above.
   */
  it('survives the entire muṣḥaf without asking for a gigabyte', () => {
    const expected = passage(6236);
    expect(expected.length).toBeGreaterThan(300_000);

    const heard = recite(expected, 150_000);
    const found = findCandidates(expected, heard);
    expect(found).toHaveLength(1);
    expect(agreement(expected, heard)).toBeGreaterThan(0.99);
  }, 120_000);
});
