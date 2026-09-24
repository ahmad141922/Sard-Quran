import { describe, it, expect } from 'vitest';

import { notedWords, pinnedWordAt, tapWord, withPinnedWord } from '@/lib/word-pin';

/**
 * Putting a note on a word.
 *
 * Almost everything here is about a pin **not** catching a note it was not
 * meant for - because the failure is silent. A note on the wrong word looks
 * exactly like a note on the right one, and a teacher reviewing it later has no
 * way to know the word came from a tap a minute earlier on another line.
 */

describe('tapping a word', () => {
  it('pins it', () => {
    expect(tapWord(null, 5, 2)).toEqual({ anchorId: 5, word: 2 });
  });

  it('lets it go when the same word is tapped again', () => {
    expect(tapWord({ anchorId: 5, word: 2 }, 5, 2)).toBeNull();
  });

  it('moves the pin to another word of the same verse', () => {
    expect(tapWord({ anchorId: 5, word: 2 }, 5, 3)).toEqual({ anchorId: 5, word: 3 });
  });

  /** The same word index in another verse is a different word. */
  it('treats the same index in another verse as another word', () => {
    expect(tapWord({ anchorId: 5, word: 2 }, 6, 2)).toEqual({ anchorId: 6, word: 2 });
  });
});

describe('whether a pin still applies', () => {
  it('applies while the marker is on its verse', () => {
    expect(pinnedWordAt({ anchorId: 5, word: 2 }, 5)).toBe(2);
  });

  /**
   * Every other way the marker moves - a page turn, a tap on the plate, the
   * marker following a reciter - leaves the pin behind without anybody having
   * to clear it.
   */
  it('stops applying the moment the marker is anywhere else', () => {
    expect(pinnedWordAt({ anchorId: 5, word: 2 }, 6)).toBeUndefined();
  });

  it('is nothing when nothing was pinned', () => {
    expect(pinnedWordAt(null, 5)).toBeUndefined();
  });

  /** Word zero is the first word, and is a word. */
  it('counts the first word of a verse as a word', () => {
    expect(pinnedWordAt({ anchorId: 5, word: 0 }, 5)).toBe(0);
  });
});

describe('the note that comes out', () => {
  const note = { id: 'n1', kind: 'shakl' };

  it('carries the pinned word', () => {
    expect(withPinnedWord(note, { anchorId: 5, word: 2 }, 5)).toEqual({ ...note, word: 2 });
  });

  it('carries the first word as word zero, not as no word', () => {
    expect(withPinnedWord(note, { anchorId: 5, word: 0 }, 5)).toEqual({ ...note, word: 0 });
  });

  /**
   * No `word` key at all, not `word: undefined`: a note taken the old way has to
   * serialise exactly as it always did.
   */
  it('is untouched when nothing is pinned', () => {
    const out = withPinnedWord(note, null, 5);
    expect(out).toEqual(note);
    expect('word' in out).toBe(false);
  });

  it('is untouched when the pin is on another verse', () => {
    expect('word' in withPinnedWord(note, { anchorId: 9, word: 1 }, 5)).toBe(false);
  });

  it('never alters the note it was handed', () => {
    const before = { ...note };
    withPinnedWord(note, { anchorId: 5, word: 2 }, 5);
    expect(note).toEqual(before);
  });
});

describe('which words carry notes', () => {
  const at = (id: number) => ({ anchor: { id } });

  it('keys them by verse and word', () => {
    const marks = notedWords([{ position: at(5), word: 2, kind: 'shakl' }]);
    expect(marks.get('5:2')).toEqual(['shakl']);
  });

  it('keeps every kind put on the same word, in order', () => {
    const marks = notedWords([
      { position: at(5), word: 2, kind: 'memory' },
      { position: at(5), word: 2, kind: 'shakl' },
    ]);
    expect(marks.get('5:2')).toEqual(['memory', 'shakl']);
  });

  /** A note on the verse as a whole is not a note on any one of its words. */
  it('leaves out notes that were not put on a word', () => {
    const marks = notedWords([{ position: at(5), kind: 'memory' }]);
    expect(marks.size).toBe(0);
  });

  it('keeps the same index in two verses apart', () => {
    const marks = notedWords([
      { position: at(5), word: 1, kind: 'memory' },
      { position: at(6), word: 1, kind: 'tajweed' },
    ]);
    expect(marks.get('5:1')).toEqual(['memory']);
    expect(marks.get('6:1')).toEqual(['tajweed']);
  });
});
