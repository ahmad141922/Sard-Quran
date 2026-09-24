import type { AyahRef, PagedAyahs } from './page-index';
import type { MushafDefinition } from './registry';

/**
 * Carrying a position from one printed edition to another.
 *
 * The session stores a Qur'anic position — surah and ayah — never a page. But
 * the number itself belongs to a counting scheme: Hafs is printed with the
 * Kufan count, Warsh with the Madinan, and al-Kahf 110 in one book is al-Kahf
 * 105 in the other. Switching riwaya must therefore convert the number and
 * recompute the page, not carry either across.
 *
 * The conversion is not invented. The King Fahd Complex sets every riwaya it
 * prints to the same 604-page layout, so page 105 is the same words in both
 * books; that is the anchor. Inside a page the two lists line up entry by
 * entry, and on the 94 pages of 604 where a verse division falls, they cannot
 * — those are reported `exact: false` rather than being guessed at silently.
 */

export interface MappedLocation extends AyahRef {
  /** Printed page in the destination book, asked of the destination itself. */
  page: number;
  /**
   * False when the two books divide verses differently across this page, so
   * the ayah is right to within the page but may be a verse or two out.
   */
  exact: boolean;
}

export interface MapOptions {
  /** The two books are set to the same page boundaries. */
  aligned: boolean;
  /** They number verses the same way, so a number needs no conversion. */
  sameCounting: boolean;
  /** Whether the source scheme numbers al-Fatiha's basmala; see below. */
  fromNumbersBasmala?: boolean;
  /** Whether the destination's does. */
  toNumbersBasmala?: boolean;
}

/**
 * Al-Fatiha, where the page layer cannot help.
 *
 * The Kufan scheme numbers the basmala as verse 1; the Madinan does not, and
 * splits `صراط الذين أنعمت عليهم` off the last verse instead. Both books
 * therefore print seven verses on page 1 and the counts match, so the
 * page-anchored conversion below would map each to the one printed in the same
 * position and be wrong by a verse throughout the surah a student recites most.
 * The schemes state the difference; this applies it.
 *
 * No other surah is affected: the basmala heading surahs 2-114 is numbered in
 * neither scheme.
 */
function mapFatiha(to: PagedAyahs, ayah: number, fromNumbers: boolean): { ayah: number; exact: boolean } {
  if (fromNumbers) {
    // Kufan 1:1 is the basmala, which the destination does not number at all;
    // 1:7 is two verses there. Both are answered as nearly as they can be.
    if (ayah <= 1) return { ayah: 1, exact: false };
    const last = to.lastAyahOf(1) ?? 7;
    if (ayah >= last) return { ayah: Math.max(1, last - 1), exact: false };
    return { ayah: ayah - 1, exact: true };
  }
  // The other way: every verse sits inside the Kufan verse one number later —
  // except the last, which shares that verse with the one before it, so it has
  // nowhere of its own to go and says so.
  const last = to.lastAyahOf(1) ?? 7;
  const shifted = ayah + 1;
  return shifted > last ? { ayah: last, exact: false } : { ayah: shifted, exact: true };
}

/** Two books whose page N carries the same words. */
export function sharePageLayout(a: MushafDefinition, b: MushafDefinition): boolean {
  return !!a.pageAlignmentGroup && a.pageAlignmentGroup === b.pageAlignmentGroup;
}

/**
 * Where `ref` — read in the book `from` — falls in the book `to`.
 *
 * Three cases, and only one of them converts anything. Books that number alike
 * need no conversion. Books that number differently but are set to the same
 * pages are converted against those pages. Books that share neither have
 * nothing to anchor a conversion to, so the number is carried across untouched
 * and flagged inexact — the honest answer rather than a fabricated one.
 */
export function mapAyahBetween(
  from: PagedAyahs, to: PagedAyahs, ref: AyahRef, opts: MapOptions,
): MappedLocation | null {
  const at = (surah: number, ayah: number, exact: boolean): MappedLocation | null => {
    const page = to.pageOf(surah, ayah);
    return page === undefined ? null : { surah, ayah, page, exact };
  };

  const carry = (exact: boolean): MappedLocation | null => {
    const kept = at(ref.surah, ref.ayah, exact);
    if (kept) return kept;
    // The destination does not number that verse at all — it counts the surah
    // shorter. Clamp to its last verse, which is always inexact.
    const last = to.lastAyahOf(ref.surah);
    return last === undefined ? null : at(ref.surah, last, false);
  };

  if (opts.sameCounting) return carry(true);
  if (!opts.aligned) return carry(false);

  if (ref.surah === 1 && opts.fromNumbersBasmala !== opts.toNumbersBasmala) {
    const { ayah, exact } = mapFatiha(to, ref.ayah, !!opts.fromNumbersBasmala);
    const mapped = at(1, ayah, exact);
    if (mapped) return mapped;
  }

  // Surahs begin and end on the same words in every riwaya, whatever numbers
  // they give the verses between. Those two positions are therefore known
  // exactly, and are the ones a teacher jumps to most.
  if (ref.ayah === 1) return at(ref.surah, 1, true);
  const lastHere = from.lastAyahOf(ref.surah);
  const lastThere = to.lastAyahOf(ref.surah);
  if (lastHere !== undefined && lastThere !== undefined && ref.ayah === lastHere) {
    return at(ref.surah, lastThere, true);
  }

  const sourcePage = from.pageOf(ref.surah, ref.ayah);
  if (sourcePage === undefined) return carry(false);
  // Only this surah's verses on the page: a verse may never be mapped across a
  // surah boundary, however the two books divide the page between them.
  const ofSurah = (a: AyahRef) => a.surah === ref.surah;
  const source = from.ayahsOfPage(sourcePage).filter(ofSurah);
  const target = to.ayahsOfPage(sourcePage).filter(ofSurah);
  if (!source.length || !target.length) return carry(false);

  const i = source.findIndex(a => a.ayah === ref.ayah);
  if (i < 0) return carry(false);

  // Where the counts differ the divergence sits somewhere inside the page, and
  // the labels say which end still lines up: a run both books open on the same
  // verse is walked from the front, otherwise from the back.
  const head = target[0].ayah === source[0].ayah;
  const j = head
    ? Math.min(i, target.length - 1)
    : Math.max(0, target.length - (source.length - i));

  const mapped = target[Math.min(j, target.length - 1)];
  // The page is asked of the destination, never assumed equal to the source's:
  // alignment gets us the verse, the destination's own index gets us its page.
  const page = to.pageOf(mapped.surah, mapped.ayah) ?? sourcePage;
  return { ...mapped, page, exact: source.length === target.length };
}
