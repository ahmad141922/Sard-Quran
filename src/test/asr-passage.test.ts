import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { passageBetween, passageFor, trimToVerse } from '@/lib/asr/use-asr';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import { agreement, findCandidates, reached } from '@/lib/asr/align';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * Where the passage comes from, now that the marker no longer decides it.
 *
 * The marker used to have to be exactly where the reciter stopped. Nobody moves
 * one perfectly while reciting from memory, and getting it wrong did not say
 * «the marker is behind» — it said «the recording was not clear enough», which
 * blames the room for a bookkeeping mistake. These tests are the promise that
 * it cannot happen again.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const index = phonemesFromFile(raw);

/** al-Baqara begins at id 8; the whole muṣḥaf is available. */
const quranIndex = {
  locOf: (id: number) => {
    if (id < 1 || id > 6236) return undefined;
    if (id <= 7) return { surah: 1, ayah: id };
    return { surah: 2, ayah: id - 7 };
  },
} as never;

const recite = (refs: ReturnType<typeof passageFor>, slipAt?: number): HeardPhoneme[] =>
  index.expected(refs).map((p, i) => ({
    symbol: slipAt !== undefined && i >= slipAt && i < slipAt + 6 ? `zz${i}` : p.symbol,
    confidence: null,
    atMs: i * 80,
  }));

describe('measuring out a passage', () => {
  it('starts where recording started, which is known exactly', () => {
    const passage = passageFor(quranIndex, index, 8, 8, 26);
    expect(passage[0].anchorId).toBe(8);
  });

  it('runs past the marker, far enough to cover what was heard', () => {
    // Ten verses of al-Baqara recited, marker left on the first.
    const truth = passageBetween(quranIndex, 8, 17);
    const heard = index.expected(truth).length;

    const passage = passageFor(quranIndex, index, 8, 8, heard);
    expect(passage.length).toBeGreaterThan(10);
    expect(index.expected(passage).length).toBeGreaterThan(heard);
  });

  it('never stops before the marker, however little was heard', () => {
    const passage = passageFor(quranIndex, index, 8, 30, 10);
    expect(passage[passage.length - 1].anchorId).toBeGreaterThanOrEqual(30);
  });

  it('stops at the end of the book rather than running off it', () => {
    const passage = passageFor(quranIndex, index, 6230, 6230, 500_000);
    expect(passage[passage.length - 1].anchorId).toBe(6236);
  });
});

describe('a reciter who never moved the marker', () => {
  /** Ten verses recited; the marker still sits on the first. */
  const truth = passageBetween(quranIndex, 8, 17);
  const heard = recite(truth);

  /**
   * Measured, not assumed. Ending the passage at the marker gave a **perfect**
   * score and two enormous «you recited something not in the text» candidates
   * covering 390 sounds — the ten verses actually read. Absurd, and stated with
   * complete confidence, which is the worst way to be wrong.
   */
  it('is not accused of reciting hundreds of sounds that are not in the text', () => {
    const atMarker = index.expected(passageBetween(quranIndex, 8, 8));
    const before = findCandidates(atMarker, heard);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(c => c.kind === 'insertion')).toBe(true);
    expect(before.reduce((n, c) => n + c.heard.length, 0)).toBeGreaterThan(300);

    const expected = index.expected(passageFor(quranIndex, index, 8, 8, heard.length));
    expect(findCandidates(expected, heard, { openEnd: true })).toEqual([]);
  });

  it('reads as a recitation followed all the way through', () => {
    const expected = index.expected(passageFor(quranIndex, index, 8, 8, heard.length));
    expect(agreement(expected, heard, undefined, true)).toBe(1);
  });

  it('is not accused of skipping the verses they never reached', () => {
    const passage = passageFor(quranIndex, index, 8, 8, heard.length);
    const expected = index.expected(passage);
    expect(findCandidates(expected, heard, { openEnd: true })).toEqual([]);
  });

  it('still has a real slip found, in the right verse', () => {
    const slipped = recite(truth, 200);
    const passage = passageFor(quranIndex, index, 8, 8, slipped.length);
    const expected = index.expected(passage);

    const found = findCandidates(expected, slipped, { openEnd: true });
    expect(found).toHaveLength(1);
    const at = index.expected(truth)[200].anchorId;
    expect(found[0].anchorId).toBe(at);
  });

  it('says how far the recitation actually reached', () => {
    const passage = passageFor(quranIndex, index, 8, 8, heard.length);
    const expected = index.expected(passage);
    expect(reached(expected, heard)).toBe(heard.length);
    // Which is well short of the passage it was measured against.
    expect(expected.length).toBeGreaterThan(heard.length);
  });
});

describe('what an over-long passage must not do', () => {
  const truth = passageBetween(quranIndex, 8, 12);
  const heard = recite(truth);
  const passage = passageFor(quranIndex, index, 8, 8, heard.length);
  const expected = index.expected(passage);

  /** The whole point: the tail is not a mistake. */
  it('reports no omission for the verses beyond where they stopped', () => {
    const found = findCandidates(expected, heard, { openEnd: true });
    expect(found.filter(c => c.kind === 'omission')).toEqual([]);
  });

  it('scores against what was reached, not against the padding', () => {
    expect(agreement(expected, heard, undefined, true)).toBe(1);
    // Without the flag the padding drags it down — which is the bug.
    expect(agreement(expected, heard)).toBeLessThan(1);
  });

  /** A stretch added at the very end is still an addition, not padding. */
  it('still reports something recited past the text', () => {
    const extra: HeardPhoneme[] = [
      ...heard,
      ...['qq1', 'qq2', 'qq3', 'qq4', 'qq5', 'qq6'].map((symbol, i) => ({
        symbol, confidence: null, atMs: (heard.length + i) * 80,
      })),
    ];
    const found = findCandidates(index.expected(passageBetween(quranIndex, 8, 12)), extra);
    expect(found.some(c => c.kind === 'insertion')).toBe(true);
  });
});

/**
 * The other way round, and the one that actually reached the reciter: the
 * marker ahead of what was read. Ending the passage there scored 0.02 and
 * produced «the recording was not clear enough» — a sentence about the room,
 * for a mistake about a marker.
 */
describe('a reciter whose marker ran ahead', () => {
  const heard = recite(passageBetween(quranIndex, 8, 8));

  it('used to be told the recording was unclear', () => {
    const tooFar = index.expected(passageBetween(quranIndex, 8, 17));
    expect(agreement(tooFar, heard)).toBeLessThan(0.5);
  });

  it('is now measured against only what was reached', () => {
    const tooFar = index.expected(passageBetween(quranIndex, 8, 17));
    expect(agreement(tooFar, heard, undefined, true)).toBe(1);
    expect(findCandidates(tooFar, heard, { openEnd: true })).toEqual([]);
  });
});

/**
 * The recitation that exposed all of this, reproduced.
 *
 * A reciter stood on al-Baqara 1 — «الم», eight sounds — and said «الف لام را».
 * A real slip, made on purpose to test the tool, and the tool said it had found
 * nothing.
 *
 * The cause was the open end. Rather than «you read something else at the end»,
 * the cheapest reading became «you stopped five sounds in and the rest was
 * extra»; the leftover was three sounds, under the run floor, so it was
 * dropped. Every slip near the end of a recitation would have gone the same
 * way, silently.
 */
describe('a slip at the very end of what was recited', () => {
  const alifLamMim = index.expected([{ surah: 2, ayah: 1, anchorId: 8 }]);

  /** «الم» with its last sounds said as something else. */
  const alifLamRa = (): HeardPhoneme[] =>
    alifLamMim.map((p, i) => ({
      symbol: i >= alifLamMim.length - 3 ? `ra${i}` : p.symbol,
      confidence: null,
      atMs: i * 300,
    }));

  it('is a verse of eight sounds, so there is little room to hide', () => {
    expect(alifLamMim).toHaveLength(8);
  });

  /** What went wrong: the open end turned the slip into an early stop. */
  it('would be lost if the text were free to stop anywhere', () => {
    const padded = passageFor(quranIndex, index, 8, 8, alifLamRa().length);
    const expected = index.expected(padded);
    expect(findCandidates(expected, alifLamRa(), { openEnd: true })).toEqual([]);
  });

  /** And is found once the text may only stop where a verse does. */
  it('is found when the passage is trimmed to the verse first', () => {
    const padded = passageFor(quranIndex, index, 8, 8, alifLamRa().length);
    const got = reached(index.expected(padded), alifLamRa());
    const kept = trimToVerse(padded, index, got);

    expect(kept).toHaveLength(1);
    expect(kept[0].anchorId).toBe(8);

    const found = findCandidates(index.expected(kept), alifLamRa());
    expect(found).toHaveLength(1);
    expect(found[0].anchorId).toBe(8);
  });
});

describe('trimming to a verse', () => {
  const passage = passageBetween(quranIndex, 8, 20);

  it('keeps the verse the recitation ended inside, not the one before it', () => {
    const oneAndABit = index.expected(passage.slice(0, 1)).length + 3;
    expect(trimToVerse(passage, index, oneAndABit)).toHaveLength(2);
  });

  it('keeps exactly the verses recited when they end on a boundary', () => {
    const three = index.expected(passage.slice(0, 3)).length;
    expect(trimToVerse(passage, index, three)).toHaveLength(3);
  });

  it('never trims away everything, however little was heard', () => {
    expect(trimToVerse(passage, index, 0)).toHaveLength(1);
  });

  it('keeps the whole passage when the recitation covered it', () => {
    const all = index.expected(passage).length;
    expect(trimToVerse(passage, index, all)).toHaveLength(passage.length);
  });
});
