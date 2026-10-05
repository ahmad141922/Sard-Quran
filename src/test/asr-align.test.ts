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

  it('catches a word left out', () => {
    const found = findCandidates(expect_('a b c d e f g h i'), heard_('a b c g h i'));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('omission');
    expect(found[0].expected).toEqual(['d', 'e', 'f']);
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
    const quiet = heard_('a b c g h i', 0.1);
    const found = findCandidates(expect_('a b c d e f g h i'), quiet);
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
    const found = findCandidates(expect_('a b c d e f g h i'), unrated('a b c g h i'));
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

/**
 * Seen on a correct al-Fātiḥa (synthesised speech, spikes/asr-web): the model
 * — sherpa-onnx on Android and the browser port alike — heard «بسم الله» as
 * «بِ س مِ هِ», without the «لّا». That was reported as a slip in the first
 * words of the Qur'an, which nobody made.
 */
describe('part of a word the model swallowed', () => {
  /** The opening of 1:1 as quran-phonemes.json has it, one word per group. */
  const basmala: ExpectedPhoneme[] = [
    ['بِ', 0], ['س', 0], ['مِ', 0], ['للَ', 1], ['اا', 1], ['هِ', 1], ['ررَ', 2], ['ح', 2], ['مَ', 2],
  ].map(([symbol, word]) => ({ symbol: symbol as string, anchorId: 1, word: word as number }));

  it('is not a slip when the rest of the word was heard', () => {
    const heard = heard_('بِ س مِ هِ ررَ ح مَ');
    expect(findCandidates(basmala, heard)).toEqual([]);
    expect(findCandidates(basmala, heard.map(h => ({ ...h, confidence: null })))).toEqual([]);
  });

  it('is a slip when the whole word is gone', () => {
    const found = findCandidates(basmala, heard_('بِ س مِ ررَ ح مَ'));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('omission');
    expect(found[0].word).toBe(1);
  });

  it('is reported all the same when the gap is long, word or not', () => {
    const found = findCandidates(expect_('a b c d e f g h i'), heard_('a i'), { minRunUnrated: 5 });
    expect(found.length).toBeGreaterThan(0);
  });

  it('falls back to the length rule where word boundaries are unknown', () => {
    const noWords = expect_('a b c d e f g h i').map(p => ({ ...p, word: null }));
    expect(findCandidates(noWords, heard_('a b c g h i'))).toEqual([]);
    expect(findCandidates(noWords, heard_('a b h i'))).toHaveLength(1);
  });
});

describe('where a candidate points', () => {
  /**
   * Seen on 1:4–5 recited with «إياك نعبد و» left out (synthesised speech):
   * the model heard the madd of «الدين» short, so the run began inside 1:4.
   */
  it('points at the first whole word a run takes out, not at the sound it began with', () => {
    const exp: ExpectedPhoneme[] = [
      ['ددِ', 4, 2], ['ۦۦۦۦ', 4, 2], ['ن', 4, 2],
      ['ءِ', 5, 0], ['ييَ', 5, 0], ['اا', 5, 0], ['كَ', 5, 0],
      ['نَ', 5, 1], ['ع', 5, 1], ['بُ', 5, 1], ['دُ', 5, 1],
      ['وَ', 5, 2], ['ءِ', 5, 2], ['ييَ', 5, 2], ['اا', 5, 2], ['كَ', 5, 2],
      ['نَ', 5, 3], ['س', 5, 3], ['تَ', 5, 3], ['عِ', 5, 3], ['ۦۦۦۦ', 5, 3], ['ن', 5, 3],
    ].map(([symbol, anchorId, word]) => ({ symbol: symbol as string, anchorId: anchorId as number, word: word as number }));
    const heard = heard_('ددِ نِ ءِ ييَ اا كَ نَ س تَ عِ ۦۦ نُ').map(h => ({ ...h, confidence: null }));
    const found = findCandidates(exp, heard);
    const big = found.find(c => c.expected.length >= 8)!;
    expect(big).toBeDefined();
    expect(big.anchorId).toBe(5);
    expect(big.word).toBe(0);
  });
});

/**
 * Seen on al-Baqara 58 (synthesised speech): «رَغَدًا وَادْخُلُوا» read without
 * its idghām, as «رغدن وادخلوا», was raised as a slip. How a tanwīn joins the
 * next word is tajwīd, which the tool does not judge.
 */
describe('a nūn said where the text merges it', () => {
  // «رغدا» [0..2] then «وادخلوا» [3..7]; the merge is «وووَ دڇ».
  const exp: ExpectedPhoneme[] = [
    ['رَ', 0], ['غَ', 0], ['دَ', 0], ['وووَ', 1], ['دڇ', 1], ['خُ', 1], ['لُ', 1], ['ۦۦ', 1],
  ].map(([symbol, word]) => ({ symbol: symbol as string, anchorId: 58, word: word as number }));
  const unrated = (s: string) => heard_(s).map(h => ({ ...h, confidence: null }));

  it('is not a slip', () => {
    expect(findCandidates(exp, unrated('رَ غَ دَ ن وَ د خُ لُ ۦۦ'), { minRunUnrated: 2 })).toEqual([]);
  });

  it('is still a slip when the word itself changed', () => {
    // «فادخلوا» for «وادخلوا»: no nūn, a different word.
    expect(findCandidates(exp, unrated('رَ غَ دَ فَ د خُ لُ ۦۦ'), { minRunUnrated: 2 }).length).toBeGreaterThan(0);
  });

  it('is still a slip in the middle of a word', () => {
    const word: ExpectedPhoneme[] = ['ءَ', 'ررَ', 'حِ', 'ۦۦۦۦ', 'م'].map(symbol => ({ symbol, anchorId: 3, word: 1 }));
    expect(findCandidates(word, unrated('ءَ ن كَ رِ ۦۦ م'))).toHaveLength(1);
  });
});
