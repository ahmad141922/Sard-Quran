import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  MIN_NEW_SOUNDS, START, WINDOW_SOUNDS, followStep, moved, type Ahead, type FollowState,
} from '@/lib/asr/follow';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * The marker moving itself while somebody recites.
 *
 * Almost every test here is about **not** moving. A marker that jumps to the
 * wrong verse mid-recitation loses the reciter their place on the page, which
 * is worse than never having moved at all — so the safe failure is silence,
 * and these are the cases that must produce it.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const index = phonemesFromFile(raw);

/** al-Baqara 1 onwards — id 8 in the canonical numbering. */
const verses = (n: number, from = 8): Ahead[] =>
  Array.from({ length: n }, (_, i) => {
    const ayah = from - 7 + i;
    const expected = index.expected([{ surah: 2, ayah, anchorId: from + i }]);
    return { anchorId: from + i, sounds: expected.length, expected };
  });

/** Recited exactly as written, up to `count` sounds. */
const recite = (ahead: Ahead[], count?: number): HeardPhoneme[] => {
  const all = ahead.flatMap(v => v.expected);
  return all.slice(0, count ?? all.length).map((p, i) => ({
    symbol: p.symbol, confidence: null, atMs: i * 80,
  }));
};

describe('following a clean recitation', () => {
  const ahead = verses(6);

  it('confirms the verses once they have been finished', () => {
    const two = ahead[0].sounds + ahead[1].sounds;
    const after = followStep(ahead, recite(ahead, two));
    expect(after.anchorId).toBe(9);
    expect(after.heardUsed).toBe(two);
  });

  it('confirms several as the recitation runs on', () => {
    const three = ahead.slice(0, 3).reduce((n, v) => n + v.sounds, 0);
    expect(followStep(ahead, recite(ahead, three)).anchorId).toBe(10);
  });

  it('carries on from where the last step left it', () => {
    const first = followStep(ahead, recite(ahead, ahead[0].sounds));
    const two = ahead[0].sounds + ahead[1].sounds;
    const second = followStep(ahead.slice(1), recite(ahead, two), first);
    expect(second.anchorId).toBe(9);
    expect(moved(first, second)).toBe(true);
  });
});

describe('the verse in progress', () => {
  const ahead = verses(6);

  /**
   * Behind, never ahead. Moving to the verse they are *in* would put the
   * marker where they have not reached and invite them to follow it.
   */
  it('is not confirmed while it is still being recited', () => {
    const halfWayIntoTheSecond = ahead[0].sounds + Math.floor(ahead[1].sounds / 2);
    expect(followStep(ahead, recite(ahead, halfWayIntoTheSecond)).anchorId).toBe(8);
  });

  it('confirms nothing at all before the first verse is finished', () => {
    const partial = Math.floor(ahead[0].sounds / 2);
    expect(followStep(ahead, recite(ahead, partial))).toEqual(START);
  });
});

describe('when it must not move', () => {
  const ahead = verses(6);

  it('waits rather than acting on a handful of sounds', () => {
    expect(followStep(ahead, recite(ahead, MIN_NEW_SOUNDS - 1))).toEqual(START);
  });

  /** A recitation the model could not follow moves nothing. */
  it('stays put when what was heard does not match the text', () => {
    const noise: HeardPhoneme[] = Array.from({ length: 80 }, (_, i) => ({
      symbol: `zz${i}`, confidence: null, atMs: i * 80,
    }));
    expect(followStep(ahead, noise)).toEqual(START);
  });

  it('stays put when the reciter began somewhere else entirely', () => {
    const elsewhere = verses(4, 300);
    const heard = recite(elsewhere);
    expect(followStep(ahead, heard)).toEqual(START);
  });

  it('has nothing to say when there is no passage ahead', () => {
    expect(followStep([], recite(ahead))).toEqual(START);
  });

  it('reports no movement when a step confirmed the same verse again', () => {
    const state = followStep(ahead, recite(ahead, ahead[0].sounds));
    const again = followStep(ahead, recite(ahead, ahead[0].sounds), START);
    expect(moved(state, again)).toBe(false);
  });
});

describe('never backwards', () => {
  const ahead = verses(6);

  /**
   * The single most disorienting thing this could do. A step only ever looks
   * at the passage *after* what is already confirmed, so going back is not
   * something it can express.
   */
  it('cannot express a move to an earlier verse', () => {
    const three = ahead.slice(0, 3).reduce((n, v) => n + v.sounds, 0);
    const state = followStep(ahead, recite(ahead, three));
    expect(state.anchorId).toBe(10);

    // The reciter goes quiet; nothing new is heard.
    const next = followStep(ahead.slice(3), recite(ahead, three), state);
    expect(next.anchorId).toBe(10);
    expect(moved(state, next)).toBe(false);
  });

  it('keeps its confirmation when the recitation turns to noise', () => {
    const two = ahead[0].sounds + ahead[1].sounds;
    const state = followStep(ahead, recite(ahead, two));
    expect(state.anchorId).toBe(9);

    const noisy = [
      ...recite(ahead, two),
      ...Array.from({ length: 60 }, (_, i) => ({
        symbol: `qq${i}`, confidence: null, atMs: (two + i) * 80,
      })),
    ];
    expect(followStep(ahead.slice(2), noisy, state).anchorId).toBe(9);
  });
});

describe('what a step costs', () => {
  /**
   * A step runs every second or so while somebody recites, so it must cost the
   * same at the end of a juzʾ as at the start of a page.
   */
  it('looks at a bounded stretch however long the passage ahead is', () => {
    const many = verses(250);
    const total = many.reduce((n, v) => n + v.sounds, 0);
    expect(total).toBeGreaterThan(WINDOW_SOUNDS * 10);

    const started = Date.now();
    const state = followStep(many, recite(many, 400));
    expect(Date.now() - started).toBeLessThan(1500);
    expect(state.anchorId).not.toBeNull();
  });

  it('costs the same on a later step as on the first', () => {
    const many = verses(250);
    const early: FollowState = { anchorId: 8, heardUsed: many[0].sounds, at: null };
    const started = Date.now();
    followStep(many.slice(1), recite(many, 900), early);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

/**
 * al-Baqara 1 is «الم» — a complete verse of eight sounds, and below the floor.
 *
 * It stays unconfirmed on its own, deliberately. Eight sounds was already
 * judged too little to have an opinion about when merely *showing* candidates
 * (`review.ts`); moving the marker acts on the reciter's behalf while they are
 * mid-verse, so it cannot be done on less.
 */
describe('a verse too short to act on by itself', () => {
  const ahead = verses(6);

  it('is not confirmed on its own', () => {
    expect(ahead[0].sounds).toBeLessThan(MIN_NEW_SOUNDS);
    expect(followStep(ahead, recite(ahead, ahead[0].sounds))).toEqual(START);
  });

  it('is confirmed as soon as the next verse carries it past the floor', () => {
    const two = ahead[0].sounds + ahead[1].sounds;
    expect(followStep(ahead, recite(ahead, two)).anchorId).toBe(9);
  });
});

/**
 * Where the recitation is **now**, as distinct from what it has finished.
 *
 * This one is a live estimate: it changes every poll and is usually mid-word.
 * It exists to be shown, and the marker is never moved by it — the tests below
 * are mostly about keeping those two apart.
 */
describe('the word being recited now', () => {
  const ahead = verses(6);

  it('names the verse and the word part way into one', () => {
    const into = ahead[0].sounds + Math.floor(ahead[1].sounds / 2);
    const at = followStep(ahead, recite(ahead, into)).at;
    expect(at?.anchorId).toBe(9);
    expect(at?.word).not.toBeNull();
    expect(at!.word!).toBeGreaterThanOrEqual(0);
  });

  it('moves through the words as the verse is recited', () => {
    const start = ahead[0].sounds + 4;
    const later = ahead[0].sounds + ahead[1].sounds - 3;
    const early = followStep(ahead, recite(ahead, start)).at;
    const late = followStep(ahead, recite(ahead, later)).at;
    expect(late!.word!).toBeGreaterThan(early!.word!);
  });

  /** The distinction the whole type exists for. */
  it('is not what the marker follows', () => {
    const into = ahead[0].sounds + Math.floor(ahead[1].sounds / 2);
    const state = followStep(ahead, recite(ahead, into));
    // The verse in progress is 9; the verse confirmed is 8.
    expect(state.at?.anchorId).toBe(9);
    expect(state.anchorId).toBe(8);
  });

  it('says nothing before there is enough to place', () => {
    expect(followStep(ahead, recite(ahead, MIN_NEW_SOUNDS - 1)).at).toBeNull();
  });

  it('says nothing when the recitation does not match the text', () => {
    const noise: HeardPhoneme[] = Array.from({ length: 80 }, (_, i) => ({
      symbol: `zz${i}`, confidence: null, atMs: i * 80,
    }));
    expect(followStep(ahead, noise).at).toBeNull();
  });

  /**
   * al-Baqara 1 is «الم» — one of the 94 āyāt whose printed words could not be
   * checked, so its sounds carry no word at all. The verse is still placed;
   * only the word is silent.
   */
  it('places the verse but not the word where the words are unknown', () => {
    const first = verses(1);
    const at = followStep([...first, ...verses(2, 9)], recite(ahead, ahead[0].sounds + 4)).at;
    expect(at).not.toBeNull();
    expect(at!.anchorId).toBeGreaterThan(0);
  });
});
