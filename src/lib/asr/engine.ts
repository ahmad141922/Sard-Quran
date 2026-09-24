/**
 * The seam the recogniser plugs into, and what the rest of the app is allowed
 * to know about it.
 *
 * Everything above this line is pure and tested: phonemising the passage,
 * aligning what was heard against it, deciding what is worth showing. Below it
 * is a model that has to be downloaded, a native plugin, and a device with a
 * microphone. Keeping the two apart is what lets the judgement be checked
 * against hand-written examples rather than against a recording.
 *
 * ## Two rules the whole feature hangs on
 *
 * **The engine never records a note.** It returns candidates; the reciter
 * accepts one and *that* makes a note. The tool's claim from the first day is
 * that it records what a person judged, and a machine writing into the same
 * list would quietly end that.
 *
 * **It is offered in solo review only.** In a majlis there is a shaykh
 * listening, and putting a machine's opinion beside his is neither useful nor
 * respectful. This is also the condition the model's own licence asks for:
 * automatic feedback can be wrong and does not replace a qualified teacher.
 */

import type { Candidate, ExpectedPhoneme } from './align';

export interface RecognisedAudio {
  /** Phonemes with per-symbol confidence — see `HeardPhoneme`. */
  phonemes: import('./align').HeardPhoneme[];
  /** How long the recording ran, for the interface. */
  durationMs: number;
  /**
   * Whether the recitation can be played back to the reciter.
   *
   * False for a sitting too long to have been kept in memory. The candidates
   * are unaffected; only the «hear this place» button goes away, which is the
   * right way round — a button that does nothing would be worse.
   */
  canPlay?: boolean;
}

export interface AsrEngine {
  /** Whether this device can actually run it — see `nullEngine`. */
  available(): Promise<boolean>;
  /**
   * Fetches the model if it is not on the device yet.
   *
   * Separate from `available` because it is 69 MB: it must be a thing the
   * reciter agrees to, on a screen that says the size, not something that
   * happens because they opened a page.
   */
  prepare(onProgress?: (fraction: number) => void): Promise<boolean>;
  start(): Promise<boolean>;
  stop(): Promise<RecognisedAudio | null>;
  cancel(): void;
  /**
   * Plays the reciter's own voice from one moment of the recitation.
   *
   * The engine holds the audio; it never crosses into the interface. Absent on
   * an engine that keeps none, which is why it is optional.
   */
  play?(atMs: number): void;
  /** Drops the kept audio. Called when the review closes. */
  discard?(): void;
  /**
   * What has been heard so far, without ending the recitation.
   *
   * Absent on an engine that cannot report mid-stream, which is why the marker
   * that follows along is offered only where this exists.
   */
  partial?(): Promise<import('./align').HeardPhoneme[] | null>;
}

/**
 * What runs everywhere the real one does not: the browser, a device without
 * the plugin, a build that never shipped the model.
 *
 * It reports itself unavailable and does nothing else. The interface then
 * omits the feature entirely rather than offering a button that fails — the
 * same posture the matn and the share link take.
 */
export function nullEngine(): AsrEngine {
  return {
    async available() { return false; },
    async prepare() { return false; },
    async start() { return false; },
    async stop() { return null; },
    cancel() { /* nothing to cancel */ },
  };
}

let engine: AsrEngine = nullEngine();

/** Installed by the native layer at boot, where there is one. */
export function setAsrEngine(next: AsrEngine): void {
  engine = next;
}

export function asrEngine(): AsrEngine {
  return engine;
}

/**
 * A candidate the reciter has been shown, and what they said about it.
 *
 * `pending` is the only state the engine can produce. The other two are a
 * person's answer, and only `accepted` ever becomes a note.
 */
export type CandidateVerdict = 'pending' | 'accepted' | 'dismissed';

export interface ReviewedCandidate extends Candidate {
  id: string;
  verdict: CandidateVerdict;
}

let seq = 0;

export function toReviewed(candidates: Candidate[]): ReviewedCandidate[] {
  return candidates.map(c => ({ ...c, id: `cd${Date.now().toString(36)}${seq++}`, verdict: 'pending' }));
}

/**
 * The candidates a reciter accepted, ready to become notes.
 *
 * Nothing else in the app may read the pending ones: a candidate nobody has
 * looked at is a machine's guess, and the moment it is counted anywhere — a
 * tally, a heat map, a retention score — the guess has become a record.
 */
export function acceptedOnly(reviewed: ReviewedCandidate[]): ReviewedCandidate[] {
  return reviewed.filter(c => c.verdict === 'accepted');
}

export type { Candidate, ExpectedPhoneme };
