import { describe, it, expect } from 'vitest';
import {
  addNote, editNote, emptyMarks, isBookmarked, noteOn, notesAmong, recentFirst,
  removeBookmark, removeNote, toggleBookmark,
} from '@/lib/mushaf/reading-marks';

/**
 * A reader's margin: a note on a verse, a mark on a page.
 *
 * The rules worth pinning down are the ones a reader would notice being broken
 * — a second thought overwriting the first rather than piling up beside it, a
 * bookmark that comes off the way it went on, and a note that stays on its
 * verse when the muṣḥaf changes.
 */
const note = (anchorId: number, text: string, mushafId = 'hafs-kfqc') => ({
  anchorId, mushafId, surah: 1, ayah: anchorId, text,
});

describe('a note belongs to its verse', () => {
  it('is written once and rewritten in place', () => {
    let marks = addNote(emptyMarks(), note(262, 'اسأل الشيخ عن المدّ'), 1_000);
    marks = addNote(marks, note(262, 'راجعها غدًا'), 2_000);
    expect(marks.notes).toHaveLength(1);
    expect(marks.notes[0].text).toBe('راجعها غدًا');
    expect(marks.notes[0].at).toBe(2_000);
  });

  it('keeps notes on different verses apart', () => {
    let marks = addNote(emptyMarks(), note(1, 'أ'), 1);
    marks = addNote(marks, note(2, 'ب'), 2);
    expect(marks.notes.map(n => n.anchorId)).toEqual([1, 2]);
  });

  it('refuses an empty note rather than storing a blank', () => {
    expect(addNote(emptyMarks(), note(5, '   ')).notes).toEqual([]);
  });

  it('trims what was typed', () => {
    expect(addNote(emptyMarks(), note(5, '  تنبيه  ')).notes[0].text).toBe('تنبيه');
  });

  it('deletes itself when its text is cleared', () => {
    const marks = addNote(emptyMarks(), note(5, 'شيء'));
    expect(editNote(marks, marks.notes[0].id, '  ').notes).toEqual([]);
  });

  it('is found by the anchor, which every edition shares', () => {
    const marks = addNote(emptyMarks(), note(262, 'هنا'));
    expect(noteOn(marks, 262)?.text).toBe('هنا');
    expect(noteOn(marks, 263)).toBeUndefined();
  });

  it('is deleted by id and leaves the rest alone', () => {
    let marks = addNote(emptyMarks(), note(1, 'أ'), 1);
    marks = addNote(marks, note(2, 'ب'), 2);
    marks = removeNote(marks, marks.notes[0].id);
    expect(marks.notes.map(n => n.text)).toEqual(['ب']);
  });

  it('answers which of its notes are on a page', () => {
    let marks = addNote(emptyMarks(), note(1, 'أ'), 1);
    marks = addNote(marks, note(50, 'ب'), 2);
    marks = addNote(marks, note(90, 'ج'), 3);
    expect(notesAmong(marks, [45, 50, 55]).map(n => n.text)).toEqual(['ب']);
    expect(notesAmong(marks, [])).toEqual([]);
  });
});

describe('a bookmark is a page, in its own book', () => {
  const mark = (mushafId: string, page: number) => ({ mushafId, page, anchorId: page * 10 });

  it('goes on and comes off with the same press', () => {
    let marks = toggleBookmark(emptyMarks(), mark('hafs-kfqc', 294));
    expect(isBookmarked(marks, 'hafs-kfqc', 294)).toBe(true);
    marks = toggleBookmark(marks, mark('hafs-kfqc', 294));
    expect(isBookmarked(marks, 'hafs-kfqc', 294)).toBe(false);
  });

  it('does not confuse page 294 of one print with page 294 of another', () => {
    const marks = toggleBookmark(emptyMarks(), mark('hafs-kfqc', 294));
    expect(isBookmarked(marks, 'warsh-kfqc', 294)).toBe(false);
    const both = toggleBookmark(marks, mark('warsh-kfqc', 294));
    expect(both.bookmarks).toHaveLength(2);
  });

  it('is removed by id from the list', () => {
    const marks = toggleBookmark(emptyMarks(), mark('hafs-kfqc', 10));
    expect(removeBookmark(marks, marks.bookmarks[0].id).bookmarks).toEqual([]);
  });

  it('shows the newest first, which is what a reader just made', () => {
    let marks = toggleBookmark(emptyMarks(), mark('hafs-kfqc', 1), 1_000);
    marks = toggleBookmark(marks, mark('hafs-kfqc', 2), 3_000);
    marks = toggleBookmark(marks, mark('hafs-kfqc', 3), 2_000);
    expect(recentFirst(marks.bookmarks).map(b => b.page)).toEqual([2, 3, 1]);
  });
});

describe('nothing here is ever destroyed by accident', () => {
  it('leaves the object it was given untouched', () => {
    const start = emptyMarks();
    addNote(start, note(1, 'أ'));
    toggleBookmark(start, { mushafId: 'hafs-kfqc', page: 1, anchorId: 1 });
    expect(start).toEqual({ notes: [], bookmarks: [] });
  });
});
