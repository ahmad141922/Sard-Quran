import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { matnPhonemes, baytSounds, AHEAD_ABYAT } from '@/lib/matn/phonemes';
import { matnFromFile, type MatnFile } from '@/lib/matn/load';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import { followStep, START, moved } from '@/lib/asr/follow';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * A matn's sounds, and a reciter followed through one.
 *
 * The claim being tested is the one the whole design rests on: **a bayt stands
 * exactly where a verse stands.** The aligner and the follower were written for
 * the Qur'an and know nothing about it — they take a numeric id and a list of
 * sounds — so if that is true, following a matn needs no new machinery at all,
 * and these tests are what say so.
 */

/*
 * The real index, not just its symbol list: a matn's sounds have to come out in
 * the alphabet the **model** emits, which is coarser than the index's own, and
 * `matnPhonemes` is what does that translation. Passing anything less here
 * would test everything except the step most likely to be wrong.
 */
const index = phonemesFromFile(
  JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8')),
);
const alphabet = new Set(
  (JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8')) as { model: (string | null)[] })
    .model.filter((m): m is string => m !== null),
);

const jazariyya = matnFromFile(
  JSON.parse(readFileSync('sard/public/matn-jazariyya.json', 'utf8')) as MatnFile,
);
const sounds = matnPhonemes(jazariyya, index);

/** A recitation of the abyāt `from`..`to`, exactly as written. */
const recited = (from: number, to: number): HeardPhoneme[] =>
  sounds.expected(from, to).map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

describe('a matn’s sounds', () => {
  it('has them for every bayt, and enough of them to align on', () => {
    for (const bayt of jazariyya.abyat) {
      expect(sounds.sizeOf(bayt.n), `bayt ${bayt.n}`).toBeGreaterThan(10);
    }
    expect(sounds.size).toBeGreaterThan(3000);
  });

  /**
   * In the alphabet the **model** emits, not the index's own richer one. A matn
   * phonemised into the wrong one does not fail — it matches nothing, which on
   * screen looks like a reciter who has gone silent.
   */
  it('says them all in the alphabet the model actually emits', () => {
    for (const p of sounds.expected(1, jazariyya.abyat.length)) {
      expect(alphabet.has(p.symbol), p.symbol).toBe(true);
    }
  });

  it('says them in the same alphabet the Qur’an index does', () => {
    const quranSymbols = new Set(index.expected([{ surah: 1, ayah: 1, anchorId: 1 }]).map(p => p.symbol));
    const matnSymbols = new Set(sounds.expected(1, 20).map(p => p.symbol));
    for (const s of quranSymbols) expect(alphabet.has(s)).toBe(true);
    expect([...matnSymbols].every(s => alphabet.has(s))).toBe(true);
  });

  it('marks each sound with the bayt it belongs to', () => {
    const three = sounds.expected(5, 7);
    expect(new Set(three.map(p => p.anchorId))).toEqual(new Set([5, 6, 7]));
    expect(three.filter(p => p.anchorId === 5)).toHaveLength(sounds.sizeOf(5));
  });

  it('numbers the words of a bayt, and stops at the last of them', () => {
    const bayt = 20;
    const said = sounds.expected(bayt, bayt);
    const words = sounds.wordsOf(bayt);
    expect(words.length).toBeGreaterThan(4);
    expect(Math.max(...said.map(p => p.word!))).toBe(words.length - 1);
    expect(Math.min(...said.map(p => p.word!))).toBe(0);
  });

  /**
   * Both hemistichs are phonemised together, because a bayt is recited as one
   * line: a rule that reaches across the caesura has to be allowed to.
   */
  it('reads the bayt whole, not its halves apart', () => {
    // Asked of the whole matn rather than of a chosen line: picking the one
    // bayt where it happens to matter would be fitting the test to the answer.
    const differ = jazariyya.abyat.filter(b => {
      const whole = baytSounds(b.sadr, b.ajz, index.alphabet).map(s => s.symbol).join(' ');
      const apart = [
        ...baytSounds(b.sadr, '', index.alphabet),
        ...baytSounds('', b.ajz, index.alphabet),
      ].map(s => s.symbol).join(' ');
      return whole !== apart;
    });
    expect(differ.length).toBeGreaterThan(0);
  });
});

describe('what the follower is given', () => {
  it('offers a window of abyāt, not the whole matn', () => {
    expect(sounds.ahead(1)).toHaveLength(AHEAD_ABYAT);
    expect(sounds.ahead(1).map(a => a.anchorId)).toEqual(
      Array.from({ length: AHEAD_ABYAT }, (_, i) => i + 1),
    );
  });

  it('stops at the end of the matn rather than running past it', () => {
    const last = jazariyya.abyat.length;
    expect(sounds.ahead(last)).toHaveLength(1);
    expect(sounds.ahead(last)[0].anchorId).toBe(last);
    expect(sounds.ahead(last + 5)).toHaveLength(0);
  });

  it('reports each bayt’s length alongside its sounds', () => {
    for (const a of sounds.ahead(40, 4)) {
      expect(a.sounds).toBe(a.expected.length);
      expect(a.sounds).toBe(sounds.sizeOf(a.anchorId));
    }
  });
});

/**
 * The follower, unchanged, following a matn.
 *
 * Not one line of `follow.ts` knows what a matn is. These are the same three
 * rules it keeps for the muṣḥaf — forward only, behind never ahead, and only
 * when the tail agrees — asked of abyāt instead of āyāt.
 */
describe('following a reciter through a matn', () => {
  it('moves to a bayt they have finished', () => {
    const heard = recited(1, 2);
    const next = followStep(sounds.ahead(1), heard, START);
    expect(next.anchorId).toBe(2);
    expect(moved(START, next)).toBe(true);
  });

  it('stays behind them, never ahead', () => {
    // Two abyāt and a little of the third: it must confirm 2, not 3.
    const heard = [...recited(1, 2), ...recited(3, 3).slice(0, 6)];
    expect(followStep(sounds.ahead(1), heard, START).anchorId).toBe(2);
  });

  it('says where in the line they are, without moving the marker there', () => {
    const heard = [...recited(1, 1), ...recited(2, 2).slice(0, 14)];
    const next = followStep(sounds.ahead(1), heard, START);
    expect(next.anchorId).toBe(1);
    expect(next.at?.anchorId).toBe(2);
    expect(next.at?.word).toBeGreaterThanOrEqual(0);
  });

  /**
   * The window starts at the bayt **after** the confirmed one, which is what
   * the muṣḥaf side does too: the sounds already accounted for are not offered
   * again, or the follower would try to match them twice.
   */
  it('carries on from where it left off', () => {
    const first = followStep(sounds.ahead(1), recited(1, 2), START);
    expect(first.anchorId).toBe(2);
    const second = followStep(sounds.ahead(first.anchorId! + 1), recited(1, 4), first);
    expect(second.anchorId).toBe(4);
  });

  /** Silence is the safe failure: a stretch that does not match moves nothing. */
  it('moves nothing when what it hears is not the matn', () => {
    const elsewhere = sounds.expected(90, 92)
      .map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));
    const next = followStep(sounds.ahead(1), elsewhere, START);
    expect(next.anchorId).toBeNull();
    expect(moved(START, next)).toBe(false);
  });
});
