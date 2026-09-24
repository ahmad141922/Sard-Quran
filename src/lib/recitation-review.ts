// What a session leaves behind, read as places rather than as events.
//
// No React, no storage. Everything here is derived from a session and can be
// checked against hand-counted numbers, like the rest of the model.

import {
  NOTE_WEIGHT, sessionCorrections, sessionMarks,
  type CoveredRanges, type NoteKind, type SessionCorrection, type SessionMark, type SessionNote,
} from './recitation-session';

/**
 * Everything recorded at one place, gathered.
 *
 * The session stores three lists because the three are different kinds of
 * fact. A student reviewing wants the opposite arrangement: not "here are the
 * hesitations, here are the marks", but **"al-Baqarah 21: you forgot it, and
 * the shaykh recorded a correction"** — one line per verse, everything that
 * happened there beside it.
 *
 * That is the whole idea of this file: the model stores by kind, the review
 * reads by place.
 */
export interface ReviewPlace<P> {
  /** The place, in the edition it was recorded in. */
  position: P;
  /** Ordering only — see `reviewPlaces`. Never shown. */
  ordinal: number;
  notes: SessionNote<P, NoteKind>[];
  marks: SessionMark<P>[];
  corrections: SessionCorrection<P>[];
  /**
   * How loudly this place is asking to be revisited.
   *
   * The notes' own weights, and nothing else: a mark says "come back" without
   * saying anything went wrong, and a correction is the teacher teaching. Both
   * belong on the line — neither belongs in the number that ranks it.
   */
  weight: number;
}

/**
 * Every place this session recorded something, in reading order.
 *
 * `ordinalOf` is supplied because the two texts count differently — an anchor
 * id in the muṣḥaf, a line-and-half in a matn — and this file has no business
 * knowing which it was handed.
 */
export function reviewPlaces<P>(
  session: {
    notes: SessionNote<P, NoteKind>[];
    marks?: SessionMark<P>[];
    corrections?: SessionCorrection<P>[];
  },
  ordinalOf: (position: P) => number,
): ReviewPlace<P>[] {
  const byPlace = new Map<number, ReviewPlace<P>>();

  const at = (position: P): ReviewPlace<P> => {
    const ordinal = ordinalOf(position);
    const found = byPlace.get(ordinal);
    if (found) return found;
    const made: ReviewPlace<P> = { position, ordinal, notes: [], marks: [], corrections: [], weight: 0 };
    byPlace.set(ordinal, made);
    return made;
  };

  for (const n of session.notes) {
    const place = at(n.position);
    place.notes.push(n);
    place.weight += NOTE_WEIGHT[n.kind] ?? 0;
  }
  for (const m of sessionMarks(session)) at(m.position).marks.push(m);
  for (const c of sessionCorrections(session)) at(c.position).corrections.push(c);

  return [...byPlace.values()].sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * The same places, heaviest first — what to start tonight's review with.
 *
 * Places carrying only a mark or only a correction sort last rather than being
 * dropped: the reciter asked to come back to them, and a list that quietly
 * omitted them would break the promise the mark button makes.
 */
export function reviewOrder<P>(places: ReviewPlace<P>[]): ReviewPlace<P>[] {
  return [...places].sort((a, b) => b.weight - a.weight || a.ordinal - b.ordinal);
}

// ── Comparing one majlis with the last ──────────────────────────

/**
 * Below this many pages, a session is too small for its rate to mean much:
 * one slip in a single page is 1.0, and next week's careful juzʾ will look
 * like an improvement it may not be.
 */
export const MIN_PAGES_TO_COMPARE = 3;

export interface SessionFigures {
  notes: number;
  pages: number;
  /** Weighted notes per page — the comparable number. */
  rate: number;
}

export interface SessionComparison {
  current: SessionFigures;
  previous: SessionFigures;
  /**
   * Whether the two may honestly be set against each other.
   *
   * **This is the point of this function.** "Last week 17, this week 8" is a
   * sentence anybody understands and it is a lie whenever the two sessions
   * were different sizes — three pages against a juzʾ produces a triumph out
   * of nothing. When this is false the interface must show the rate, or show
   * nothing, but never the two raw counts side by side.
   */
  comparable: boolean;
  /** Change in rate. Negative is improvement — fewer faults per page. */
  deltaRate: number;
}

export function sessionFigures(
  session: { notes: SessionNote<unknown, NoteKind>[] },
  pages: number,
): SessionFigures {
  const weight = session.notes.reduce((sum, n) => sum + (NOTE_WEIGHT[n.kind] ?? 0), 0);
  return {
    notes: session.notes.length,
    pages,
    rate: pages > 0 ? weight / pages : 0,
  };
}

export function compareSessions(
  current: SessionFigures, previous: SessionFigures,
): SessionComparison {
  return {
    current,
    previous,
    comparable: current.pages >= MIN_PAGES_TO_COMPARE
      && previous.pages >= MIN_PAGES_TO_COMPARE,
    deltaRate: current.rate - previous.rate,
  };
}

/**
 * The last session of the same reciter, before this one.
 *
 * Matched by name, which is what the tool knows: a halaqa of twenty children
 * types each name once and picks it from the list afterwards, so the strings
 * agree in practice. Trimmed and folded so «محمد» and «محمد » are one boy.
 */
export function previousSessionOf<T extends {
  id: string; studentName: string; startedAt: number; endedAt: number | null;
}>(session: T, all: T[]): T | undefined {
  const name = session.studentName.trim().toLowerCase();
  return all
    .filter(s => s.id !== session.id
      && s.endedAt !== null
      && s.startedAt < session.startedAt
      && s.studentName.trim().toLowerCase() === name)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

// ── The achievement card ────────────────────────────────────────

export interface Achievement {
  /** «سورة الكهف» or «٦ صفحات» — already phrased by the caller. */
  what: string;
  minutes: number;
  /** Places asking to be revisited — marks and notes together. */
  toReview: number;
}

/**
 * Whether a session is worth offering a card for.
 *
 * A card is a small boast, and one for a two-minute session that recorded
 * nothing would cheapen every real one. It needs to have covered something.
 */
export function worthACard(covered: CoveredRanges, minutes: number): boolean {
  const ayahs = covered.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  return ayahs > 0 && minutes >= 1;
}
