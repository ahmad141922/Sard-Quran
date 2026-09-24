/**
 * Which printed muṣḥafs the viewer can show.
 *
 * `riwayaId` and `editionId` are separate on purpose: one riwaya has many
 * printed editions — Hafs alone is published as the Madinah muṣḥaf and as
 * ash-Shamarly — and the reader picks a riwaya first, an edition second. A
 * registry keyed only by riwaya would make the second impossible.
 *
 * Nothing here is imported by MushafPageViewer. The viewer takes a URL.
 */

import { mushafRoot } from '../asset-url';
import { displayLang, isArabic, type DisplayLang } from '../display-lang';

export type QiraahId =
  | 'nafi' | 'ibn-kathir' | 'abu-amr' | 'ibn-amir' | 'asim'
  | 'hamzah' | 'kisai' | 'abu-jafar' | 'yaqub' | 'khalaf';

export type RiwayaId =
  | 'qalun' | 'warsh' | 'bazzi' | 'qunbul' | 'duri-abu-amr' | 'susi'
  | 'hisham' | 'ibn-dhakwan' | 'shubah' | 'hafs' | 'khalaf-an-hamzah'
  | 'khallad' | 'abu-harith' | 'duri-kisai' | 'ibn-wardan' | 'ibn-jammaz'
  | 'ruways' | 'rawh' | 'ishaq' | 'idris';

/**
 * How the edition numbers its verses.
 *
 * The riwayat do not agree on where one verse ends and the next begins, so the
 * same words carry different numbers: al-Kahf runs to 110 in the Kufan count
 * that Hafs is printed with and to 105 in the Madinan count Warsh is printed
 * with. Every ayah number therefore belongs to a scheme, and a number carried
 * from one edition to another without conversion points at the wrong verse.
 */
export type AyahCountingId = 'kufi' | 'madani-first' | 'basri';

/** The scheme the session and the text data are stored in. */
export const CANONICAL_COUNTING: AyahCountingId = 'kufi';

export interface AyahCounting {
  nameAr: string;
  nameEn: string;
  totalAyahs: number;
  /**
   * Whether al-Fatiha's basmala is its first verse.
   *
   * The Kufan scheme numbers it; the Madinan does not, and splits the last
   * verse in two instead — so both books show seven verses and neither page
   * shows why they are not the same seven. It is the one divergence no page
   * index can reveal, which is why the scheme has to state it.
   */
  numbersBasmala: boolean;
}

export const AYAH_COUNTING: Record<AyahCountingId, AyahCounting> = {
  // 6236 is the Kufan total, and the length of our text dataset.
  kufi: { nameAr: 'العدّ الكوفي', nameEn: 'Kufan counting', totalAyahs: 6236, numbersBasmala: true },
  // 6214 is read back out of the King Fahd Complex's own Warsh plates by
  // `mushaf:index`, not assumed; `mushaf:validate` fails if an asset disagrees.
  'madani-first': { nameAr: 'العدّ المدني الأول', nameEn: 'First Madinan counting', totalAyahs: 6214, numbersBasmala: false },
  /**
   * The Duri plates number 6218 verses — a third table, 44 surahs apart from
   * Hafs and 11 from Warsh. The total is measured; the name follows the
   * riwaya's own provenance, ad-Duri reporting from Abu Amr of Basra, and is a
   * label on the data rather than anything derived from it. Nothing in the app
   * reads the name: positions are converted through each edition's own index.
   */
  basri: { nameAr: 'عدّ مصحف الدوري', nameEn: "Ad-Duri mushaf counting", totalAyahs: 6218, numbersBasmala: false },
};

export interface MushafDefinition {
  /** Stable key, `<riwaya>-<publisher>`, e.g. `hafs-kfqc`. */
  id: string;
  nameAr: string;
  nameEn: string;
  qiraahId: QiraahId;
  riwayaId: RiwayaId;
  /** The print run. One riwaya may have several. */
  editionId: string;
  publisherAr: string;
  publisherEn: string;
  /** Never assume 604 — al-Awqaf's Qalun runs to 612. */
  pageCount: number;
  /** Printed number of the first page that carries text. */
  firstPageNumber: number;
  /** The verse numbering these pages are printed with. */
  ayahCounting: AyahCountingId;
  /**
   * Editions typeset to the same page boundaries share a group, so a position
   * on page 105 of one is the same words as page 105 of another. The King Fahd
   * Complex sets every riwaya it prints to one 604-page layout; ash-Shamarly
   * is its own book and will not join this group. Claimed here, checked
   * against the real plates in `mushaf-package.test.ts`.
   */
  pageAlignmentGroup?: string;
  /**
   * How the pages are held. `none` means we have this edition's pagination but
   * no licensed page images — the text layer renders it, line for line, until
   * plates arrive. Nothing else changes when they do.
   */
  pageFormat: 'svg' | 'webp' | 'png' | 'none';
  /** Where the ayah regions come from. */
  hotspotMode: 'embedded-svg' | 'external-json' | 'none';
  /**
   * Root of this edition's assets — `pages/`, `manifest.json`,
   * `page-index.json` all hang off it.
   *
   * A relative value is the ordinary case and says only where the package sits
   * among the others; `VITE_MUSHAF_BASE_URL` then decides which host serves
   * them all. An absolute value overrides that entirely, for an edition that
   * has to be served from somewhere of its own. See `assetRoot`.
   */
  assetBaseUrl: string;
  hotspotBasePath?: string;
  /** Pagination used by the text layer for reports and the review plan. */
  textPaginationId: 'madinah' | 'shamarly';
  /** Set on the edition offered when a session carries no choice. */
  isDefault?: boolean;
  /**
   * Whether a teacher may pick this edition today.
   *
   * Absent means yes. An edition we hold the pagination of but no plates is
   * still a real edition — its data is sound, old sessions may name it, and
   * its package is still validated — but offering it puts a book with no pages
   * in a list of books. So it stays in the registry and out of the picker,
   * which is a smaller lie than either deleting it or shipping it.
   */
  offered?: boolean;
}

export const MUSHAF_REGISTRY: MushafDefinition[] = [
  {
    id: 'hafs-kfqc',
    nameAr: 'مصحف المدينة النبوية',
    nameEn: 'The Madinah Mushaf',
    qiraahId: 'asim',
    riwayaId: 'hafs',
    editionId: 'kfqc',
    publisherAr: 'مجمع الملك فهد لطباعة المصحف الشريف',
    publisherEn: 'King Fahd Complex for the Printing of the Holy Quran',
    pageCount: 604,
    firstPageNumber: 1,
    ayahCounting: 'kufi',
    pageAlignmentGroup: 'kfqc-604',
    pageFormat: 'svg',
    hotspotMode: 'embedded-svg',
    assetBaseUrl: '/mushafs/hafs-kfqc',
    textPaginationId: 'madinah',
    isDefault: true,
  },
  {
    id: 'warsh-kfqc',
    nameAr: 'مصحف المدينة النبوية',
    nameEn: 'The Madinah Mushaf',
    qiraahId: 'nafi',
    riwayaId: 'warsh',
    editionId: 'kfqc',
    publisherAr: 'مجمع الملك فهد لطباعة المصحف الشريف',
    publisherEn: 'King Fahd Complex for the Printing of the Holy Quran',
    pageCount: 604,
    firstPageNumber: 1,
    ayahCounting: 'madani-first',
    pageAlignmentGroup: 'kfqc-604',
    pageFormat: 'svg',
    hotspotMode: 'embedded-svg',
    assetBaseUrl: '/mushafs/warsh-kfqc',
    textPaginationId: 'madinah',
  },
  {
    id: 'qalun-kfqc',
    nameAr: 'مصحف المدينة النبوية',
    nameEn: 'The Madinah Mushaf',
    qiraahId: 'nafi',
    riwayaId: 'qalun',
    editionId: 'kfqc',
    publisherAr: 'مجمّع الملك فهد لطباعة المصحف الشريف',
    publisherEn: 'King Fahd Complex for the Printing of the Holy Quran',
    pageCount: 604,
    firstPageNumber: 1,
    // Read back out of these plates, not inherited from Warsh because both are
    // Nafi': 6214 verses, and a per-surah table identical to Warsh's in all 114
    // surahs. `mushaf-package.test.ts` re-checks that against the assets.
    ayahCounting: 'madani-first',
    pageAlignmentGroup: 'kfqc-604',
    pageFormat: 'svg',
    hotspotMode: 'embedded-svg',
    assetBaseUrl: '/mushafs/qalun-kfqc',
    textPaginationId: 'madinah',
  },
  {
    id: 'duri-abu-amr-kfqc',
    nameAr: 'مصحف المدينة النبوية',
    nameEn: 'The Madinah Mushaf',
    qiraahId: 'abu-amr',
    riwayaId: 'duri-abu-amr',
    editionId: 'kfqc',
    publisherAr: 'مجمّع الملك فهد لطباعة المصحف الشريف',
    publisherEn: 'King Fahd Complex for the Printing of the Holy Quran',
    pageCount: 604,
    firstPageNumber: 1,
    // Its own table, read off its own plates: 6218 verses, unlike any other
    // edition here.
    ayahCounting: 'basri',
    pageAlignmentGroup: 'kfqc-604',
    pageFormat: 'svg',
    hotspotMode: 'embedded-svg',
    assetBaseUrl: '/mushafs/duri-abu-amr-kfqc',
    textPaginationId: 'madinah',
  },
  {
    id: 'shubah-kfqc',
    nameAr: 'مصحف المدينة النبوية',
    nameEn: 'The Madinah Mushaf',
    qiraahId: 'asim',
    riwayaId: 'shubah',
    editionId: 'kfqc',
    publisherAr: 'مجمّع الملك فهد لطباعة المصحف الشريف',
    publisherEn: 'King Fahd Complex for the Printing of the Holy Quran',
    pageCount: 604,
    firstPageNumber: 1,
    // Shu'bah and Hafs are both from 'Asim and these plates number alike: 6236
    // verses, every surah ending where Hafs ends it, every page carrying the
    // same list. Measured, not inherited — and it makes this the first pair of
    // *different* books that need no conversion at all between them.
    ayahCounting: 'kufi',
    pageAlignmentGroup: 'kfqc-604',
    pageFormat: 'svg',
    hotspotMode: 'embedded-svg',
    assetBaseUrl: '/mushafs/shubah-kfqc',
    textPaginationId: 'madinah',
  },
  {
    id: 'hafs-shamarly',
    nameAr: 'مصحف الشمرلي',
    nameEn: 'The Shamarly Mushaf',
    qiraahId: 'asim',
    riwayaId: 'hafs',
    editionId: 'shamarly',
    publisherAr: 'مطبعة الشمرلي',
    publisherEn: 'Al-Shamarly Press',
    // Its own book: 521 pages numbered from 2, because its first leaf carries
    // no Qur'anic text. Neither figure is 604 and neither is guessed.
    pageCount: 521,
    firstPageNumber: 2,
    // Hafs is Hafs: the same Kufan numbering as the Madinah muṣḥaf. What
    // differs is where the pages break — which is the whole point of holding
    // it as a separate edition.
    ayahCounting: 'kufi',
    // Deliberately in no alignment group. Page 106 of this book is not page
    // 106 of the King Fahd Complex's, and nothing may assume otherwise.
    pageFormat: 'none',
    hotspotMode: 'none',
    assetBaseUrl: '/mushafs/hafs-shamarly',
    textPaginationId: 'shamarly',
    // Held, not offered: no licensed plates yet, so a teacher choosing it would
    // get the text layer where every other edition gives the printed page.
    offered: false,
  },
];

export const RIWAYA_NAMES_AR: Partial<Record<RiwayaId, string>> = {
  hafs: 'حفص عن عاصم',
  shubah: 'شعبة عن عاصم',
  warsh: 'ورش عن نافع',
  qalun: 'قالون عن نافع',
  'duri-abu-amr': 'الدوري عن أبي عمرو',
};

/**
 * The riwaya as a non-Arabic reader names it: the reciter, then whom he reports
 * from — the same two names in the same order, transliterated rather than
 * translated, because "Hafs from Asim" is what it is called in English too.
 */
export const RIWAYA_NAMES_EN: Partial<Record<RiwayaId, string>> = {
  hafs: "Hafs from 'Asim",
  shubah: "Shu'bah from 'Asim",
  warsh: "Warsh from Nafi'",
  qalun: "Qalun from Nafi'",
  'duri-abu-amr': "Ad-Duri from Abu 'Amr",
};

export function getMushaf(id: string): MushafDefinition | undefined {
  return MUSHAF_REGISTRY.find(m => m.id === id);
}

export function defaultMushaf(): MushafDefinition {
  return MUSHAF_REGISTRY.find(m => m.isDefault) ?? MUSHAF_REGISTRY[0];
}

/** Every edition of a riwaya the registry holds, offered or not. */
export function editionsOfRiwaya(riwaya: RiwayaId): MushafDefinition[] {
  return MUSHAF_REGISTRY.filter(m => m.riwayaId === riwaya);
}

/** Those of them a teacher may actually pick. */
export function offeredEditionsOfRiwaya(riwaya: RiwayaId): MushafDefinition[] {
  return editionsOfRiwaya(riwaya).filter(m => m.offered !== false);
}

/** Riwayat that have at least one offered edition, in registry order. */
export function availableRiwayat(): RiwayaId[] {
  return [...new Set(MUSHAF_REGISTRY.filter(m => m.offered !== false).map(m => m.riwayaId))];
}

/** The book a riwaya opens to when nothing else decides. */
export function defaultEditionOfRiwaya(riwaya: RiwayaId): MushafDefinition | undefined {
  return offeredEditionsOfRiwaya(riwaya)[0];
}

export function riwayaNameAr(riwaya: RiwayaId): string {
  return RIWAYA_NAMES_AR[riwaya] ?? riwaya;
}

/** The riwaya in the language on screen. */
export function riwayaName(riwaya: RiwayaId, lang: DisplayLang = displayLang()): string {
  if (isArabic(lang)) return riwayaNameAr(riwaya);
  return RIWAYA_NAMES_EN[riwaya] ?? riwaya;
}

/** The edition in the language on screen. */
export function mushafName(m: MushafDefinition, lang: DisplayLang = displayLang()): string {
  return isArabic(lang) ? m.nameAr : m.nameEn;
}

/** Its publisher, likewise. */
export function publisherName(m: MushafDefinition, lang: DisplayLang = displayLang()): string {
  return isArabic(lang) ? m.publisherAr : m.publisherEn;
}

/** The counting scheme, likewise. */
export function countingName(counting: AyahCounting, lang: DisplayLang = displayLang()): string {
  return isArabic(lang) ? counting.nameAr : counting.nameEn;
}

/**
 * What to call this muṣḥaf where both facts matter at once.
 *
 * The King Fahd Complex prints several riwayat as the Madinah muṣḥaf, so the
 * edition's name alone does not say which book is open.
 */
export function mushafFullNameAr(m: MushafDefinition): string {
  return `${m.nameAr} — ${riwayaNameAr(m.riwayaId)}`;
}

/** The same pairing, in the language on screen. */
export function mushafFullName(m: MushafDefinition, lang: DisplayLang = displayLang()): string {
  return `${mushafName(m, lang)} — ${riwayaName(m.riwayaId, lang)}`;
}

/**
 * Where this edition's package actually is at runtime.
 *
 * Two mechanisms, in this order:
 *
 * 1. An **absolute** `assetBaseUrl` is an edition speaking for itself — a
 *    licensed print served from its publisher's own host, say — and nothing
 *    overrides it.
 * 2. Otherwise the packages sit together under `mushafRoot()`, each in a
 *    folder named by its id: under the app in development, in a bucket on its
 *    own domain once five editions add up to 1.6 GB.
 *
 * Every URL below is built from this, so moving the plates is configuration
 * and touches no caller.
 */
export function assetRoot(m: MushafDefinition): string {
  if (/^https?:\/\//i.test(m.assetBaseUrl)) return m.assetBaseUrl.replace(/\/+$/, '');
  return `${mushafRoot()}/${m.id}`;
}

/** URL of one page asset. Pages are named by their printed number. */
export function pageAssetUrl(m: MushafDefinition, printedPage: number): string {
  return `${assetRoot(m)}/pages/${String(printedPage).padStart(3, '0')}.${m.pageFormat}`;
}

/** Which pages we hold. */
export function manifestUrl(m: MushafDefinition): string {
  return `${assetRoot(m)}/manifest.json`;
}

/** Which ayahs sit on each of them, in this edition's own numbering. */
export function pageIndexUrl(m: MushafDefinition): string {
  return `${assetRoot(m)}/page-index.json`;
}
