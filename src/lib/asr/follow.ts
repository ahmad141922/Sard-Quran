/**
 * Moving the marker along with the recitation, verse by verse.
 *
 * The reciter's hand is busy and their eyes are on the page; asking them to
 * drag a marker down it is asking them to stop reciting. The recogniser
 * already knows how far they have got, so it can move it for them.
 *
 * ## Two different things, and only one of them is a fact
 *
 * **The verse finished** is confirmed, and the marker moves to it. It only
 * ever goes forward and only when the stretch since the last one matched well.
 *
 * **The word in progress** is a live estimate. It changes every poll, it is
 * usually mid-word, and it is wrong the moment the reciter pauses. It is for
 * *showing* — «he is about here» — and the marker is never moved by it. The
 * two are separate fields because conflating them would put a guess where the
 * session records a fact.
 *
 * The word is available at all because the index now numbers its sounds by the
 * **written** word, reproducing the printed verse for 6,142 of 6,236 āyāt. It
 * used to number them by phonetic group, which agreed 34% of the time; for the
 * 94 that still cannot be checked, `word` is null and nothing is shown.
 *
 * ## Three rules, and each is about not losing the reciter their place
 *
 * **Forward only.** A marker that jumps backwards mid-recitation is nearly
 * always a mishearing, and it is the single most disorienting thing this could
 * do to somebody reciting from memory.
 *
 * **Behind, never ahead.** It moves to the verse they have *finished*, not the
 * one they are in. Leading them would put the marker where they have not
 * reached and invite them to follow it.
 *
 * **Only when the tail agrees.** Each step aligns just what has been recited
 * since the last confirmed verse. If that stretch does not match well, nothing
 * moves and the next poll tries again — silence is the safe failure here.
 */

import { agreement, reached, type ExpectedPhoneme, type HeardPhoneme } from './align';

/** Where the recitation is thought to be right now — see the header. */
export interface At {
  anchorId: number;
  /** Index into the verse's printed words, or null where they are not known. */
  word: number | null;
}

export interface FollowState {
  /**
   * The last verse the reciter is confirmed to have finished, or null before
   * any has been. This is what the marker follows.
   */
  anchorId: number | null;
  /** How many heard sounds that confirmation accounted for. */
  heardUsed: number;
  /**
   * A live estimate of the verse and word being recited now.
   *
   * Never used to move the marker — see the header. Null whenever the last
   * step could not place the recitation at all.
   */
  at: At | null;
}

/** Nothing confirmed yet — where every recitation starts. */
export const START: FollowState = { anchorId: null, heardUsed: 0, at: null };

/**
 * How much of the passage one step looks at.
 *
 * Bounded on purpose: a step must cost the same at the end of a juzʾ as at the
 * start of a page, because it runs every second or so while somebody is
 * reciting. Roughly a dozen verses, which is far more than anyone gets through
 * between two polls.
 */
export const WINDOW_SOUNDS = 600;

/**
 * How well the newly recited stretch must match before the marker moves.
 *
 * Higher than the bar for showing candidates afterwards. A candidate is a
 * question the reciter answers at their leisure; moving the marker acts on
 * their behalf while they are mid-verse, so it must be surer.
 */
export const MIN_AGREEMENT = 0.7;

/** The least new recitation worth a step — below this, wait for more. */
export const MIN_NEW_SOUNDS = 12;

export interface Ahead {
  /** Verses after the confirmed one, in order. */
  anchorId: number;
  /** How many sounds that verse has. */
  sounds: number;
  /** Its sounds, ready to align. */
  expected: ExpectedPhoneme[];
}

/**
 * One step: what the reciter has finished, given what has been heard so far.
 *
 * Returns the state unchanged where nothing can be confirmed — which is the
 * common case between two polls, and the right answer whenever the alignment
 * is not sure.
 */
export function followStep(
  ahead: Ahead[], heard: HeardPhoneme[], state: FollowState = START,
): FollowState {
  const tail = heard.slice(state.heardUsed);
  if (tail.length < MIN_NEW_SOUNDS || !ahead.length) return state;

  // Only the next stretch of the passage is considered, so the work per step
  // does not grow with the recitation. See `WINDOW_SOUNDS`.
  const window: ExpectedPhoneme[] = [];
  const bounds: { anchorId: number; upTo: number }[] = [];
  for (const verse of ahead) {
    if (window.length >= WINDOW_SOUNDS) break;
    window.push(...verse.expected);
    bounds.push({ anchorId: verse.anchorId, upTo: window.length });
  }
  if (!window.length) return state;

  /*
   * The reciter is mid-passage, so the text runs past what they have said:
   * this is the open-ended alignment, measuring how far they reached rather
   * than accusing them of skipping the rest.
   */
  if (agreement(window, tail, undefined, true) < MIN_AGREEMENT) return state;
  const got = reached(window, tail);

  /*
   * Where they are now: the sound just recited, and the verse and word it
   * belongs to. An estimate, and marked as one — see the header.
   */
  const last = window[Math.min(got, window.length) - 1];
  const inVerse = bounds.find(b => b.upTo > got - 1) ?? bounds[bounds.length - 1];
  const at: At | null = last && inVerse
    ? { anchorId: inVerse.anchorId, word: last.word }
    : state.at;

  // The last verse **finished**, never the one in progress — see the header.
  let confirmed: { anchorId: number; upTo: number } | null = null;
  for (const bound of bounds) {
    if (bound.upTo > got) break;
    confirmed = bound;
  }
  if (!confirmed) return { ...state, at };

  return {
    anchorId: confirmed.anchorId,
    heardUsed: state.heardUsed + confirmed.upTo,
    at,
  };
}

/**
 * Whether a step actually moved the reciter on.
 *
 * Used by the caller to decide whether to touch the marker at all: writing the
 * same position back every second would be a session change a second, and the
 * majlis is saved on every change.
 */
export function moved(before: FollowState, after: FollowState): boolean {
  return after.anchorId !== null && after.anchorId !== before.anchorId;
}
