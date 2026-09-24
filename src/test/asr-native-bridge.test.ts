import { describe, it, expect } from 'vitest';

import { readPhonemes } from '@/lib/asr/native-engine';

/**
 * The bridge between the plugin and everything above it.
 *
 * Both directions of this have already gone wrong once on a real device, so
 * both are pinned here: a confidence the decoder never produced must arrive as
 * an absence rather than as a zero, and a number that makes no sense at all
 * must throw the recording away rather than be worked around.
 */

const row = (over: Record<string, unknown> = {}) =>
  ({ symbol: 'a', confidence: 0.9, atMs: 0, ...over }) as never;

describe('reading what the plugin sent', () => {
  it('passes a rated sound through unchanged', () => {
    expect(readPhonemes([row()])).toEqual([{ symbol: 'a', confidence: 0.9, atMs: 0 }]);
  });

  /**
   * The real model's normal case: sherpa-onnx's CTC decoder finds the most
   * likely symbol per frame and discards the likelihood. Sending 0 for that —
   * which the first build did — put every confidence below `MIN_CONFIDENCE`
   * and silently suppressed every candidate the feature exists to raise.
   */
  it('keeps an unrated sound as unrated, and never as zero', () => {
    const read = readPhonemes([row({ confidence: null })]);
    expect(read).toEqual([{ symbol: 'a', confidence: null, atMs: 0 }]);
    expect(read![0].confidence).not.toBe(0);
  });

  it('treats a missing field the same as an explicit null', () => {
    const read = readPhonemes([{ symbol: 'a', atMs: 0 } as never]);
    expect(read![0].confidence).toBeNull();
  });

  it('takes a whole recording of unrated sounds', () => {
    const read = readPhonemes([
      row({ confidence: null }), row({ symbol: 'b', confidence: null, atMs: 90 }),
    ]);
    expect(read).toHaveLength(2);
    expect(read!.every(p => p.confidence === null)).toBe(true);
  });
});

describe('what it throws the recording away for', () => {
  /**
   * A number outside 0..1 means the two sides disagree about what is being
   * sent — a log-probability never exponentiated, a percentage, a sentinel.
   * Each would defeat the confidence gate quietly, so none is accepted.
   */
  it('refuses a confidence above one', () => {
    expect(readPhonemes([row({ confidence: 1.5 })])).toBeNull();
  });

  it('refuses a negative confidence — an un-exponentiated log-probability', () => {
    expect(readPhonemes([row({ confidence: -2.3 })])).toBeNull();
  });

  it('refuses a confidence that is not a number at all', () => {
    expect(readPhonemes([row({ confidence: Number.NaN })])).toBeNull();
    expect(readPhonemes([row({ confidence: 'high' })])).toBeNull();
  });

  it('refuses a sound with no symbol', () => {
    expect(readPhonemes([row({ symbol: '' })])).toBeNull();
    expect(readPhonemes([row({ symbol: null })])).toBeNull();
  });

  it('refuses a time that could not have happened', () => {
    expect(readPhonemes([row({ atMs: -1 })])).toBeNull();
    expect(readPhonemes([row({ atMs: Number.NaN })])).toBeNull();
  });

  /** One bad row spoils the recording; a partial list would read as omissions. */
  it('refuses the whole recording for one bad row, not just that row', () => {
    expect(readPhonemes([row(), row({ confidence: 9 }), row()])).toBeNull();
  });

  it('has nothing to say about an empty recording', () => {
    expect(readPhonemes([])).toEqual([]);
  });
});
