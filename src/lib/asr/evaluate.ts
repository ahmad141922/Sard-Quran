/**
 * Scoring the recogniser against recordings whose mistakes are known.
 *
 * The rest of `asr/` decides what to show a reciter; this decides whether
 * what it showed was right. It is the only place the feature is measured
 * rather than reasoned about, and it is pure, so the numbers in the report can
 * be reproduced from the labels and the recogniser's output alone —
 * `scripts/eval-asr.ts` produces both.
 *
 * ## What counts
 *
 * One labelled recording has at most one mistake, at a known verse and word
 * (`docs/competition/test-set-template.csv`). A candidate **at that verse** is
 * the mistake caught; one **within a word of it** is caught and placed. Every
 * other candidate is a false alarm — on a clean recording, or anywhere but the
 * mistake on a recording that has one.
 *
 * Errors of madd and haraka are labelled but **not scored as misses**. The
 * model cannot hear them (`review.ts`, `ACCEPTED_KIND`) and the tool says so
 * to the reciter; counting them against it would measure a claim it never
 * makes. They are reported apart, so nobody has to take that on trust.
 */

import { findCandidates, agreement, MIN_AGREEMENT, type Candidate, type ExpectedPhoneme, type HeardPhoneme } from './align';
import { MIN_SOUNDS } from './review';

export type ErrorType = 'none' | 'substitution' | 'omission' | 'insertion' | 'mutashabih' | 'haraka' | 'madd';

/** Kinds of mistake the tool claims to catch: a word said wrongly, left out, or added. */
export const IN_SCOPE: ReadonlySet<ErrorType> = new Set(['substitution', 'omission', 'insertion', 'mutashabih']);

export interface Label {
  file: string;
  surah: number;
  fromAyah: number;
  toAyah: number;
  errorType: ErrorType;
  /** The verse the mistake is in; null for a clean recording. */
  errorAyah: number | null;
  /** 1-based word in that verse, as the template has it; null where unknown. */
  errorWord: number | null;
}

/** The anchor this module gives a verse: unique, and readable in a report. */
export const evalAnchor = (surah: number, ayah: number) => surah * 1000 + ayah;

export type Outcome =
  /** Clean recording, nothing shown. */
  | 'clean'
  /** The mistake was shown at its verse and word. */
  | 'caught-placed'
  /** The mistake was shown at its verse, a word or more away. */
  | 'caught'
  /** Something was shown, but not at the mistake's verse. */
  | 'misplaced'
  /** Nothing was shown at all. */
  | 'missed'
  /** Clean recording, something shown. */
  | 'false-alarm'
  /** The recogniser could not follow the recording; nothing was shown. */
  | 'not-followed'
  /** A madd or haraka error — reported, never scored. */
  | 'out-of-scope';

export interface Scored {
  label: Label;
  outcome: Outcome;
  candidates: Candidate[];
  /** Candidates that were not the labelled mistake. */
  falseAlarms: number;
  agreement: number;
}

export interface Settings {
  /** Use the model's per-sound probability. Off reproduces the shipping app. */
  confidence: boolean;
  minConfidence: number;
  /** Shortest divergence shown — the rated or the unrated floor, by `confidence`. */
  minRun: number;
}

/**
 * What the app would show for one recording under `settings` — the same gate
 * (`followed`) and the same alignment as `reviewRecitation`, with the knobs
 * the calibration turns exposed.
 */
export function candidatesFor(
  expected: ExpectedPhoneme[], heard: HeardPhoneme[], settings: Settings,
): { followed: boolean; agreement: number; candidates: Candidate[] } {
  const h = settings.confidence ? heard : heard.map(p => ({ ...p, confidence: null }));
  const score = agreement(expected, h);
  const followed = h.length >= MIN_SOUNDS && expected.length > 0 && score >= MIN_AGREEMENT;
  if (!followed) return { followed, agreement: score, candidates: [] };
  const candidates = findCandidates(expected, h, {
    minConfidence: settings.minConfidence,
    minRun: settings.minRun,
    minRunUnrated: settings.minRun,
  });
  return { followed, agreement: score, candidates };
}

export function score(
  label: Label, result: { followed: boolean; agreement: number; candidates: Candidate[] },
): Scored {
  const { candidates } = result;
  const target = label.errorAyah === null ? null : evalAnchor(label.surah, label.errorAyah);
  const atTarget = candidates.filter(c => c.anchorId === target);
  const falseAlarms = candidates.length - atTarget.length;
  const base = { label, candidates, falseAlarms, agreement: result.agreement };

  if (label.errorType === 'madd' || label.errorType === 'haraka') {
    // Shown at the madd is not held against it; shown anywhere else is.
    return { ...base, outcome: 'out-of-scope' };
  }
  if (!result.followed) return { ...base, outcome: 'not-followed' };
  if (label.errorType === 'none') {
    return { ...base, outcome: candidates.length ? 'false-alarm' : 'clean', falseAlarms: candidates.length };
  }
  if (!atTarget.length) return { ...base, outcome: candidates.length ? 'misplaced' : 'missed' };
  const word = label.errorWord === null ? null : label.errorWord - 1;
  const placed = word !== null && atTarget.some(c => c.word !== null && Math.abs(c.word - word) <= 1);
  return { ...base, outcome: placed ? 'caught-placed' : 'caught' };
}

export interface Summary {
  recordings: number;
  /** Clean recordings, and how many of them showed nothing. */
  clean: number;
  cleanSilent: number;
  /** In-scope mistakes, and how many were shown at their verse / word. */
  errors: number;
  caught: number;
  placed: number;
  misplaced: number;
  missed: number;
  notFollowed: number;
  outOfScope: number;
  /** Every candidate that was not a labelled mistake, across all recordings. */
  falseAlarms: number;
  /** Of everything shown, the share that was a real mistake. */
  precision: number | null;
  /** Of the in-scope mistakes, the share shown at their verse. */
  recall: number | null;
}

export function summarise(scored: Scored[]): Summary {
  const count = (o: Outcome) => scored.filter(s => s.outcome === o).length;
  const clean = scored.filter(s => s.label.errorType === 'none').length;
  const errors = scored.filter(s => IN_SCOPE.has(s.label.errorType)).length;
  const caught = count('caught') + count('caught-placed');
  const falseAlarms = scored.reduce((n, s) => n + s.falseAlarms, 0);
  const shown = caught + falseAlarms;
  return {
    recordings: scored.length,
    clean,
    cleanSilent: count('clean'),
    errors,
    caught,
    placed: count('caught-placed'),
    misplaced: count('misplaced'),
    missed: count('missed'),
    notFollowed: count('not-followed'),
    outOfScope: count('out-of-scope'),
    falseAlarms,
    precision: shown ? caught / shown : null,
    recall: errors ? caught / errors : null,
  };
}

/** One row of the template CSV, or null for a header or a blank line. */
export function parseLabel(line: string): Label | null {
  const cells = line.split(',').map(c => c.trim());
  if (cells.length < 5 || cells[0] === 'file' || !cells[0]) return null;
  const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);
  const errorType = (cells[4] || 'none') as ErrorType;
  if (!['none', 'substitution', 'omission', 'insertion', 'mutashabih', 'haraka', 'madd'].includes(errorType)) {
    throw new Error(`${cells[0]}: unknown error_type «${cells[4]}»`);
  }
  const surah = num(cells[1]);
  const fromAyah = num(cells[2]);
  const toAyah = num(cells[3]);
  if (surah === null || fromAyah === null || toAyah === null) throw new Error(`${cells[0]}: surah/from/to must be numbers`);
  const errorAyah = num(cells[5]);
  if (errorType !== 'none' && errorAyah === null) throw new Error(`${cells[0]}: a mistake needs error_ayah`);
  return { file: cells[0], surah, fromAyah, toAyah, errorType, errorAyah: errorType === 'none' ? null : errorAyah, errorWord: num(cells[6]) };
}
