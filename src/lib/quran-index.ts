// Derived indexes over the mushaf: juz' boundaries, page boundaries, and the
// mapping between (surah, ayah) and the global ayah id.
//
// Everything the recitation session measures — percentage, completed juz',
// pages recited — is computed from these, so `buildQuranIndex` is a pure
// function and gets tested against the real JSON.

import { withBase } from './asset-url';
import { loadQuranData, getLoadedQuranData, type QuranVerse } from './quran-data';
import {
  editionFromIndexFile, madinahEdition, pageRangesOf, validateEdition,
  type MushafEdition, type MushafId, type MushafIndexFile,
} from './mushaf-editions';

export interface AyahLoc {
  /** Global ayah index, 1..6236. */
  id: number;
  surah: number;
  ayah: number;
  juz: number;
  page: number;
}

export interface Range {
  firstId: number;
  lastId: number;
}

/** One rendered word, carrying the ayah it belongs to so taps still work. */
export interface PageWord {
  text: string;
  ayahId: number;
  surah: number;
  ayah: number;
  /**
   * Which word of its own verse this is, counting from zero.
   *
   * The number the follower speaks in: `At.word` indexes the verse's printed
   * words, so carrying it here is what lets the word being recited be found on
   * the page. The verse's end-of-verse marker is the last token and is never a
   * word the reciter says, so it simply never matches.
   */
  word: number;
  /** True on the first word of a surah, where the print puts its ornamented band. */
  opensSurah: boolean;
}

export interface QuranIndex {
  /** Verses sorted by global id; `verses[i].id === i + 1`. */
  verses: QuranVerse[];
  /** Which printed layout the page numbers refer to. */
  mushaf: MushafId;
  totalAyahs: number;
  totalPages: number;
  /** `juzRanges[j - 1]` is the id range of juz' j. */
  juzRanges: Range[];
  /** `pageRanges[p - 1]` is the id range of mushaf page p. */
  pageRanges: Range[];
  /** `surahRanges[s - 1]` is the id range of surah s. */
  surahRanges: Range[];
  verseById(id: number): QuranVerse | undefined;
  locOf(id: number): AyahLoc | undefined;
  idOf(surah: number, ayah: number): number | undefined;
  /** All verses on a mushaf page, in order. */
  versesOfPage(page: number): QuranVerse[];
  /**
   * A page as it is actually printed: the first and last verse may be word
   * fragments, because printed pages break mid-ayah. `from`/`to` are token
   * indices into the verse's Uthmani text; `to` of -1 means "to the end".
   */
  pageFragments(page: number): { verse: QuranVerse; from: number; to: number }[];
  /**
   * The page broken into its printed lines, word by word.
   *
   * Empty when the edition carries no line layout — the Madinah data has none,
   * so its pages flow. Each word keeps its ayah so a tap still pins a position.
   */
  pageWordLines(page: number): PageWord[][];
  /** Juz' number containing this ayah. */
  juzOf(id: number): number;
  /** Page containing this ayah, in the active edition. */
  pageOf(id: number): number;
  /**
   * The number printed on that page. Pages are indexed 1..totalPages
   * internally; editions whose first text page is not numbered 1 (Shamarly
   * opens on 2) differ here, and this is the number the teacher must see.
   */
  pageLabel(page: number): number;
}

export function buildQuranIndex(raw: QuranVerse[], edition?: MushafEdition): QuranIndex {
  const verses = [...raw].sort((a, b) => a.id - b.id);
  const totalAyahs = verses.length;

  const byLoc = new Map<number, number>();
  const juzFirst: number[] = [];
  const juzLast: number[] = [];
  const surahFirst: number[] = [];
  const surahLast: number[] = [];

  for (const v of verses) {
    byLoc.set(v.sura_no * 1000 + v.aya_no, v.id);

    const j = v.jozz - 1;
    if (juzFirst[j] === undefined || v.id < juzFirst[j]) juzFirst[j] = v.id;
    if (juzLast[j] === undefined || v.id > juzLast[j]) juzLast[j] = v.id;

    const s = v.sura_no - 1;
    if (surahFirst[s] === undefined || v.id < surahFirst[s]) surahFirst[s] = v.id;
    if (surahLast[s] === undefined || v.id > surahLast[s]) surahLast[s] = v.id;
  }

  const juzRanges: Range[] = juzFirst.map((firstId, i) => ({ firstId, lastId: juzLast[i] }));
  const surahRanges: Range[] = surahFirst.map((firstId, i) => ({ firstId, lastId: surahLast[i] }));

  // Pagination is the one thing that differs between printed editions.
  const layout = edition ?? madinahEdition(verses);
  const pageRanges: Range[] = pageRangesOf(layout, totalAyahs);

  const pageBuckets = new Map<number, QuranVerse[]>();
  pageRanges.forEach((r, i) => {
    pageBuckets.set(i + 1, verses.slice(r.firstId - 1, r.lastId));
  });

  /** Page containing an ayah — binary search over the page starts. */
  const pageOf = (id: number): number => {
    let lo = 0;
    let hi = layout.pageStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (layout.pageStarts[mid] <= id) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const verseById = (id: number) =>
    id >= 1 && id <= totalAyahs && verses[id - 1]?.id === id ? verses[id - 1] : verses.find(v => v.id === id);

  return {
    verses,
    mushaf: layout.id,
    totalAyahs,
    totalPages: pageRanges.length,
    juzRanges,
    pageRanges,
    surahRanges,
    verseById,
    pageOf,
    pageLabel: (page) => page + layout.firstPageNumber - 1,
    locOf(id) {
      const v = verseById(id);
      if (!v) return undefined;
      // `page` follows the active edition, not the column in the JSON.
      return { id: v.id, surah: v.sura_no, ayah: v.aya_no, juz: v.jozz, page: pageOf(v.id) };
    },
    idOf: (surah, ayah) => byLoc.get(surah * 1000 + ayah),
    versesOfPage: (page) => pageBuckets.get(page) ?? [],
    pageFragments: (page) => {
      const list = pageBuckets.get(page) ?? [];
      if (!list.length) return [];
      // The page's own ayahs are those whose end-marker falls on it, so only
      // the first can be a tail — the rest end here and are whole.
      const startWord = layout.pageStartWord?.[page - 1] ?? 0;
      const out = list.map((verse, i) => ({ verse, from: i === 0 ? startWord : 0, to: -1 }));
      // Whatever room is left after the last marker is filled by the opening
      // words of the following ayah. That text is printed on this page even
      // though the ayah is counted on the next.
      const nextStartWord = layout.pageStartWord?.[page] ?? 0;
      if (nextStartWord > 0) {
        const head = verseById(pageRanges[page]?.firstId ?? 0);
        if (head) out.push({ verse: head, from: 0, to: nextStartWord });
      }
      return out;
    },
    pageWordLines(page) {
      const breaks = layout.pageLines?.[page - 1];
      if (!breaks?.length) return [];
      // Flatten the page into words, keeping each word's ayah.
      const words: PageWord[] = [];
      for (const { verse, from, to } of this.pageFragments(page)) {
        const tokens = verse.aya_text.trim().split(/\s+/);
        const end = to < 0 ? tokens.length : to;
        for (let k = from; k < end; k++) {
          words.push({
            text: tokens[k],
            ayahId: verse.id,
            surah: verse.sura_no,
            ayah: verse.aya_no,
            word: k,
            opensSurah: verse.aya_no === 1 && k === 0 && from === 0,
          });
        }
      }
      // Cut at the printed line starts; a stray break past the end is ignored
      // rather than producing an empty line.
      const cuts = [0, ...breaks.filter(b => b > 0 && b < words.length), words.length];
      const lines: PageWord[][] = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const slice = words.slice(cuts[i], cuts[i + 1]);
        if (slice.length) lines.push(slice);
      }
      return lines;
    },
    juzOf: (id) => verseById(id)?.jozz ?? 1,
  };
}

// ── Editions ────────────────────────────────────────────────────

const indexCache: Partial<Record<MushafId, QuranIndex>> = {};
const indexPromises: Partial<Record<MushafId, Promise<QuranIndex>>> = {};

/** Editions with a usable page index, discovered on first load. */
let available: MushafId[] = ['madinah'];
export function availableMushafs(): MushafId[] { return available; }

/**
 * Loads a supplied page index from `public/mushaf-<id>.json`.
 *
 * A missing file simply means the edition is not installed — the switch does
 * not offer it. A malformed one is refused loudly, because a page index that
 * is subtly wrong would mis-credit recitation and misdirect review silently.
 */
/**
 * The Madinah line layout, fetched once.
 *
 * Madinah's pagination comes from the text itself — every verse carries its
 * page — so the edition needs no supplied index. What the text cannot say is
 * where the printed **lines** break, and without that the page flows freely and
 * stops being the page anybody memorised from. `mushaf-madinah-lines.json`
 * supplies it; see `scripts/build-madinah-lines.mjs`.
 *
 * Absent or malformed means the layout is simply not applied. That degrades to
 * exactly what the reader did before the file existed, which is why this is
 * quiet where a bad *page index* would be loud: a wrong line break moves a word
 * to the line above, while a wrong page index mis-credits a recitation.
 */
let madinahLines: number[][] | null = null;
let askedForLines = false;

async function loadMadinahLines(): Promise<number[][] | null> {
  if (askedForLines) return madinahLines;
  askedForLines = true;
  try {
    const res = await fetch(withBase('mushaf-madinah-lines.json'));
    if (!res.ok) return null;
    const file = (await res.json()) as { pageLines?: unknown };
    if (Array.isArray(file?.pageLines)) madinahLines = file.pageLines as number[][];
  } catch {
    madinahLines = null;
  }
  return madinahLines;
}

async function loadEdition(id: MushafId, base: QuranIndex): Promise<MushafEdition | null> {
  if (id === 'madinah') return madinahEdition(base.verses);
  let file: MushafIndexFile;
  try {
    const res = await fetch(withBase(`mushaf-${id}.json`));
    if (!res.ok) return null;
    // An SPA fallback can answer a missing file with index.html, so parsing is
    // part of "does this edition exist", not a separate failure.
    file = (await res.json()) as MushafIndexFile;
  } catch {
    return null;
  }
  const edition = editionFromIndexFile(file, base.idOf);
  const problems = validateEdition(edition, base.totalAyahs);
  if (problems.length) {
    console.error(`[mushaf] refusing the ${id} page index:\n- ${problems.join('\n- ')}`);
    return null;
  }
  return edition;
}

export function loadQuranIndex(mushaf: MushafId = 'madinah'): Promise<QuranIndex> {
  const cached = indexCache[mushaf];
  if (cached) return Promise.resolve(cached);
  const pending = indexPromises[mushaf];
  if (pending) return pending;

  const p = loadQuranData('hafs').then(async raw => {
    // Built here rather than reused from the cache: the synchronous peek may
    // have made one already, and that one has no line layout.
    const lines = await loadMadinahLines();
    const madinah = buildQuranIndex(raw, { ...madinahEdition(raw), pageLines: lines ?? undefined });
    indexCache.madinah = madinah;
    if (mushaf === 'madinah') return madinah;

    const edition = await loadEdition(mushaf, madinah);
    if (!edition) {
      available = available.filter(m => m !== mushaf);
      return madinah;
    }
    const built = buildQuranIndex(raw, edition);
    indexCache[mushaf] = built;
    if (!available.includes(mushaf)) available = [...available, mushaf];
    return built;
  });
  indexPromises[mushaf] = p;
  return p;
}

/** Probes for editions beyond Madinah so the UI knows whether to offer a choice. */
export async function discoverMushafs(): Promise<MushafId[]> {
  await loadQuranIndex('shamarly');
  return available;
}

/** Synchronous peek — null until `loadQuranIndex` has resolved. */
export function getQuranIndex(mushaf: MushafId = 'madinah'): QuranIndex | null {
  const cached = indexCache[mushaf];
  if (cached) return cached;
  if (mushaf === 'madinah') {
    const raw = getLoadedQuranData('hafs');
    if (raw) { indexCache.madinah = buildQuranIndex(raw); return indexCache.madinah; }
  }
  return null;
}
