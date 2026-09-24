/**
 * Where a recitation of a matn has reached, and what it is called there.
 *
 * The muṣḥaf side keeps two spaces apart — the number the teacher saw, and an
 * anchor in one declared scheme so two editions can be compared. A matn needs
 * only the first of those **for now**, and that is a decision rather than an
 * omission:
 *
 * The anchor exists in the muṣḥaf because five riwayāt with different verse
 * numbering coexist in one session. Each matn ships with exactly one declared
 * print, so the line number *is* the ordinal — identity and anchor coincide,
 * and a second field carrying the same integer would be ceremony.
 *
 * `editionId` is carried on every stored position all the same, from the first
 * day. That is what makes a second print addable later without reinterpreting
 * every session already recorded: the conversion is missing, not the fact of
 * which book the number came from.
 */

import type { MatnId, Shatr } from './registry';

/** Whether the number was read off the page or worked out — as for an ayah. */
export type MatnPositionOrigin = 'read' | 'converted';

export interface MatnPosition {
  matnId: MatnId;
  /** The print this number belongs to. Authoritative; never rewritten. */
  editionId: string;
  /** 1..totalAbyat in that print. */
  bayt: number;
  /** Which half the note was fixed to. Browsing sits on the ṣadr. */
  shatr: Shatr;
  origin: MatnPositionOrigin;
}

export function matnPosition(
  matnId: MatnId, editionId: string, bayt: number, shatr: Shatr = 'sadr',
  origin: MatnPositionOrigin = 'read',
): MatnPosition {
  return { matnId, editionId, bayt, shatr, origin };
}

/** Same line and same half, in the same book. */
export function sameMatnPlace(a: MatnPosition, b: MatnPosition): boolean {
  return a.matnId === b.matnId && a.editionId === b.editionId
    && a.bayt === b.bayt && a.shatr === b.shatr;
}

/**
 * Reading order within a line: the ṣadr is recited before the ʿajz.
 *
 * Used for sorting notes and for deciding whether the reciter has passed a
 * point, so it has to be a total order over positions in one matn — a bare
 * line-number comparison would call two halves of the same line equal.
 */
export function matnOrdinal(p: MatnPosition): number {
  return p.bayt * 2 + (p.shatr === 'ajz' ? 1 : 0);
}
