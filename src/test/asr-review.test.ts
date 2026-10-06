import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ACCEPTED_KIND, MIN_SOUNDS, acceptedCandidates, answer, candidateDetail, dismissRest,
  pendingCount, reviewRecitation, basmalaBefore, reviewWithOpening,
} from '@/lib/asr/review';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import { MIN_AGREEMENT, type ExpectedPhoneme, type HeardPhoneme } from '@/lib/asr/align';
import { acceptedOnly } from '@/lib/asr/engine';

/**
 * The step between the aligner and the screen, and the boundary it guards:
 * a candidate is a question until a person answers it.
 */

const expect_ = (symbols: string, anchorId = 100): ExpectedPhoneme[] =>
  symbols.split(' ').map((symbol, i) => ({ symbol, anchorId, word: Math.floor(i / 3) }));

const heard_ = (symbols: string, confidence = 0.95): HeardPhoneme[] =>
  symbols.split(' ').map((symbol, i) => ({ symbol, confidence, atMs: i * 100 }));

const t = (key: string) => key;

describe('reading one recording', () => {
  it('asks about a stretch said differently', () => {
    const r = reviewRecitation(expect_('a b c d e f'), heard_('a b x y e f'), 9000, { minSounds: 0 });
    expect(r.followed).toBe(true);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].verdict).toBe('pending');
    expect(r.durationMs).toBe(9000);
  });

  it('asks about nothing when the recitation matched', () => {
    const r = reviewRecitation(expect_('a b c d e f'), heard_('a b c d e f'), 9000, { minSounds: 0 });
    expect(r.followed).toBe(true);
    expect(r.candidates).toEqual([]);
  });

  /**
   * The gate. A recording the model could barely follow is a fact about the
   * room, not the reciter, and every candidate in it would be the model's own.
   */
  it('suppresses everything when it could not follow the recitation', () => {
    const r = reviewRecitation(expect_('a b c d e f g h'), heard_('x y z w v u t s'), 9000, { minSounds: 0 });
    expect(r.agreement).toBeLessThan(MIN_AGREEMENT);
    expect(r.followed).toBe(false);
    expect(r.candidates).toEqual([]);
  });

  it('treats an empty passage as nothing to follow, not a clean run', () => {
    const r = reviewRecitation([], heard_('a b c'), 9000, { minSounds: 0 });
    expect(r.followed).toBe(false);
    expect(r.candidates).toEqual([]);
  });
});

describe('the boundary a person stands on', () => {
  const review = () => reviewRecitation(
    expect_('a b c d e f g h i j'), heard_('x x c d e f y y i j'), 9000, { minSounds: 0 },
  );

  it('starts with every candidate unanswered', () => {
    const r = review();
    expect(r.candidates).toHaveLength(2);
    expect(pendingCount(r)).toBe(2);
    expect(acceptedCandidates(r)).toEqual([]);
  });

  /** The rule the whole feature rests on, stated as a test. */
  it('yields nothing to the session until somebody says yes', () => {
    const r = review();
    expect(acceptedCandidates(r)).toEqual([]);
    expect(acceptedOnly(r.candidates)).toEqual([]);

    const answered = answer(r, r.candidates[0].id, 'accepted');
    expect(acceptedCandidates(answered)).toHaveLength(1);
    expect(acceptedCandidates(answered)[0].id).toBe(r.candidates[0].id);
  });

  it('never lets a dismissal become a note', () => {
    const r = review();
    const answered = answer(answer(r, r.candidates[0].id, 'dismissed'), r.candidates[1].id, 'dismissed');
    expect(acceptedCandidates(answered)).toEqual([]);
    expect(pendingCount(answered)).toBe(0);
  });

  it('answers one without touching the other', () => {
    const r = review();
    const answered = answer(r, r.candidates[0].id, 'accepted');
    expect(answered.candidates[1].verdict).toBe('pending');
  });

  it('clears the rest in one press, without disturbing an answer already given', () => {
    const base = review();
    const r = answer(base, base.candidates[0].id, 'accepted');
    const rest = dismissRest(r);

    expect(pendingCount(rest)).toBe(0);
    // The «rest» is only what was still pending.
    expect(rest.candidates.filter(c => c.verdict === 'accepted')).toHaveLength(1);
    expect(rest.candidates.filter(c => c.verdict === 'dismissed')).toHaveLength(1);
    expect(acceptedCandidates(rest)[0].id).toBe(base.candidates[0].id);
  });

  it('leaves the original alone — answering returns a new review', () => {
    const r = review();
    answer(r, r.candidates[0].id, 'accepted');
    expect(pendingCount(r)).toBe(2);
  });
});

describe('what an accepted candidate becomes', () => {
  /**
   * Never a tajweed note. The model cannot hear tafkhīm or madd length, so it
   * is in no position to say a rule was broken — see `phonemes.ts`.
   */
  it('is a memory error, never a tajweed one', () => {
    expect(ACCEPTED_KIND).toBe('memory');
  });

  it('says it came from the recording, and which way it diverged', () => {
    const said = reviewRecitation(expect_('a b c d e f'), heard_('a b x y e f'), 9000, { minSounds: 0 });
    expect(candidateDetail(said.candidates[0], t as never)).toBe('asrHeard');

    const left = reviewRecitation(expect_('a b c d e f g h i'), heard_('a b c g h i'), 9000, { minSounds: 0 });
    expect(candidateDetail(left.candidates[0], t as never)).toBe('asrOmitted');

    const added = reviewRecitation(expect_('a b c d'), heard_('a b x y c d'), 9000, { minSounds: 0 });
    expect(candidateDetail(added.candidates[0], t as never)).toBe('asrAdded');
  });
});

/**
 * Measured on a real device: five seconds on «الم» is eight sounds, and the
 * tool answered it exactly as it answers a clean page — «nothing was found».
 * That reads as «you recited correctly» when the truth is «I did not hear
 * enough to judge».
 */
describe('a recitation too short to judge', () => {
  const eight = (symbols: string): HeardPhoneme[] =>
    symbols.split(' ').map((symbol, i) => ({ symbol, confidence: null, atMs: i * 100 }));

  it('says so, rather than saying nothing was found', () => {
    const r = reviewRecitation(expect_('a b c d e f g h'), eight('a b c d e f g h'), 5000);
    expect(r.enough).toBe(false);
    expect(r.followed).toBe(false);
    expect(r.candidates).toEqual([]);
  });

  it('has an opinion as soon as there is enough to have one about', () => {
    const many = Array.from({ length: MIN_SOUNDS + 4 }, (_, i) => `s${i}`).join(' ');
    const r = reviewRecitation(expect_(many), eight(many), 20_000);
    expect(r.enough).toBe(true);
    expect(r.followed).toBe(true);
  });

  /** A short verse recited alone is a fine thing to do; it just cannot be graded. */
  it('does not treat shortness as a fault of the reciter', () => {
    const r = reviewRecitation(expect_('a b c'), eight('a b c'), 3000);
    expect(r.enough).toBe(false);
    expect(r.agreement).toBe(1);
  });
});

/**
 * Seen on a human recitation of al-Ikhlāṣ: the basmala said before it — the
 * sunna — was raised as words added. It is allowed, never required.
 */
describe('the basmala before a sūra', () => {
  const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
  const phonemes = phonemesFromFile(raw);
  const ikhlas = [1, 2, 3, 4].map(ayah => ({ surah: 112, ayah, anchorId: 112000 + ayah }));
  const expected = phonemes.expected(ikhlas);
  const opening = basmalaBefore(phonemes, ikhlas[0]);
  const said = (p: { symbol: string }[]) => p.map((x, i) => ({ symbol: x.symbol, confidence: null, atMs: i * 80 }));

  it('is offered before the first verse of a sūra, but not before al-Fātiḥa, at-Tawba or a later verse', () => {
    expect(opening.length).toBeGreaterThan(10);
    expect(basmalaBefore(phonemes, { surah: 1, ayah: 1, anchorId: 1 })).toEqual([]);
    expect(basmalaBefore(phonemes, { surah: 9, ayah: 1, anchorId: 1236 })).toEqual([]);
    expect(basmalaBefore(phonemes, { surah: 112, ayah: 2, anchorId: 112002 })).toEqual([]);
  });

  it('raises nothing when it is said', () => {
    const r = reviewWithOpening(opening, expected, said([...opening, ...expected]), 9000);
    expect(r.followed).toBe(true);
    expect(r.candidates).toEqual([]);
  });

  it('raises nothing when it is not', () => {
    const r = reviewWithOpening(opening, expected, said(expected), 9000);
    expect(r.followed).toBe(true);
    expect(r.candidates).toEqual([]);
  });

  it('still raises a slip in the sūra itself', () => {
    const slipped = expected.filter(p => !(p.anchorId === 112003 && p.word !== null && p.word >= 2));
    const r = reviewWithOpening(opening, expected, said([...opening, ...slipped]), 9000);
    expect(r.candidates.map(c => c.anchorId)).toEqual([112003]);
  });
});
