/**
 * What a reader leaves behind in the muṣḥaf.
 *
 * Two kinds, and they answer two different questions. A **note** is written on
 * a verse — a meaning looked up, a word to ask about, a reason to come back to
 * this ayah in particular. A **bookmark** is put on a page: it says «here»,
 * and nothing more.
 *
 * Both are kept against the anchor — the canonical ayah id the editions share
 * — as well as the printed number they were made in. A note written in the
 * Warsh muṣḥaf is still on the same verse when the Madinah muṣḥaf is opened,
 * even though that verse has another number there; and a bookmark keeps its
 * page in the book it was made in, so a page number is never quietly reused
 * for a different place.
 *
 * This is a reader's private margin, not a record of anything: it lives in
 * this browser and is never uploaded, which is also why it needs no account.
 */

const KEY = 'tajweedoo:reading-marks';

export interface ReadingNote {
  id: string;
  /** The canonical ayah id — what every edition of the Book agrees on. */
  anchorId: number;
  /** The edition it was written in, and the number it had there. */
  mushafId: string;
  surah: number;
  ayah: number;
  text: string;
  at: number;
}

export interface ReadingBookmark {
  id: string;
  /** The first verse of the page, so the mark can be found in another print. */
  anchorId: number;
  mushafId: string;
  page: number;
  at: number;
}

export interface ReadingMarks {
  notes: ReadingNote[];
  bookmarks: ReadingBookmark[];
}

export const emptyMarks = (): ReadingMarks => ({ notes: [], bookmarks: [] });

/** Ids are only ever compared, never parsed — a counter plus the clock is enough. */
let seq = 0;
function markId(prefix: string, at: number): string {
  seq += 1;
  return `${prefix}_${at.toString(36)}_${seq.toString(36)}`;
}

// ── the pure half ────────────────────────────────────────────────

export function addNote(
  marks: ReadingMarks,
  note: Omit<ReadingNote, 'id' | 'at'>,
  at = Date.now(),
): ReadingMarks {
  const text = note.text.trim();
  if (!text) return marks;
  // One note per verse: a second thought about the same ayah is the same note,
  // rewritten. Otherwise a page collects duplicates nobody meant to keep.
  const existing = marks.notes.find(n => n.anchorId === note.anchorId);
  if (existing) return editNote(marks, existing.id, text, at);
  return {
    ...marks,
    notes: [...marks.notes, { ...note, text, id: markId('note', at), at }],
  };
}

export function editNote(marks: ReadingMarks, id: string, text: string, at = Date.now()): ReadingMarks {
  const trimmed = text.trim();
  if (!trimmed) return removeNote(marks, id);
  return {
    ...marks,
    notes: marks.notes.map(n => (n.id === id ? { ...n, text: trimmed, at } : n)),
  };
}

export function removeNote(marks: ReadingMarks, id: string): ReadingMarks {
  return { ...marks, notes: marks.notes.filter(n => n.id !== id) };
}

export function noteOn(marks: ReadingMarks, anchorId: number): ReadingNote | undefined {
  return marks.notes.find(n => n.anchorId === anchorId);
}

/**
 * A bookmark is a toggle, not a list: pressing it on a page that already
 * carries one takes it off. Identity is the page *in its own edition* — two
 * prints numbering their pages alike is not the same as their page 100 being
 * the same place.
 */
export function toggleBookmark(
  marks: ReadingMarks,
  mark: Omit<ReadingBookmark, 'id' | 'at'>,
  at = Date.now(),
): ReadingMarks {
  const existing = marks.bookmarks.find(b => b.mushafId === mark.mushafId && b.page === mark.page);
  if (existing) return { ...marks, bookmarks: marks.bookmarks.filter(b => b.id !== existing.id) };
  return { ...marks, bookmarks: [...marks.bookmarks, { ...mark, id: markId('mark', at), at }] };
}

export function isBookmarked(marks: ReadingMarks, mushafId: string, page: number): boolean {
  return marks.bookmarks.some(b => b.mushafId === mushafId && b.page === page);
}

export function removeBookmark(marks: ReadingMarks, id: string): ReadingMarks {
  return { ...marks, bookmarks: marks.bookmarks.filter(b => b.id !== id) };
}

/** Newest first — the reader is looking for what they just marked. */
export function recentFirst<T extends { at: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.at - a.at);
}

/** The notes that fall on a page, given the anchors that page carries. */
export function notesAmong(marks: ReadingMarks, anchorIds: Iterable<number>): ReadingNote[] {
  const on = new Set(anchorIds);
  return marks.notes.filter(n => on.has(n.anchorId));
}

// ── the stored half ──────────────────────────────────────────────

/** Anything unreadable is treated as nothing written yet, never as an error. */
export function loadMarks(): ReadingMarks {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return {
      notes: Array.isArray(saved?.notes) ? saved.notes : [],
      bookmarks: Array.isArray(saved?.bookmarks) ? saved.bookmarks : [],
    };
  } catch { return emptyMarks(); }
}

export function saveMarks(marks: ReadingMarks): void {
  try { localStorage.setItem(KEY, JSON.stringify(marks)); }
  catch { /* private mode, or a full quota: the margin is not worth an error */ }
}
