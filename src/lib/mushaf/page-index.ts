import { useEffect, useState } from 'react';
import { pageIndexUrl, type MushafDefinition } from './registry';

/**
 * Which ayahs sit on which printed page of one edition.
 *
 * Read from the edition's own `page-index.json`, derived by `mushaf:index`
 * from the publisher's own plates. It is never borrowed from another edition:
 * the King Fahd Complex prints Warsh with a different verse numbering from
 * Hafs, so Hafs's page index applied to Warsh would name real pages and the
 * wrong verses on them — the kind of wrong that reads as right.
 */

export interface AyahRef { surah: number; ayah: number }

/** `[surah, fromAyah, toAyah]`, in reading order. */
type Run = [number, number, number];

export interface MushafPageIndexFile {
  id: string;
  firstPageNumber: number;
  pageCount: number;
  totalAyahs: number;
  pages: Run[][];
}

/**
 * A book's pages, asked about by ayah or by page.
 *
 * Both the visual editions and the text layer's own pagination answer this, so
 * a position can be carried between them without either knowing the other.
 */
export interface PagedAyahs {
  /** Printed page carrying this ayah, in this book's own numbering. */
  pageOf(surah: number, ayah: number): number | undefined;
  /** Ayahs printed on that page, in reading order. */
  ayahsOfPage(printedPage: number): AyahRef[];
  /** The highest number this book gives that surah. */
  lastAyahOf(surah: number): number | undefined;
}

export interface MushafPageIndex extends PagedAyahs {
  id: string;
  firstPageNumber: number;
  pageCount: number;
  totalAyahs: number;
}

const key = (surah: number, ayah: number) => surah * 1000 + ayah;

export function buildPageIndex(file: MushafPageIndexFile): MushafPageIndex {
  const pageByAyah = new Map<number, number>();
  const ayahsByPage: AyahRef[][] = [];
  const lastAyah = new Map<number, number>();

  file.pages.forEach((runs, i) => {
    const printed = file.firstPageNumber + i;
    const refs: AyahRef[] = [];
    for (const [surah, from, to] of runs) {
      for (let ayah = from; ayah <= to; ayah++) {
        refs.push({ surah, ayah });
        pageByAyah.set(key(surah, ayah), printed);
        if (ayah > (lastAyah.get(surah) ?? 0)) lastAyah.set(surah, ayah);
      }
    }
    ayahsByPage[i] = refs;
  });

  return {
    id: file.id,
    firstPageNumber: file.firstPageNumber,
    pageCount: file.pageCount,
    totalAyahs: file.totalAyahs,
    pageOf: (surah, ayah) => pageByAyah.get(key(surah, ayah)),
    ayahsOfPage: printed => ayahsByPage[printed - file.firstPageNumber] ?? [],
    lastAyahOf: surah => lastAyah.get(surah),
  };
}

const indexes = new Map<string, MushafPageIndex | null>();
const pending = new Map<string, Promise<MushafPageIndex | null>>();

export function loadPageIndex(m: MushafDefinition): Promise<MushafPageIndex | null> {
  const cached = indexes.get(m.id);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = pending.get(m.id);
  if (inflight) return inflight;

  const p = fetch(pageIndexUrl(m))
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((file: MushafPageIndexFile) => {
      const built = buildPageIndex(file);
      indexes.set(m.id, built);
      pending.delete(m.id);
      return built;
    })
    .catch(() => {
      // A blocked fetch is a moment, not a verdict: nothing is cached, so the
      // next reader tries again. Caching the failure would leave an edition
      // unreadable for the rest of the majlis over one dropped request.
      pending.delete(m.id);
      return null;
    });
  pending.set(m.id, p);
  return p;
}

export function getPageIndex(m: MushafDefinition): MushafPageIndex | null {
  return indexes.get(m.id) ?? null;
}

/** Test seam / recovery: forget one edition's index so it is fetched again. */
export function forgetPageIndex(m: MushafDefinition): void {
  indexes.delete(m.id);
  pending.delete(m.id);
}

/**
 * Loads the index once and re-renders when it arrives.
 *
 * The value is read straight from the cache during render rather than held in
 * state, so it always belongs to the edition being asked about. Held in state
 * it would lag one render behind a switch and hand back the *previous*
 * edition's pages under the new edition's name — which reads as a plausible
 * ayah number in the wrong numbering, the worst kind of wrong.
 */
export function useMushafPageIndex(m: MushafDefinition | null): MushafPageIndex | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!m || getPageIndex(m)) return;
    let alive = true;
    loadPageIndex(m).then(() => { if (alive) bump(v => v + 1); });
    return () => { alive = false; };
  }, [m]);
  return m ? getPageIndex(m) : null;
}

/** Test seam. */
export function __clearPageIndexes() { indexes.clear(); pending.clear(); }

/**
 * The last printed page this edition puts any of the surah on.
 *
 * Asked of the edition, never of a table of Hafs page numbers: a surah can end
 * on a different page in each print run, and ash-Shamarly will not agree with
 * any of the King Fahd Complex's. Derived from the surah's own last verse, so
 * a page carrying the end of one surah and the start of the next answers for
 * both.
 */
export function lastPageOfSurah(pages: PagedAyahs, surah: number): number | undefined {
  const last = pages.lastAyahOf(surah);
  return last === undefined ? undefined : pages.pageOf(surah, last);
}

/** The first printed page carrying any of it. */
export function firstPageOfSurah(pages: PagedAyahs, surah: number): number | undefined {
  return pages.pageOf(surah, 1);
}
