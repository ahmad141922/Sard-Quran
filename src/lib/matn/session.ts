/**
 * A session of reciting a memorised poem — model and pure selectors.
 *
 * The shell is shared with a majlis of Qur'an (`SessionCore`): who was there,
 * how long it ran, what was noted and where. What is not shared is everything
 * that measures progress, and that is the point of the split — juzʾ and pages
 * mean nothing in a matn, and abwāb mean nothing in the muṣḥaf. Folding both
 * into one shape would only produce fields that are dead half the time.
 *
 * The unit is the **bayt** and the note pins to the **shaṭr**: the teacher
 * sees the whole line, because the sense is not complete without it, and the
 * note is fixed to the half the slip fell in.
 */

import {
  coveredCount, coveredWithin, mergeRange, newSessionId,
  type CoveredRanges, type MatnNoteKind, type SessionCore, type SessionMode, type TimeSegment,
} from '../recitation-session';
import type { Matn, MatnBab } from './load';
import { matnPosition, type MatnPosition } from './position';
import type { MatnId, Shatr } from './registry';

/**
 * What the session set out to recite.
 *
 * Not the Qur'an's juzʾ-based goals: a matn is recited whole, or a chapter of
 * it, or a stretch the teacher names. Tuhfat al-Atfal is 61 lines — a single
 * sitting — while Tayyibat an-Nashr is a thousand, so the goal has to be able
 * to mean both.
 */
export type MatnGoalKind = 'full' | 'bab' | 'custom';

export interface MatnGoal {
  kind: MatnGoalKind;
  /** Inclusive line numbers, in the declared print. */
  from: number;
  to: number;
  /** Which chapter, when the goal is one. */
  bab?: number;
}

export interface MatnSession extends SessionCore<MatnPosition, MatnNoteKind> {
  /**
   * The discriminator against `RecitationSession` — and `modelVersion` is
   * deliberately not it. These are two kinds of record, not two versions of
   * one, so each keeps its own version line and the *kind* tells them apart.
   */
  textKind: 'matn';
  matnId: MatnId;
  /**
   * The print, denormalised out of the registry.
   *
   * A finished session is a record, and it has to stay readable if the edition
   * is renamed or withdrawn — the same reason `mushafId` is denormalised onto
   * a majlis of Qur'an.
   */
  editionId: string;
  /**
   * How many lines that print holds, carried here too.
   *
   * So a percentage can be worked out from the session alone, without loading
   * the matn file — a report read months later must not depend on data that
   * may have been swapped underneath it.
   */
  totalAbyat: number;
  goal: MatnGoal;
  /** Inclusive ranges of line numbers recited. Plain integers, one print. */
  covered: CoveredRanges;
  modelVersion: 1;
}

export function isMatnSession(s: { textKind?: string }): s is MatnSession {
  return s.textKind === 'matn';
}

export function createMatnSession(opts: {
  studentName: string;
  instructorName?: string;
  mode?: SessionMode;
  matn: Matn;
  goal: MatnGoal;
  now?: number;
}): MatnSession {
  const now = opts.now ?? Date.now();
  // Counted off the matn in hand, not looked up again in the registry: the
  // loader has already proven the two agree, and the loaded file is the thing
  // this session is actually about.
  const { id: matnId } = opts.matn.def;
  return {
    id: newSessionId(),
    studentName: opts.studentName.trim(),
    instructorName: opts.instructorName?.trim() || undefined,
    // Written only when it is not the default, exactly as a majlis does it.
    mode: opts.mode === 'solo' ? 'solo' : undefined,
    textKind: 'matn',
    matnId,
    editionId: opts.matn.editionId,
    totalAbyat: opts.matn.abyat.length,
    goal: opts.goal,
    current: matnPosition(matnId, opts.matn.editionId, opts.goal.from, 'sadr'),
    covered: [],
    segments: [{ from: now, to: null }],
    notes: [],
    startedAt: now,
    endedAt: null,
    lastSeenAt: now,
    status: 'active',
    modelVersion: 1,
  };
}

/** The whole matn, as a goal. */
export function fullMatnGoal(matn: Matn): MatnGoal {
  return { kind: 'full', from: 1, to: matn.abyat.length };
}

/** One chapter, as a goal. */
export function babGoal(bab: MatnBab): MatnGoal {
  return { kind: 'bab', from: bab.from, to: bab.to, bab: bab.n };
}

/**
 * Moves the marker without crediting anything.
 *
 * Position and progress stay apart here for the same reason they do in the
 * muṣḥaf: following the reciter must be free, while "this much was recited" is
 * a claim made on purpose, once.
 */
export function moveToBayt(s: MatnSession, bayt: number, shatr: Shatr = 'sadr'): MatnSession {
  return { ...s, current: matnPosition(s.matnId, s.editionId, bayt, shatr) };
}

/** Credits a stretch of lines as recited. */
export function coverAbyat(s: MatnSession, from: number, to: number): MatnSession {
  return { ...s, covered: mergeRange(s.covered, Math.min(from, to), Math.max(from, to)) };
}

/** Credits every line of a chapter — what the "finished the bāb" button does. */
export function completeBab(s: MatnSession, bab: MatnBab): MatnSession {
  return coverAbyat(s, bab.from, bab.to);
}

export interface MatnVolume {
  /** Lines recited, counted once however often they were passed over. */
  abyat: number;
  /** Chapters recited end to end. */
  abwabDone: number;
  /** Of the whole matn, 0..100. */
  percent: number;
}

export function matnVolume(s: MatnSession, abwab: MatnBab[] = []): MatnVolume {
  const abyat = coveredCount(s.covered);
  const abwabDone = abwab.filter(
    b => coveredWithin(s.covered, b.from, b.to) === b.to - b.from + 1,
  ).length;
  return {
    abyat,
    abwabDone,
    percent: s.totalAbyat > 0 ? Math.round((abyat / s.totalAbyat) * 100) : 0,
  };
}

/** Progress against what this session set out to do, not against the matn. */
export function matnProgressPct(s: MatnSession): number {
  const span = Math.max(1, s.goal.to - s.goal.from + 1);
  const done = coveredWithin(s.covered, s.goal.from, s.goal.to);
  return Math.min(100, Math.round((done / span) * 100));
}

/**
 * Whether the finish button belongs on screen.
 *
 * It appears at the last line of the chapter being recited — the matn's
 * counterpart of opening a surah's last page, and for the same reason: the
 * button must not arrive ahead of the student.
 */
export function atEndOfBab(s: MatnSession, bab: MatnBab | undefined): boolean {
  return !!bab && s.current.bayt === bab.to;
}

export type { TimeSegment };
