/**
 * Putting a note on a word rather than on a verse.
 *
 * Asked for by a reciter who had used the «Surah» app: a teacher hears the
 * slip on one word, and a note that can only say «somewhere in al-Baqara 5»
 * throws that precision away. The word page makes each word its own element,
 * so a word can now be pointed at.
 *
 * ## How it works, and why it is shaped this way
 *
 * Tapping a word **pins** it; the next note button pressed puts its note on
 * that word, and the pin is then let go. Tapping the pinned word again lets it
 * go without a note. That keeps the tool's first rule — a note is one press,
 * made without looking away from the reciter — and adds the word as an
 * optional step before it, never a step anybody has to take.
 *
 * Three rules keep a pin from putting a note somewhere nobody meant:
 *
 *   * **A pin is for one note.** The note after it goes on the marker's verse
 *     again. A word picked a minute ago silently catching the next slip would
 *     be worse than no word at all.
 *   * **A pin applies only where the marker is.** Turning the page, tapping a
 *     verse on the plate, the marker following a reciter — every other way the
 *     marker moves — leaves the pin behind without anyone having to clear it,
 *     because it is checked against the marker rather than remembered apart
 *     from it.
 *   * **A pin applies only while the words are on screen.** That one is the
 *     caller's to enforce: the plate has no words, and a pin nobody can see
 *     must not catch anything.
 *
 * `word` is an index into the verse's printed words — the same number the
 * follower speaks in (`At.word`) and the page's words carry (`PageWord.word`).
 */

export interface WordPin {
  anchorId: number;
  word: number;
}

/** A tap on a word: pins it, or lets it go if it was the one already pinned. */
export function tapWord(pin: WordPin | null, anchorId: number, word: number): WordPin | null {
  if (pin && pin.anchorId === anchorId && pin.word === word) return null;
  return { anchorId, word };
}

/** The pinned word, if the pin still applies to where the marker is. */
export function pinnedWordAt(pin: WordPin | null, anchorId: number): number | undefined {
  return pin && pin.anchorId === anchorId ? pin.word : undefined;
}

/**
 * A note, carrying the pinned word when there is one that applies.
 *
 * Returns the note untouched otherwise — no `word` key at all, so a note taken
 * the old way serialises exactly as it always did.
 */
export function withPinnedWord<T extends object>(
  note: T,
  pin: WordPin | null,
  anchorId: number,
): T & { word?: number } {
  const word = pinnedWordAt(pin, anchorId);
  return word === undefined ? note : { ...note, word };
}

/**
 * Which words carry notes, keyed `anchorId:word`, with the kinds in the order
 * they were taken — for marking them on the page.
 */
export function notedWords(
  notes: readonly { position: { anchor: { id: number } }; word?: number; kind: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const n of notes) {
    if (n.word === undefined) continue;
    const key = `${n.position.anchor.id}:${n.word}`;
    const kinds = out.get(key);
    if (kinds) kinds.push(n.kind); else out.set(key, [n.kind]);
  }
  return out;
}
