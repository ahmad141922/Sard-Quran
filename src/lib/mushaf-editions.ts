// Printed mushaf layouts.
//
// Teachers navigate by the page boundaries of the edition they hold. Those
// boundaries are physical facts about a specific print run — they cannot be
// derived from the text, only supplied. So an edition here is exactly one
// thing: the list of ayahs that begin each page.
//
// Everything else in the recitation feature stores positions as global ayah
// ids, which are edition-independent. Switching editions therefore changes
// what the teacher sees and what "finished the page" credits, and nothing else.

import type { QuranVerse } from './quran-data';

export type MushafId = 'madinah' | 'shamarly';

export interface MushafEdition {
  id: MushafId;
  totalPages: number;
  /**
   * Page number printed on the first page that carries Quran text. Madinah
   * starts at 1; Shamarly opens al-Fatiha on printed page 2, its first page
   * carrying no ayahs. Pages are indexed 1..totalPages internally and only
   * ever displayed through this offset, so the teacher reads the number that
   * is actually on the paper in front of them.
   */
  firstPageNumber: number;
  /** Global ayah id (1..6236) that begins each page, strictly ascending. */
  pageStarts: number[];
  /**
   * How many words of that ayah already sat on the previous page — printed
   * pages break mid-ayah, and this is where. `0` means the page starts cleanly
   * at the ayah, which is also the fallback wherever it could not be derived.
   */
  pageStartWord?: number[];
  /**
   * Where each printed line begins, as a word offset into the page's own word
   * sequence. Line 1 always starts at 0, so only lines 2..n are listed. An
   * empty entry means the page has no layout and its text flows freely.
   */
  pageLines?: number[][];
}

/**
 * Which editions are typeset to the same page boundaries as this pagination.
 *
 * The King Fahd Complex sets Hafs, Warsh and the rest to one 604-page layout,
 * so a position on page 105 of the Madinah text is page 105 of any of them.
 * ash-Shamarly is its own book and shares its boundaries with nothing.
 * `MushafDefinition.pageAlignmentGroup` names the same groups.
 */
export const TEXT_PAGINATION_ALIGNMENT: Record<MushafId, string> = {
  madinah: 'kfqc-604',
  shamarly: 'shamarly',
};

export const MUSHAF_LABELS: Record<MushafId, { ar: string; latin: string }> = {
  madinah: { ar: 'مصحف المدينة', latin: 'Madinah' },
  shamarly: { ar: 'مصحف الشمرلي', latin: 'Shamarly' },
};

/**
 * Page numbers that pin the King Fahd Complex layout. If a data swap ever
 * silently changes the pagination, the test built on these fails rather than
 * the teacher discovering it mid-recitation.
 */
export const MADINAH_LANDMARKS: { surah: number; ayah: number; page: number }[] = [
  { surah: 1, ayah: 1, page: 1 },
  { surah: 2, ayah: 1, page: 2 },
  { surah: 2, ayah: 255, page: 42 },
  { surah: 18, ayah: 1, page: 293 },
  { surah: 36, ayah: 1, page: 440 },
  { surah: 67, ayah: 1, page: 562 },
  { surah: 78, ayah: 1, page: 582 },
  { surah: 114, ayah: 1, page: 604 },
];

/** The Madinah layout, read off the `page` column the mushaf JSON already carries. */
export function madinahEdition(verses: QuranVerse[]): MushafEdition {
  const starts: number[] = [];
  for (const v of verses) {
    const i = v.page - 1;
    if (starts[i] === undefined || v.id < starts[i]) starts[i] = v.id;
  }
  return { id: 'madinah', totalPages: starts.length, firstPageNumber: 1, pageStarts: starts };
}

/** Shape of a supplied page index, e.g. `public/mushaf-shamarly.json`. */
export interface MushafIndexFile {
  id: MushafId;
  totalPages: number;
  /** Printed number of the first page carrying text. Defaults to 1. */
  firstPageNumber?: number;
  /** One `[surah, ayah]` pair per page, in order, starting at `[1, 1]`. */
  pageStarts: [number, number][];
  /** Optional per-page word offset into that ayah; see MushafEdition. */
  pageStartWord?: number[];
  /** Optional per-page line layout; see MushafEdition. */
  pageLines?: number[][];
}

/**
 * `totalPages` is carried through from the file rather than recomputed from
 * the array: it is the supplier's own checksum, and a list that has lost
 * entries in transit must fail validation instead of quietly becoming a
 * shorter mushaf.
 */
export function editionFromIndexFile(
  file: MushafIndexFile,
  idOf: (surah: number, ayah: number) => number | undefined,
): MushafEdition {
  return {
    id: file.id,
    totalPages: file.totalPages,
    firstPageNumber: file.firstPageNumber ?? 1,
    pageStarts: file.pageStarts.map(([s, a]) => idOf(s, a) ?? -1),
    pageStartWord: file.pageStartWord,
    pageLines: file.pageLines,
  };
}

/**
 * Returns the reasons an edition is unusable, empty when it is sound.
 *
 * A page index that is subtly wrong is worse than none: "finished the page"
 * would credit the wrong ayahs and the review plan would send the student to
 * the wrong passage, both silently. So a supplied file is refused unless it is
 * complete and monotonic.
 */
export function validateEdition(edition: MushafEdition, totalAyahs: number): string[] {
  const problems: string[] = [];
  const { pageStarts, totalPages } = edition;

  if (pageStarts.length !== totalPages) {
    problems.push(`pageStarts has ${pageStarts.length} entries but totalPages is ${totalPages}`);
  }
  if (!pageStarts.length) {
    problems.push('pageStarts is empty');
    return problems;
  }
  if (pageStarts[0] !== 1) {
    problems.push(`page 1 must begin at the first ayah, got id ${pageStarts[0]}`);
  }
  if (!Number.isInteger(edition.firstPageNumber) || edition.firstPageNumber < 1) {
    problems.push(`firstPageNumber must be a positive integer, got ${edition.firstPageNumber}`);
  }
  for (let i = 0; i < pageStarts.length; i++) {
    const id = pageStarts[i];
    if (!Number.isInteger(id) || id < 1 || id > totalAyahs) {
      problems.push(`page ${i + 1} starts at id ${id}, which is not an ayah`);
      break;
    }
    if (i > 0 && id <= pageStarts[i - 1]) {
      problems.push(`page ${i + 1} starts at or before page ${i} (${id} <= ${pageStarts[i - 1]})`);
      break;
    }
  }
  return problems;
}

/** Inclusive `[firstId, lastId]` of every page, derived from the starts. */
export function pageRangesOf(edition: MushafEdition, totalAyahs: number): { firstId: number; lastId: number }[] {
  return edition.pageStarts.map((firstId, i) => ({
    firstId,
    lastId: (edition.pageStarts[i + 1] ?? totalAyahs + 1) - 1,
  }));
}
