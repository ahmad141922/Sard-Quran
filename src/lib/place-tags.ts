/**
 * Labels a teacher or a student puts on a place, and keeps.
 *
 * Notes, marks and corrections all belong to the majlis they were made in:
 * they say what happened that evening. A tag says something about the **place
 * itself** — «this is where a ḥizb begins», «he is very weak here», «the two
 * similar passages meet here» — and a label like that is worthless if it dies
 * with the session. So tags are stored against the place, not the session, and
 * outlive every majlis.
 *
 * Keyed by **anchor id**, never by a displayed verse number: the same words
 * carry different numbers in different riwāyāt, and a tag filed under a Warsh
 * number would surface on the wrong verse in Ḥafṣ.
 *
 * Kept in localStorage rather than IndexedDB. A few hundred short strings is
 * nothing, it needs no schema and no version bump, and reading it must be
 * synchronous — the reader draws tags while scrolling.
 */

const KEY = 'tajweedoo:place-tags';

/**
 * The four a teacher reaches for most, offered as buttons so the common case
 * is one tap. Free text is still accepted — this is a starting point, not a
 * closed vocabulary, and a halaqa will have words we have not thought of.
 */
export const SUGGESTED_TAGS = ['متشابهات', 'وقف', 'بداية حزب', 'موضع ضعيف جدًا'] as const;

/** Longer than this and it stops being a label and starts being a note. */
export const MAX_TAG_LENGTH = 24;

export type PlaceTags = Record<number, string[]>;

function read(): PlaceTags {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as PlaceTags : {};
  } catch {
    // Private mode, or something else wrote nonsense here. Tags are an
    // addition to a majlis, never a thing it depends on.
    return {};
  }
}

function write(tags: PlaceTags): void {
  try { localStorage.setItem(KEY, JSON.stringify(tags)); } catch { /* nothing to do */ }
}

export function allTags(): PlaceTags {
  return read();
}

export function tagsAt(anchorId: number, tags: PlaceTags = read()): string[] {
  return tags[anchorId] ?? [];
}

/** Trimmed, folded and cut to length — the same label typed twice is one tag. */
export function normalizeTag(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

/**
 * Adds a tag, and returns the whole map so a caller can render immediately.
 *
 * Adding one that is already there is a no-op rather than a duplicate: a
 * teacher tapping «وقف» twice meant it once.
 */
export function addTag(anchorId: number, text: string): PlaceTags {
  const tag = normalizeTag(text);
  if (!tag) return read();
  const tags = read();
  const at = tags[anchorId] ?? [];
  if (!at.includes(tag)) tags[anchorId] = [...at, tag];
  write(tags);
  return tags;
}

export function removeTag(anchorId: number, text: string): PlaceTags {
  const tags = read();
  const left = (tags[anchorId] ?? []).filter(t => t !== text);
  // The key goes when the last tag does, so the store does not accumulate
  // empty arrays for every place anybody ever tagged and untagged.
  if (left.length) tags[anchorId] = left;
  else delete tags[anchorId];
  write(tags);
  return tags;
}

/** Every place carrying a given label — «show me everything marked weak». */
export function placesTagged(text: string, tags: PlaceTags = read()): number[] {
  return Object.entries(tags)
    .filter(([, list]) => list.includes(text))
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}

/** Every distinct label in use, commonest first — for a filter row. */
export function tagVocabulary(tags: PlaceTags = read()): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of Object.values(tags)) {
    for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** For tests, and for a «clear everything» the owner may one day want. */
export function clearTags(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
