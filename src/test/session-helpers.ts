// Building sessions in tests without spelling out a position every time.
//
// These go through the real position layer rather than hand-writing objects:
// if `positionFromAnchor` ever stopped agreeing with the registry, the tests
// that use this would fail, which is the point.

import { getMushaf } from '@/lib/mushaf/registry';
import { positionFromAnchor, type AyahPosition, type EditionBook } from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
import {
  createSession, makeNote, resolveGoalEnd,
  type GoalKind, type NoteKind, type RecitationSession, type SessionNote,
} from '@/lib/recitation-session';
import type { QuranIndex } from '@/lib/quran-index';

export interface TestBooks {
  /** The Madinah Hafs muṣḥaf — the edition whose numbering the anchors use. */
  book: EditionBook;
  /** A position from a canonical ayah id. */
  at(anchorId: number): AyahPosition;
  note(kind: NoteKind, anchorId: number, now?: number): SessionNote;
  session(opts: {
    studentName?: string;
    goalKind: GoalKind;
    startAyahId: number;
    endAyahId?: number;
    now?: number;
  }): RecitationSession;
}

export function testBooks(index: QuranIndex): TestBooks {
  const canonical = canonicalBookFromQuranIndex(index);
  const book = editionBook(getMushaf('hafs-kfqc')!, null, canonical)!;
  const at = (anchorId: number) => positionFromAnchor(book, canonical, anchorId)!;
  return {
    book,
    at,
    note: (kind, anchorId, now) => makeNote(kind, at(anchorId), now),
    session: ({ studentName = 'x', goalKind, startAyahId, endAyahId, now }) => createSession({
      studentName,
      goalKind,
      start: at(startAyahId),
      end: at(endAyahId ?? resolveGoalEnd(startAyahId, goalKind, index)),
      index,
      now,
    }),
  };
}
