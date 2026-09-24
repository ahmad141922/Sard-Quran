/**
 * Turning one recording into suggestions a reciter can answer.
 *
 * This is the last pure step before the screen. `align.ts` decides where the
 * recitation left the text; this decides whether the recording is worth
 * reading at all, what each divergence should be called, and what a reciter
 * gets back when they accept one.
 *
 * ## Nothing here writes a note
 *
 * It returns candidates and a verdict per candidate. Only `acceptedNotes`
 * turns them into anything the session stores, and only for the ones a person
 * said yes to. That boundary is the feature's whole licence to exist — see
 * `engine.ts`.
 */

import { MIN_AGREEMENT, agreement, findCandidates } from './align';
import { toReviewed, type ReviewedCandidate } from './engine';
import type { Candidate, ExpectedPhoneme, HeardPhoneme } from './align';
import type { NoteKind } from '../recitation-session';

/**
 * What came of listening to one recitation.
 *
 * `followed` is the gate: below it the recording tells us nothing about the
 * reciter — a bad microphone, a noisy room, the wrong passage — and the
 * candidates are suppressed rather than shown with a warning nobody reads.
 */
export interface AsrReview {
  followed: boolean;
  /**
   * Whether there was enough recitation to say anything about at all.
   *
   * Measured on a real device: five seconds on «الم» is eight sounds, and the
   * tool answered it exactly as it answers a clean page — «nothing was found».
   * That reads as «you recited correctly» when the truth is «I did not hear
   * enough to judge». They are different sentences and the reciter is owed the
   * right one.
   */
  enough: boolean;
  /** 0..1, how much of the passage the model could follow. */
  agreement: number;
  /** Empty whenever `followed` is false. */
  candidates: ReviewedCandidate[];
  durationMs: number;
}

/**
 * The least recitation worth an opinion, in sounds.
 *
 * A verse of the Qurʾān averages fifty; this is well under one. It is not a
 * quality bar — a short verse recited alone is a perfectly good thing to do —
 * but a claim about it would rest on almost nothing, and «I have no opinion»
 * is the honest answer where that is true.
 */
export const MIN_SOUNDS = 20;

export function reviewRecitation(
  expected: ExpectedPhoneme[], heard: HeardPhoneme[], durationMs: number,
  opts: { minAgreement?: number; openEnd?: boolean; minSounds?: number } = {},
): AsrReview {
  const minAgreement = opts.minAgreement ?? MIN_AGREEMENT;
  const openEnd = opts.openEnd ?? false;
  // The passage may run past what was recited — see `passageFor`. Both the
  // score and the candidates then concern the part actually reached, and the
  // verses beyond it are not omissions the reciter made.
  const score = agreement(expected, heard, undefined, openEnd);
  const enough = heard.length >= (opts.minSounds ?? MIN_SOUNDS);
  const followed = enough && expected.length > 0 && score >= minAgreement;
  return {
    followed,
    enough,
    agreement: score,
    candidates: followed ? toReviewed(findCandidates(expected, heard, { openEnd })) : [],
    durationMs,
  };
}

/**
 * The kind of note an accepted candidate becomes.
 *
 * Always a memory error, never a tajweed one. The model cannot hear tafkhīm or
 * madd length (see `phonemes.ts`), so it is in no position to say a rule was
 * broken; what it *can* say is that the sounds were not the sounds of the
 * text, and that is what خطأ حفظ means. Calling it anything else would put a
 * claim in the report that nothing in the pipeline supports.
 */
export const ACCEPTED_KIND: NoteKind = 'memory';

/**
 * How an accepted candidate reads in the report.
 *
 * The provenance travels with it. A reciter reading their own history months
 * later should be able to tell which lines a person heard and which a machine
 * proposed — the two are not the same kind of fact, and a note that hides
 * which it is would make the whole record less trustworthy, not more.
 */
export function candidateDetail(
  c: Candidate, t: (key: 'asrHeard' | 'asrOmitted' | 'asrAdded') => string,
): string {
  if (c.kind === 'omission') return t('asrOmitted');
  if (c.kind === 'insertion') return t('asrAdded');
  return t('asrHeard');
}

/** Only the ones a person said yes to. */
export function acceptedCandidates(review: AsrReview): ReviewedCandidate[] {
  return review.candidates.filter(c => c.verdict === 'accepted');
}

/** How many are still waiting on an answer. */
export function pendingCount(review: AsrReview): number {
  return review.candidates.filter(c => c.verdict === 'pending').length;
}

/** Records one person's answer, leaving the rest alone. */
export function answer(
  review: AsrReview, id: string, verdict: 'accepted' | 'dismissed',
): AsrReview {
  return {
    ...review,
    candidates: review.candidates.map(c => (c.id === id ? { ...c, verdict } : c)),
  };
}

/** Dismisses everything still pending — the «none of these» button. */
export function dismissRest(review: AsrReview): AsrReview {
  return {
    ...review,
    candidates: review.candidates.map(
      c => (c.verdict === 'pending' ? { ...c, verdict: 'dismissed' as const } : c),
    ),
  };
}
