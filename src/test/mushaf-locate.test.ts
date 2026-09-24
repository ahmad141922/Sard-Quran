import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { buildPageIndex, type MushafPageIndex, type MushafPageIndexFile } from '@/lib/mushaf/page-index';
import { mapAyahBetween, sharePageLayout } from '@/lib/mushaf/locate';
import { pagedAyahsFromQuranIndex } from '@/lib/mushaf/text-pages';
import { getMushaf } from '@/lib/mushaf/registry';

/**
 * Switching riwaya mid-majlis.
 *
 * The session holds a Qur'anic position, not a page, and its numbers are
 * Kufan. Warsh is printed with 6214 verses to Hafs's 6236, so showing the
 * teacher "al-Baqarah 125" in the Warsh muṣḥaf means finding the verse, not
 * the number. These are the checks that it does.
 */
const pkg = (id: string) => resolve(process.cwd(), 'sard/public/mushafs', id);
const has = (id: string) => existsSync(join(pkg(id), 'page-index.json'));
const both = has('hafs-kfqc') && has('warsh-kfqc');
const three = both && has('qalun-kfqc');
const five = three && has('duri-abu-amr-kfqc') && has('shubah-kfqc');

const read = (id: string): MushafPageIndex =>
  buildPageIndex(JSON.parse(readFileSync(join(pkg(id), 'page-index.json'), 'utf8')) as MushafPageIndexFile);

let hafs: MushafPageIndex;
let warsh: MushafPageIndex;
let qalun: MushafPageIndex;
let duri: MushafPageIndex;
let shubah: MushafPageIndex;

beforeAll(() => {
  if (!both) return;
  hafs = read('hafs-kfqc');
  warsh = read('warsh-kfqc');
  if (three) qalun = read('qalun-kfqc');
  if (five) { duri = read('duri-abu-amr-kfqc'); shubah = read('shubah-kfqc'); }
});

describe.skipIf(!both)('the two King Fahd Complex editions', () => {
  it('are each numbered in their own scheme', () => {
    expect(hafs.totalAyahs).toBe(6236);
    expect(warsh.totalAyahs).toBe(6214);
  });

  /**
   * `pageAlignmentGroup: 'kfqc-604'` is a claim about the plates. This is the
   * check on it — without it the whole conversion below rests on nothing.
   */
  it('really are set to the same 604 pages, as the registry claims', () => {
    expect(sharePageLayout(getMushaf('hafs-kfqc')!, getMushaf('warsh-kfqc')!)).toBe(true);
    expect(warsh.pageCount).toBe(hafs.pageCount);
    for (let page = 1; page <= hafs.pageCount; page++) {
      const a = hafs.ayahsOfPage(page);
      const b = warsh.ayahsOfPage(page);
      expect(a.length, `page ${page}`).toBeGreaterThan(0);
      expect(b.length, `page ${page}`).toBeGreaterThan(0);
      // Same words on the page, so the same surahs appear on it.
      expect([...new Set(b.map(r => r.surah))], `page ${page}`)
        .toEqual([...new Set(a.map(r => r.surah))]);
    }
  });
});

/** Hafs to Warsh: numbered differently, set to the same pages. */
const CONVERT = {
  aligned: true, sameCounting: false,
  fromNumbersBasmala: true, toNumbersBasmala: false,
};
/** And back. */
const BACK = { ...CONVERT, fromNumbersBasmala: false, toNumbersBasmala: true };

/**
 * Qalun is the test of whether the pipeline assumes anything.
 *
 * It is a riwaya of Nafi', as Warsh is, which is a reason to check whether the
 * two are numbered alike and never a reason to take it for granted. These
 * assertions are what turn that from a guess into a measurement.
 */
describe.skipIf(!three)('the Qalun plates, measured rather than assumed', () => {
  it('number 6214 verses, as its own index reports', () => {
    expect(qalun.totalAyahs).toBe(6214);
    expect(getMushaf('qalun-kfqc')!.ayahCounting).toBe('madani-first');
  });

  it('agree with Warsh on every surah, and differ from Hafs on fifty', () => {
    let differsFromHafs = 0;
    for (let surah = 1; surah <= 114; surah++) {
      expect(qalun.lastAyahOf(surah), `surah ${surah}`).toBe(warsh.lastAyahOf(surah));
      if (qalun.lastAyahOf(surah) !== hafs.lastAyahOf(surah)) differsFromHafs++;
    }
    expect(differsFromHafs).toBe(50);
  });

  it('are set to the same 604 pages, verse for verse, as the Warsh muṣḥaf', () => {
    expect(qalun.pageCount).toBe(604);
    for (let page = 1; page <= 604; page++) {
      expect(qalun.ayahsOfPage(page), `page ${page}`).toEqual(warsh.ayahsOfPage(page));
    }
  });

  /** Two books in one scheme: nothing to convert, so nothing to be unsure of. */
  it('need no conversion at all to or from Warsh', () => {
    const same = { aligned: true, sameCounting: true, fromNumbersBasmala: false, toNumbersBasmala: false };
    for (const ref of [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 124 }, { surah: 18, ayah: 105 }]) {
      const there = mapAyahBetween(warsh, qalun, ref, same)!;
      expect(there).toMatchObject({ ...ref, exact: true });
      expect(there.page).toBe(warsh.pageOf(ref.surah, ref.ayah));
      expect(mapAyahBetween(qalun, warsh, there, same)).toMatchObject({ ...ref, exact: true });
    }
  });

  it('convert from Hafs exactly as the Warsh muṣḥaf does', () => {
    for (let surah = 1; surah <= 114; surah++) {
      for (let ayah = 1; ayah <= hafs.lastAyahOf(surah)!; ayah++) {
        const toWarsh = mapAyahBetween(hafs, warsh, { surah, ayah }, CONVERT)!;
        const toQalun = mapAyahBetween(hafs, qalun, { surah, ayah }, CONVERT)!;
        expect(toQalun, `${surah}:${ayah}`).toEqual(toWarsh);
      }
    }
  });

  it('lands on the same printed page for every ayah, and says where it cannot pin the verse', () => {
    let inexact = 0;
    for (let surah = 1; surah <= 114; surah++) {
      for (let ayah = 1; ayah <= hafs.lastAyahOf(surah)!; ayah++) {
        const there = mapAyahBetween(hafs, qalun, { surah, ayah }, CONVERT)!;
        expect(there.page, `${surah}:${ayah}`).toBe(hafs.pageOf(surah, ayah));
        if (!there.exact) inexact++;
      }
    }
    // The same 1038 the Warsh conversion cannot pin — they are the same plates.
    expect(inexact).toBe(6236 - 5198);
  });
});

describe.skipIf(!five)('the last two plates, measured like the rest', () => {
  it('gives ad-Duri a table of its own', () => {
    expect(duri.totalAyahs).toBe(6218);
    expect(getMushaf('duri-abu-amr-kfqc')!.ayahCounting).toBe('basri');
    let vsHafs = 0, vsWarsh = 0;
    for (let surah = 1; surah <= 114; surah++) {
      if (duri.lastAyahOf(surah) !== hafs.lastAyahOf(surah)) vsHafs++;
      if (duri.lastAyahOf(surah) !== warsh.lastAyahOf(surah)) vsWarsh++;
    }
    // Neither of the others with a few edits: a third reckoning.
    expect(vsHafs).toBe(44);
    expect(vsWarsh).toBe(11);
  });

  it('finds Shu\u2019bah numbered exactly as Hafs, page for page', () => {
    expect(shubah.totalAyahs).toBe(6236);
    for (let surah = 1; surah <= 114; surah++) {
      expect(shubah.lastAyahOf(surah), `surah ${surah}`).toBe(hafs.lastAyahOf(surah));
    }
    for (let page = 1; page <= 604; page++) {
      expect(shubah.ayahsOfPage(page), `page ${page}`).toEqual(hafs.ayahsOfPage(page));
    }
  });

  /** Two different books, one numbering: nothing to convert, nothing to doubt. */
  it('carries a position between Hafs and Shu\u2019bah untouched', () => {
    const same = { aligned: true, sameCounting: true, fromNumbersBasmala: true, toNumbersBasmala: true };
    for (const ref of [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }, { surah: 18, ayah: 110 }]) {
      expect(mapAyahBetween(hafs, shubah, ref, same)).toMatchObject({ ...ref, exact: true });
      expect(mapAyahBetween(shubah, hafs, ref, same)).toMatchObject({ ...ref, exact: true });
    }
  });

  it('converts Hafs to ad-Duri on its own table, page by page', () => {
    let inexact = 0;
    for (let surah = 1; surah <= 114; surah++) {
      for (let ayah = 1; ayah <= hafs.lastAyahOf(surah)!; ayah++) {
        const there = mapAyahBetween(hafs, duri, { surah, ayah }, CONVERT)!;
        // The page is exact everywhere; the verse is marked where the two
        // books divide one differently.
        expect(there.page, `${surah}:${ayah}`).toBe(hafs.pageOf(surah, ayah));
        expect(there.surah, `${surah}:${ayah}`).toBe(surah);
        if (!there.exact) inexact++;
      }
    }
    expect(inexact).toBeGreaterThan(0);
    expect(inexact).toBeLessThan(6236 / 4);
  });

  it('opens and closes every surah where ad-Duri opens and closes it', () => {
    for (let surah = 1; surah <= 114; surah++) {
      if (surah === 1) continue; // al-Fatiha: the basmala rule, tested above
      expect(mapAyahBetween(hafs, duri, { surah, ayah: 1 }, CONVERT), `${surah}:1`)
        .toMatchObject({ surah, ayah: 1, exact: true });
      const last = hafs.lastAyahOf(surah)!;
      expect(mapAyahBetween(hafs, duri, { surah, ayah: last }, CONVERT), `${surah}:${last}`)
        .toMatchObject({ surah, ayah: duri.lastAyahOf(surah)!, exact: true });
    }
  });
});

describe.skipIf(!both)('carrying a position between editions', () => {
  const map = (ref: { surah: number; ayah: number }) => mapAyahBetween(hafs, warsh, ref, CONVERT)!;

  it('finds the verse, not the number', () => {
    // Each of these is the same words under two numberings.
    expect(map({ surah: 2, ayah: 125 })).toMatchObject({ surah: 2, ayah: 124, page: 19, exact: true });
    expect(map({ surah: 2, ayah: 255 })).toMatchObject({ surah: 2, ayah: 254, page: 42 });
    expect(map({ surah: 5, ayah: 120 })).toMatchObject({ surah: 5, ayah: 122, page: 127, exact: true });
    expect(map({ surah: 18, ayah: 110 })).toMatchObject({ surah: 18, ayah: 105, page: 304, exact: true });
  });

  /**
   * Al-Fatiha is the one place the plates cannot settle: both books print
   * seven verses on page 1, but the Kufan seven begin with the basmala and the
   * Madinan seven do not. Only the counting schemes know, so only they can say.
   */
  it('does not read al-Fatiha off the page, where the page would mislead', () => {
    // What a teacher recites as al-Fatiha 2 is printed 1 in the Warsh muṣḥaf.
    expect(map({ surah: 1, ayah: 2 })).toMatchObject({ surah: 1, ayah: 1, page: 1, exact: true });
    expect(map({ surah: 1, ayah: 6 })).toMatchObject({ surah: 1, ayah: 5, exact: true });
    // The basmala is not one of Warsh's seven, and the Kufan last verse is two
    // of them. Neither has an answer, so neither claims one.
    expect(map({ surah: 1, ayah: 1 })).toMatchObject({ surah: 1, ayah: 1, exact: false });
    expect(map({ surah: 1, ayah: 7 })).toMatchObject({ surah: 1, ayah: 6, exact: false });
    // Back the other way it is a clean shift: every Warsh verse lies inside
    // the Kufan verse one number later.
    expect(mapAyahBetween(warsh, hafs, { surah: 1, ayah: 1 }, BACK))
      .toMatchObject({ surah: 1, ayah: 2, page: 1, exact: true });
  });

  it('keeps a surah opening and closing where it belongs', () => {
    // Al-Fatiha excepted, above: its two books do not open on the same words.
    for (let surah = 2; surah <= 114; surah++) {
      const opens = map({ surah, ayah: 1 });
      expect(opens, `${surah}:1`).toMatchObject({ surah, ayah: 1, exact: true });
      const last = hafs.lastAyahOf(surah)!;
      expect(map({ surah, ayah: last }), `${surah}:${last}`)
        .toMatchObject({ surah, ayah: warsh.lastAyahOf(surah)!, exact: true });
    }
  });

  it('never lands in another surah', () => {
    for (let surah = 1; surah <= 114; surah++) {
      for (let ayah = 1; ayah <= hafs.lastAyahOf(surah)!; ayah++) {
        expect(map({ surah, ayah }).surah, `${surah}:${ayah}`).toBe(surah);
      }
    }
  });

  /**
   * The page is the part that is never approximate: the two books are set to
   * the same boundaries, so every position lands on the page it was already
   * on — asked of Warsh's own index, not carried over from Hafs's.
   */
  it('lands on the same printed page for every ayah in the book', () => {
    for (let surah = 1; surah <= 114; surah++) {
      for (let ayah = 1; ayah <= hafs.lastAyahOf(surah)!; ayah++) {
        const here = hafs.pageOf(surah, ayah)!;
        expect(map({ surah, ayah }).page, `${surah}:${ayah}`).toBe(here);
      }
    }
  });

  it('comes back to where it started wherever it claims to be exact', () => {
    let exact = 0;
    for (let surah = 1; surah <= 114; surah++) {
      for (let ayah = 1; ayah <= hafs.lastAyahOf(surah)!; ayah++) {
        const there = map({ surah, ayah });
        if (!there.exact) continue;
        exact++;
        const back = mapAyahBetween(warsh, hafs, there, BACK)!;
        expect({ surah: back.surah, ayah: back.ayah }, `${surah}:${ayah}`).toEqual({ surah, ayah });
      }
    }
    // Most of the book; the rest sits on a page the two divide differently.
    expect(exact).toBeGreaterThan(5000);
  });

  it('admits the pages where the two books divide a verse differently', () => {
    // Al-Baqarah 253-256 is four verses in Hafs and five in Warsh on page 42,
    // so a position there is right to the page and no finer.
    expect(map({ surah: 2, ayah: 255 }).exact).toBe(false);
  });

  it('refuses to invent a conversion when the books share no layout', () => {
    // Nothing anchors the two numberings, so the number is carried across as
    // it stands and admits it may name another verse — never quietly adjusted.
    const opts = { aligned: false, sameCounting: false };
    expect(mapAyahBetween(hafs, warsh, { surah: 18, ayah: 50 }, opts))
      .toMatchObject({ surah: 18, ayah: 50, exact: false });
    // Hafs's al-Kahf runs to 110, Warsh's to 105: a number Warsh does not have
    // is clamped to the surah's end rather than pointing at nothing.
    expect(mapAyahBetween(hafs, warsh, { surah: 18, ayah: 110 }, opts))
      .toMatchObject({ surah: 18, ayah: 105, exact: false });
  });

  it('leaves the number alone between books that count alike', () => {
    const opts = { aligned: true, sameCounting: true };
    expect(mapAyahBetween(hafs, hafs, { surah: 18, ayah: 110 }, opts))
      .toMatchObject({ surah: 18, ayah: 110, page: 304, exact: true });
  });
});

describe.skipIf(!both)('the text layer as the book to convert against', () => {
  let index: QuranIndex;
  beforeAll(() => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8')) as QuranVerse[];
    index = buildQuranIndex(raw);
  });

  it('paginates exactly as the Hafs plates do', () => {
    const text = pagedAyahsFromQuranIndex(index);
    for (let page = 1; page <= 604; page++) {
      expect(text.ayahsOfPage(page), `page ${page}`).toEqual(hafs.ayahsOfPage(page));
    }
    expect(text.pageOf(4, 171)).toBe(105);
    expect(text.lastAyahOf(18)).toBe(110);
  });

  it('carries the session position into Warsh unchanged in meaning', () => {
    const text = pagedAyahsFromQuranIndex(index);
    const there = mapAyahBetween(text, warsh, { surah: 2, ayah: 125 }, CONVERT)!;
    expect(there).toMatchObject({ surah: 2, ayah: 124, page: 19 });
    const back = mapAyahBetween(warsh, text, there, BACK)!;
    expect(back).toMatchObject({ surah: 2, ayah: 125, page: 19 });
  });
});
