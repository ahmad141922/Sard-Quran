import type { QuranIndex } from '@/lib/quran-index';
import { TEXT_PAGINATION_ALIGNMENT } from '@/lib/mushaf-editions';
import type { AyahRef, MushafPageIndex, PagedAyahs } from './page-index';
import { CANONICAL_COUNTING, type MushafDefinition } from './registry';
import type { CanonicalBook, EditionBook } from './position';

/**
 * The text layer, asked the same questions as a printed edition.
 *
 * The session's positions are stored in the numbering of the text dataset —
 * Kufan, paginated as the Madinah muṣḥaf — so that dataset is the book every
 * other edition is converted against. Wrapping it here means the conversion
 * needs no extra download and works even before an edition's own plates are
 * installed.
 */
export function pagedAyahsFromQuranIndex(index: QuranIndex): PagedAyahs {
  // Pages are held 1..totalPages internally and displayed through this offset.
  const offset = index.pageLabel(1) - 1;
  return {
    pageOf(surah, ayah) {
      const id = index.idOf(surah, ayah);
      return id === undefined ? undefined : index.pageLabel(index.pageOf(id));
    },
    ayahsOfPage(printedPage) {
      const refs: AyahRef[] = [];
      for (const v of index.versesOfPage(printedPage - offset)) {
        refs.push({ surah: v.sura_no, ayah: v.aya_no });
      }
      return refs;
    },
    lastAyahOf(surah) {
      const range = index.surahRanges[surah - 1];
      return range ? index.locOf(range.lastId)?.ayah : undefined;
    },
  };
}

/**
 * The text layer as the interop language.
 *
 * The scheme is named on every anchor derived from it, so nothing downstream
 * has to assume which numbering an ordinal belongs to.
 */
export function canonicalBookFromQuranIndex(index: QuranIndex): CanonicalBook {
  return {
    scheme: CANONICAL_COUNTING,
    pages: pagedAyahsFromQuranIndex(index),
    alignmentGroup: TEXT_PAGINATION_ALIGNMENT[index.mushaf],
    totalAyahs: index.totalAyahs,
    idOf: (surah, ayah) => index.idOf(surah, ayah),
    locOf: id => {
      const loc = index.locOf(id);
      return loc ? { surah: loc.surah, ayah: loc.ayah } : undefined;
    },
  };
}

/**
 * The book a position is read in.
 *
 * An edition whose own page index has not loaded yet can still be read against
 * the canonical pages — but only if it numbers verses the same way, because
 * that is the one case where no conversion is involved.
 */
export function editionBook(
  def: MushafDefinition, pages: MushafPageIndex | null, canonical: CanonicalBook,
): EditionBook | null {
  // Pages from another edition would answer every question plausibly and
  // wrongly, so a mismatched pair is refused rather than trusted.
  if (pages) return pages.id === def.id ? { def, pages } : null;
  return def.ayahCounting === canonical.scheme ? { def, pages: canonical.pages } : null;
}
