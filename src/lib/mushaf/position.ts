import {
  AYAH_COUNTING, type AyahCountingId, type MushafDefinition, type RiwayaId,
} from './registry';
import type { AyahRef, PagedAyahs } from './page-index';
import { mapAyahBetween, type MapOptions } from './locate';

/**
 * Where a position is, and what it is called there.
 *
 * A verse number means nothing on its own: al-Kahf 110 in the Hafs muṣḥaf and
 * al-Kahf 105 in the Warsh muṣḥaf are the same words, and al-Kahf 105 in Hafs
 * is not. So a position carries the book it was read in, and that book is
 * **authoritative** for the number — it is what the teacher saw, what the note
 * was written against, and what the report prints.
 *
 * The anchor is a second, separate thing: the same place expressed in one
 * declared scheme so that two books can be compared at all. It is used for
 * switching editions, for interval arithmetic, and for adding up sessions
 * recited in different riwayat. It is never the identity of the verse the
 * teacher is looking at, and it is never displayed.
 */

export interface CanonicalAnchor {
  /** The scheme the anchor is expressed in — named, not assumed. */
  scheme: AyahCountingId;
  surah: number;
  ayah: number;
  /** Ordinal in that scheme, 1..total. Interval arithmetic only. */
  id: number;
  /**
   * Whether identity and anchor are known to be the same verse.
   *
   * False where the two books divide the page differently and the conversion
   * is right to the page but not to the verse. A position like that must never
   * be shown as an exact match, and must never be written back over a number
   * the teacher actually saw.
   */
  exact: boolean;
}

/**
 * Whether the number was read off a page or worked out.
 *
 * `read` is a verse the teacher pointed at: the number is certain whatever the
 * anchor cost. `converted` came from somewhere else — a page turn, or carrying
 * the marker into another muṣḥaf — and is only as certain as that conversion.
 * The distinction is what lets the interface mark an approximation without
 * casting doubt on a number somebody actually tapped.
 */
export type PositionOrigin = 'read' | 'converted';

export interface AyahPosition {
  /** The edition this number belongs to. */
  mushafId: string;
  riwayaId: RiwayaId;
  ayahCounting: AyahCountingId;
  surah: number;
  /** In `ayahCounting`. Not comparable with an ayah number from another scheme. */
  ayah: number;
  origin: PositionOrigin;
  anchor: CanonicalAnchor;
}

/** A printed edition, and which ayahs it puts on each page. */
export interface EditionBook {
  def: MushafDefinition;
  pages: PagedAyahs;
}

/**
 * The interop language: one scheme with an ordinal index over the whole book.
 *
 * Today it is the Kufan numbering of our text dataset. It is a declared choice
 * carried on every anchor, not a privileged truth — an anchor says which
 * scheme it speaks, so the choice can change without silently reinterpreting
 * every stored session.
 */
export interface CanonicalBook {
  scheme: AyahCountingId;
  pages: PagedAyahs;
  /** Page-boundary group, so a conversion knows whether it has an anchor at all. */
  alignmentGroup?: string;
  totalAyahs: number;
  idOf(surah: number, ayah: number): number | undefined;
  locOf(id: number): AyahRef | undefined;
}

function options(
  from: { counting: AyahCountingId; group?: string },
  to: { counting: AyahCountingId; group?: string },
): MapOptions {
  return {
    aligned: !!from.group && from.group === to.group,
    sameCounting: from.counting === to.counting,
    fromNumbersBasmala: AYAH_COUNTING[from.counting].numbersBasmala,
    toNumbersBasmala: AYAH_COUNTING[to.counting].numbersBasmala,
  };
}

const editionSide = (book: EditionBook) =>
  ({ counting: book.def.ayahCounting, group: book.def.pageAlignmentGroup });
const canonicalSide = (book: CanonicalBook) =>
  ({ counting: book.scheme, group: book.alignmentGroup });

function editionFields(def: MushafDefinition) {
  return { mushafId: def.id, riwayaId: def.riwayaId, ayahCounting: def.ayahCounting };
}

/**
 * A verse the teacher pointed at, in the book in front of them.
 *
 * The number is taken as given — they read it off the page — and only the
 * anchor is derived, so an uncertain conversion degrades the anchor and never
 * the thing that was actually seen.
 */
export function positionInEdition(
  book: EditionBook, canonical: CanonicalBook, ref: AyahRef,
): AyahPosition | null {
  const mapped = mapAyahBetween(
    book.pages, canonical.pages, ref, options(editionSide(book), canonicalSide(canonical)),
  );
  if (!mapped) return null;
  const id = canonical.idOf(mapped.surah, mapped.ayah);
  if (id === undefined) return null;
  return {
    ...editionFields(book.def),
    surah: ref.surah,
    ayah: ref.ayah,
    origin: 'read',
    anchor: {
      scheme: canonical.scheme, surah: mapped.surah, ayah: mapped.ayah, id, exact: mapped.exact,
    },
  };
}

/** Where an anchor falls in a book — for goal ends, page spans and plan labels. */
export function positionFromAnchor(
  book: EditionBook, canonical: CanonicalBook, anchorId: number,
): AyahPosition | null {
  const loc = canonical.locOf(anchorId);
  if (!loc) return null;
  const mapped = mapAyahBetween(
    canonical.pages, book.pages, loc, options(canonicalSide(canonical), editionSide(book)),
  );
  if (!mapped) return null;
  return {
    ...editionFields(book.def),
    surah: mapped.surah,
    ayah: mapped.ayah,
    origin: 'converted',
    anchor: {
      scheme: canonical.scheme, surah: loc.surah, ayah: loc.ayah, id: anchorId, exact: mapped.exact,
    },
  };
}

/**
 * The same place, read in another book — what switching riwaya mid-majlis does.
 *
 * The anchor is carried across untouched: it is what the two books have in
 * common, and re-deriving it from a converted number would launder an
 * approximation into a fact. Only the printed number is recomputed, and it
 * inherits every doubt either step had.
 */
export function carryPositionTo(
  book: EditionBook, canonical: CanonicalBook, position: AyahPosition,
): AyahPosition | null {
  if (position.mushafId === book.def.id) return position;
  const mapped = mapAyahBetween(
    canonical.pages,
    book.pages,
    { surah: position.anchor.surah, ayah: position.anchor.ayah },
    options(canonicalSide(canonical), editionSide(book)),
  );
  if (!mapped) return null;
  return {
    ...editionFields(book.def),
    surah: mapped.surah,
    ayah: mapped.ayah,
    origin: 'converted',
    anchor: { ...position.anchor, exact: position.anchor.exact && mapped.exact },
  };
}

/** Whether two positions are known to be the same verse. */
export function samePlace(a: AyahPosition, b: AyahPosition): boolean {
  if (a.mushafId === b.mushafId) return a.surah === b.surah && a.ayah === b.ayah;
  return a.anchor.exact && b.anchor.exact && a.anchor.id === b.anchor.id;
}

/**
 * Whether the printed number itself can be relied on.
 *
 * A verse that was tapped always can. A converted one can only when the
 * conversion was certain — and that is the case the interface must mark.
 */
export function isCertain(p: AyahPosition): boolean {
  return p.origin === 'read' || p.anchor.exact;
}

/**
 * The surah's closing verse, numbered as this edition numbers it.
 *
 * What "finish the surah" means: an-Nisa ends at 176 in the Hafs muṣḥaf and at
 * 175 in the Warsh and Qalun ones, and a majlis read from one of those must
 * not be closed at the other's number.
 */
export function surahEndPosition(
  book: EditionBook, canonical: CanonicalBook, surah: number,
): AyahPosition | null {
  const ayah = book.pages.lastAyahOf(surah);
  return ayah === undefined ? null : positionInEdition(book, canonical, { surah, ayah });
}

/**
 * How this book numbers the page an anchor falls on — what the report counts
 * pages with when the majlis was read from a book that paginates its own way.
 */
export function pageOfAnchorIn(
  book: EditionBook, canonical: CanonicalBook,
): (anchorId: number) => number | undefined {
  return anchorId => {
    const at = positionFromAnchor(book, canonical, anchorId);
    return at ? book.pages.pageOf(at.surah, at.ayah) : undefined;
  };
}
