import { describe, it, expect } from 'vitest';

import {
  MIN_AGREEMENT, MIN_CONFIDENCE, MIN_RUN_UNRATED, agreement, findCandidates,
  type ExpectedPhoneme, type HeardPhoneme,
} from '@/lib/asr/align';

/**
 * The judgement of the whole feature, in one pure function.
 *
 * The tests that matter most are the refusals. A model that mishears is the
 * model's failure, and reporting it as the reciter's mistake tells a child
 * they erred where they did not — in a tool whose entire claim is that it
 * records what actually happened.
 */

/** «a b c» → expected phonemes, all in one verse, one word each three sounds. */
const expect_ = (symbols: string, anchorId = 100): ExpectedPhoneme[] =>
  symbols.split(' ').map((symbol, i) => ({ symbol, anchorId, word: Math.floor(i / 3) }));

/** «a b c» → heard phonemes, confident and evenly spaced, unless told otherwise. */
const heard_ = (symbols: string, confidence = 0.95): HeardPhoneme[] =>
  symbols.split(' ').map((symbol, i) => ({ symbol, confidence, atMs: i * 100 }));

describe('a clean recitation', () => {
  it('produces no candidates at all', () => {
    expect(findCandidates(expect_('a b c d e f'), heard_('a b c d e f'))).toEqual([]);
  });

  it('reads as complete agreement', () => {
    expect(agreement(expect_('a b c d'), heard_('a b c d'))).toBe(1);
  });

  it('has nothing to say about an empty passage', () => {
    expect(findCandidates([], heard_('a b c'))).toEqual([]);
    expect(agreement([], heard_('a b c'))).toBe(0);
  });
});

describe('finding where the recitation left the text', () => {
  it('catches a stretch said differently', () => {
    const found = findCandidates(expect_('a b c d e f'), heard_('a b x y e f'));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('substitution');
    expect(found[0].expected).toEqual(['c', 'd']);
    expect(found[0].heard).toEqual(['x', 'y']);
  });

  it('catches a stretch left out', () => {
    const found = findCandidates(expect_('a b c d e f'), heard_('a b e f'));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('omission');
    expect(found[0].expected).toEqual(['c', 'd']);
    expect(found[0].atMs).toBeNull();
  });

  it('catches a stretch added', () => {
    const found = findCandidates(expect_('a b c d'), heard_('a b x y c d'));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('insertion');
    expect(found[0].heard).toEqual(['x', 'y']);
  });

  it('says where in the muṣḥaf it happened', () => {
    const expected = [
      ...expect_('a b c', 100),
      ...expect_('d e f', 200),
    ];
    const found = findCandidates(expected, heard_('a b c x y f'));
    expect(found[0].anchorId).toBe(200);
  });

  it('carries the moment in the recording, so the reciter can hear it back', () => {
    const found = findCandidates(expect_('a b c d e f'), heard_('a b x y e f'));
    expect(found[0].atMs).toBe(200);
  });

  /** A word said wrongly is one thing that happened, not five. */
  it('gathers a run into one candidate rather than one per sound', () => {
    const found = findCandidates(expect_('a b c d e f g h'), heard_('a x y z w f g h'));
    expect(found).toHaveLength(1);
    expect(found[0].expected.length).toBeGreaterThan(2);
  });

  it('keeps two separate stumbles separate', () => {
    const found = findCandidates(expect_('a b c d e f g h i j'), heard_('x x c d e f y y i j'));
    expect(found).toHaveLength(2);
  });
});

describe('what it refuses to blame the reciter for', () => {
  /** The test this whole module exists for. */
  it('says nothing where the recogniser was unsure', () => {
    const shaky = heard_('a b x y e f', MIN_CONFIDENCE - 0.1);
    expect(findCandidates(expect_('a b c d e f'), shaky)).toEqual([]);
  });

  it('but speaks where it was sure', () => {
    const sure = heard_('a b x y e f', MIN_CONFIDENCE + 0.1);
    expect(findCandidates(expect_('a b c d e f'), sure)).toHaveLength(1);
  });

  /** One shaky sound in a run is enough to make the whole claim unsafe. */
  it('is governed by the least sure sound in the run', () => {
    const mixed: HeardPhoneme[] = [
      { symbol: 'a', confidence: 0.99, atMs: 0 },
      { symbol: 'b', confidence: 0.99, atMs: 100 },
      { symbol: 'x', confidence: 0.99, atMs: 200 },
      { symbol: 'y', confidence: 0.2, atMs: 300 },
      { symbol: 'e', confidence: 0.99, atMs: 400 },
      { symbol: 'f', confidence: 0.99, atMs: 500 },
    ];
    expect(findCandidates(expect_('a b c d e f'), mixed)).toEqual([]);
  });

  it('ignores a single stray sound as a breath, not a slip', () => {
    const found = findCandidates(expect_('a b c d e f'), heard_('a b x d e f'), { minRun: 3 });
    expect(found).toEqual([]);
  });

  /**
   * An omission has nothing heard to be unsure about, so confidence cannot
   * silence it — what was not said was not said.
   */
  it('still reports something never uttered, whatever the confidence', () => {
    const quiet = heard_('a b e f', 0.1);
    const found = findCandidates(expect_('a b c d e f'), quiet);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('omission');
  });
});

describe('whether the recording is worth reading at all', () => {
  it('scores a recitation the model could barely follow as low', () => {
    const score = agreement(expect_('a b c d e f g h'), heard_('x y z w v u t s'));
    expect(score).toBeLessThan(MIN_AGREEMENT);
  });

  it('scores a mostly-right recitation as high', () => {
    const score = agreement(expect_('a b c d e f g h'), heard_('a b c d e f g x'));
    expect(score).toBeGreaterThan(MIN_AGREEMENT);
  });
});

/**
 * What happens when the decoder rates nothing at all.
 *
 * This is the real model's behaviour, not a hypothetical: sherpa-onnx's CTC
 * greedy decoder takes the most likely symbol at each frame and discards the
 * likelihood, so every confidence arrives null. The first build sent 0 for
 * that, and 0 is below `MIN_CONFIDENCE` — so every candidate was suppressed
 * and the feature looked as though it worked while saying nothing at all.
 */
describe('when the decoder rated nothing', () => {
  /** «a b c» → heard, with no confidence attached to any of it. */
  const unrated = (symbols: string): HeardPhoneme[] =>
    symbols.split(' ').map((symbol, i) => ({ symbol, confidence: null, atMs: i * 100 }));

  it('does not treat the silence as zero and suppress everything', () => {
    const found = findCandidates(expect_('a b c d e f g h'), unrated('a b x y z w g h'));
    expect(found).toHaveLength(1);
    expect(found[0].confidence).toBeNull();
  });

  it('does not treat it as certainty either — a short run is still dropped', () => {
    const found = findCandidates(expect_('a b c d e f'), unrated('a b x y e f'));
    expect(found).toEqual([]);
  });

  it('asks for a longer run instead, since nothing else can filter', () => {
    const short = findCandidates(expect_('a b c d e f g h'), unrated('a b x y e f g h'));
    const long = findCandidates(expect_('a b c d e f g h'), unrated('a b x y z w g h'));
    expect(short).toEqual([]);
    expect(long).toHaveLength(1);
    expect(MIN_RUN_UNRATED).toBeGreaterThan(2);
  });

  /** What was never uttered was never uttered, rated or not. */
  it('still reports an omission, which needs no confidence to be true', () => {
    const found = findCandidates(expect_('a b c d e f'), unrated('a b e f'));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('omission');
    expect(found[0].confidence).toBe(1);
  });

  it('scores agreement exactly as it would with ratings', () => {
    expect(agreement(expect_('a b c d'), unrated('a b c d'))).toBe(1);
    expect(agreement(expect_('a b c d'), unrated('x y z w'))).toBe(0);
  });

  /** One rated symbol in the run is enough to bring the gate back. */
  it('applies the confidence gate again as soon as the decoder does rate', () => {
    const mixed: HeardPhoneme[] = [
      { symbol: 'a', confidence: 0.99, atMs: 0 },
      { symbol: 'b', confidence: 0.99, atMs: 100 },
      { symbol: 'x', confidence: 0.99, atMs: 200 },
      { symbol: 'y', confidence: 0.99, atMs: 300 },
      { symbol: 'e', confidence: 0.99, atMs: 400 },
      { symbol: 'f', confidence: 0.99, atMs: 500 },
    ];
    expect(findCandidates(expect_('a b c d e f'), mixed)).toHaveLength(1);
    expect(MIN_CONFIDENCE).toBeGreaterThan(0);
  });
});
