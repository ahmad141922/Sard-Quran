import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  AYAH_COUNTING, MUSHAF_REGISTRY, availableRiwayat, defaultMushaf, editionsOfRiwaya, getMushaf,
  manifestUrl, offeredEditionsOfRiwaya, pageAssetUrl, pageIndexUrl,
} from '@/lib/mushaf/registry';
import { sanitizeMushafSvg } from '@/lib/mushaf/sanitize-svg';

const pkgDir = (id: string) => resolve(process.cwd(), 'sard/public/mushafs', id);
const isInstalled = (id: string) => existsSync(join(pkgDir(id), 'manifest.json'));
const PKG = pkgDir('hafs-kfqc');
const installed = isInstalled('hafs-kfqc');
const warshInstalled = isInstalled('warsh-kfqc');
const qalunInstalled = isInstalled('qalun-kfqc');
/** Every edition the registry claims, with the total its scheme declares. */
const EXPECTED = [
  { id: 'hafs-kfqc', counting: 'kufi', total: 6236, riwaya: 'hafs', pages: 604, plates: true },
  { id: 'warsh-kfqc', counting: 'madani-first', total: 6214, riwaya: 'warsh', pages: 604, plates: true },
  { id: 'qalun-kfqc', counting: 'madani-first', total: 6214, riwaya: 'qalun', pages: 604, plates: true },
  { id: 'duri-abu-amr-kfqc', counting: 'basri', total: 6218, riwaya: 'duri-abu-amr', pages: 604, plates: true },
  { id: 'shubah-kfqc', counting: 'kufi', total: 6236, riwaya: 'shubah', pages: 604, plates: true },
  // Pagination only — no licensed plates yet. It is a real edition all the
  // same, and the suite must hold it to everything except having images.
  { id: 'hafs-shamarly', counting: 'kufi', total: 6236, riwaya: 'hafs', pages: 521, plates: false },
] as const;
const allInstalled = EXPECTED.every(e => isInstalled(e.id));

describe('mushaf registry', () => {
  it('keeps riwaya and edition as separate fields', () => {
    // Hafs will have both the Madinah print and ash-Shamarly; a registry keyed
    // on riwaya alone could not hold them both.
    for (const m of MUSHAF_REGISTRY) {
      expect(m.riwayaId, m.id).toBeTruthy();
      expect(m.editionId, m.id).toBeTruthy();
      expect(m.id).toBe(`${m.riwayaId}-${m.editionId}`);
    }
  });

  it('has exactly one default and unique ids', () => {
    expect(MUSHAF_REGISTRY.filter(m => m.isDefault)).toHaveLength(1);
    expect(new Set(MUSHAF_REGISTRY.map(m => m.id)).size).toBe(MUSHAF_REGISTRY.length);
    expect(defaultMushaf().id).toBe('hafs-kfqc');
  });

  it('never hard-codes a page count of 604 across editions', () => {
    for (const m of MUSHAF_REGISTRY) {
      expect(m.pageCount, m.id).toBeGreaterThan(0);
      expect(Number.isInteger(m.firstPageNumber), m.id).toBe(true);
    }
  });

  it('can list the editions of a riwaya', () => {
    // The reason the registry has two fields rather than one: Hafs is
    // published as the Madinah muṣḥaf *and* as ash-Shamarly, and a list keyed
    // on riwaya alone could hold only one of them.
    expect(editionsOfRiwaya('hafs').map(m => m.id)).toEqual(['hafs-kfqc', 'hafs-shamarly']);
    expect(editionsOfRiwaya('warsh').map(m => m.id)).toEqual(['warsh-kfqc']);
    expect(editionsOfRiwaya('qalun').map(m => m.id)).toEqual(['qalun-kfqc']);
    expect(new Set(MUSHAF_REGISTRY.map(m => m.riwayaId)).size).toBeGreaterThan(1);
    expect(new Set(MUSHAF_REGISTRY.map(m => m.editionId))).toEqual(new Set(['kfqc', 'shamarly']));
  });

  it('holds an edition it does not offer, and offers none without plates', () => {
    // Held and offered are different questions. ash-Shamarly's pagination is
    // sound and its package is still validated, but no licensed plates exist —
    // so it stays in the registry, out of the picker, and reachable by any old
    // session that names it.
    expect(getMushaf('hafs-shamarly')!.offered).toBe(false);
    expect(offeredEditionsOfRiwaya('hafs').map(m => m.id)).toEqual(['hafs-kfqc']);
    expect(availableRiwayat()).toContain('hafs');
    // Today's policy, checked rather than assumed: nothing on offer would fall
    // back to the text layer.
    for (const riwaya of availableRiwayat()) {
      const offered = offeredEditionsOfRiwaya(riwaya);
      expect(offered.length, riwaya).toBeGreaterThan(0);
      for (const m of offered) expect(m.pageFormat, m.id).not.toBe('none');
    }
  });

  it('says which verse numbering every edition is printed with', () => {
    // A page index means nothing without the scheme its numbers belong to.
    for (const m of MUSHAF_REGISTRY) {
      expect(AYAH_COUNTING[m.ayahCounting], m.id).toBeTruthy();
    }
    expect(getMushaf('hafs-kfqc')!.ayahCounting).toBe('kufi');
    expect(getMushaf('warsh-kfqc')!.ayahCounting).toBe('madani-first');
    expect(getMushaf('qalun-kfqc')!.ayahCounting).toBe('madani-first');
    expect(getMushaf('duri-abu-amr-kfqc')!.ayahCounting).toBe('basri');
    expect(getMushaf('shubah-kfqc')!.ayahCounting).toBe('kufi');
  });

  it('registers every imported edition, riwaya by riwaya', () => {
    expect(MUSHAF_REGISTRY.map(m => m.id)).toEqual(EXPECTED.map(e => e.id));
    for (const e of EXPECTED) {
      expect(getMushaf(e.id)!.riwayaId, e.id).toBe(e.riwaya);
      expect(editionsOfRiwaya(e.riwaya as never).map(m => m.id), e.id).toContain(e.id);
    }
  });

  it('says which editions are set to a shared page layout, and which is not', () => {
    // Every King Fahd Complex print shares one 604-page layout; ash-Shamarly
    // is its own book and must belong to no group, or a conversion would
    // assume its page 106 is theirs.
    for (const m of MUSHAF_REGISTRY) {
      if (m.editionId === 'kfqc') expect(m.pageAlignmentGroup, m.id).toBe('kfqc-604');
      else expect(m.pageAlignmentGroup, m.id).toBeUndefined();
    }
  });

  it('names page assets by their printed number', () => {
    expect(pageAssetUrl(getMushaf('hafs-kfqc')!, 105)).toBe('/mushafs/hafs-kfqc/pages/105.svg');
    expect(pageAssetUrl(getMushaf('hafs-kfqc')!, 7)).toBe('/mushafs/hafs-kfqc/pages/007.svg');
    expect(pageAssetUrl(getMushaf('warsh-kfqc')!, 105)).toBe('/mushafs/warsh-kfqc/pages/105.svg');
  });

  /**
   * Moving the plates off this origin must be a change of configuration and
   * nothing else, so every asset path is built from `assetBaseUrl` alone.
   */
  it('hangs every asset off assetBaseUrl, wherever that points', () => {
    const elsewhere = { ...getMushaf('warsh-kfqc')!, assetBaseUrl: 'https://cdn.example/w/v1' };
    expect(pageAssetUrl(elsewhere, 42)).toBe('https://cdn.example/w/v1/pages/042.svg');
    expect(manifestUrl(elsewhere)).toBe('https://cdn.example/w/v1/manifest.json');
    expect(pageIndexUrl(elsewhere)).toBe('https://cdn.example/w/v1/page-index.json');
  });
});

describe('the hafs-kfqc package', () => {
  const manifest = installed
    ? JSON.parse(readFileSync(join(PKG, 'manifest.json'), 'utf8')) as { pages: number[]; pageCount: number }
    : null;

  it.skipIf(!installed)('covers all 604 pages', () => {
    expect(manifest!.pageCount).toBe(604);
    expect(manifest!.pages).toHaveLength(604);
    expect(manifest!.pages[0]).toBe(1);
    expect(manifest!.pages[603]).toBe(604);
  });

  it.skipIf(!installed)('records its provenance', () => {
    const prov = readFileSync(join(PKG, 'PROVENANCE.md'), 'utf8');
    expect(prov).toMatch(/King Fahd/i);
    expect(prov).toMatch(/quranpedia\/quran-svg/);
    // A commercial product must say why an excluded edition was excluded.
    expect(prov).toMatch(/libya-awqaf/);
  });

  /** Page 105 is the page the viewer was first proven on. */
  it.skipIf(!installed)('still serves page 105 with an-Nisa 171-175', () => {
    const svg = readFileSync(join(PKG, 'pages', '105.svg'), 'utf8');
    const polys = [...svg.matchAll(/<path[^>]*class="ayahPolygon"[^>]*>/g)].map(m => ({
      surah: Number(/surah="(\d+)"/.exec(m[0])![1]),
      ayah: Number(/\bayah="(\d+)"/.exec(m[0])![1]),
    }));
    expect(polys).toEqual([171, 172, 173, 174, 175].map(ayah => ({ surah: 4, ayah })));
  });

  it.skipIf(!installed)('carries a viewBox on every sampled page, and no scripts', () => {
    for (const page of ['001', '002', '105', '604']) {
      const svg = readFileSync(join(PKG, 'pages', `${page}.svg`), 'utf8');
      expect(svg, page).toMatch(/viewBox="[^"]+"/);
      expect(svg.includes('<script'), page).toBe(false);
    }
  });
});

describe.skipIf(!warshInstalled)('the warsh-kfqc package', () => {
  const dir = pkgDir('warsh-kfqc');
  const manifest = warshInstalled
    ? JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as
        { pages: number[]; pageCount: number; ayahCounting: string }
    : null;
  const pageIndex = warshInstalled
    ? JSON.parse(readFileSync(join(dir, 'page-index.json'), 'utf8')) as
        { pageCount: number; totalAyahs: number; pages: [number, number, number][][] }
    : null;

  it('covers all 604 pages', () => {
    expect(manifest!.pageCount).toBe(604);
    expect(manifest!.pages).toHaveLength(604);
    expect(manifest!.pages[603]).toBe(604);
  });

  /**
   * The plates and the app must agree on the numbering. If the importer ever
   * fetched another riwaya into this folder, the totals would part company
   * here rather than in front of a teacher.
   */
  it('is numbered as the registry says it is', () => {
    const def = getMushaf('warsh-kfqc')!;
    expect(manifest!.ayahCounting).toBe(def.ayahCounting);
    expect(pageIndex!.totalAyahs).toBe(AYAH_COUNTING[def.ayahCounting].totalAyahs);
    expect(pageIndex!.totalAyahs).toBe(6214);
    expect(pageIndex!.pageCount).toBe(def.pageCount);
  });

  it('records its provenance, its numbering and that nothing was derived', () => {
    const prov = readFileSync(join(dir, 'PROVENANCE.md'), 'utf8');
    expect(prov).toMatch(/King Fahd/i);
    expect(prov).toMatch(/quranpedia\/quran-svg/);
    expect(prov).toMatch(/6214/);
    expect(prov).toMatch(/Not derived from Hafs/i);
  });

  it('opens al-Fatiha on page 1 and closes an-Nas on page 604', () => {
    expect(pageIndex!.pages[0][0]).toEqual([1, 1, 7]);
    const last = pageIndex!.pages[603];
    expect(last[last.length - 1][0]).toBe(114);
  });

  it('carries a viewBox on every sampled page, and no scripts', () => {
    for (const page of ['001', '105', '604']) {
      const svg = readFileSync(join(dir, 'pages', `${page}.svg`), 'utf8');
      expect(svg, page).toMatch(/viewBox="[^"]+"/);
      expect(svg.includes('<script'), page).toBe(false);
    }
  });
});

describe.skipIf(!qalunInstalled)('the qalun-kfqc package', () => {
  const dir = pkgDir('qalun-kfqc');
  const manifest = qalunInstalled
    ? JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as
        { pages: number[]; pageCount: number; ayahCounting: string }
    : null;
  const pageIndex = qalunInstalled
    ? JSON.parse(readFileSync(join(dir, 'page-index.json'), 'utf8')) as
        { pageCount: number; totalAyahs: number; pages: [number, number, number][][] }
    : null;

  it('covers all 604 pages', () => {
    expect(manifest!.pageCount).toBe(604);
    expect(manifest!.pages).toHaveLength(604);
    expect(manifest!.pages[603]).toBe(604);
  });

  it('is numbered as the registry says it is', () => {
    const def = getMushaf('qalun-kfqc')!;
    expect(manifest!.ayahCounting).toBe(def.ayahCounting);
    expect(pageIndex!.totalAyahs).toBe(AYAH_COUNTING[def.ayahCounting].totalAyahs);
    expect(pageIndex!.totalAyahs).toBe(6214);
    expect(pageIndex!.pageCount).toBe(def.pageCount);
  });

  it('records that its numbering was derived from its own plates', () => {
    const prov = readFileSync(join(dir, 'PROVENANCE.md'), 'utf8');
    expect(prov).toMatch(/King Fahd/i);
    expect(prov).toMatch(/quranpedia\/quran-svg/);
    expect(prov).toMatch(/6214/);
    expect(prov).toMatch(/derived, not inherited/i);
    expect(prov).toMatch(/Not derived from another riwaya/i);
  });

  it('carries a viewBox on every sampled page, and no scripts', () => {
    for (const page of ['001', '105', '604']) {
      const svg = readFileSync(join(dir, 'pages', `${page}.svg`), 'utf8');
      expect(svg, page).toMatch(/viewBox="[^"]+"/);
      expect(svg.includes('<script'), page).toBe(false);
    }
  });
});

/**
 * Every package, checked the same way — the point of a pipeline is that the
 * fifth edition costs no more than the second.
 */
describe.skipIf(!allInstalled)('every imported package', () => {
  for (const e of EXPECTED) {
    describe(e.id, () => {
      const dir = pkgDir(e.id);
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as
        { pages: number[]; pageCount: number; ayahCounting: string };
      const pageIndex = JSON.parse(readFileSync(join(dir, 'page-index.json'), 'utf8')) as
        { pageCount: number; totalAyahs: number; pages: [number, number, number][][] };

      it('covers the pages it claims', () => {
        expect(manifest.pageCount).toBe(e.pages);
        expect(pageIndex.pageCount).toBe(e.pages);
        if (e.plates) {
          expect(manifest.pages).toHaveLength(e.pages);
          expect(manifest.pages[e.pages - 1]).toBe(e.pages);
        } else {
          // No images to list, and the manifest says so rather than pretending.
          expect(manifest.pages).toHaveLength(0);
          expect(getMushaf(e.id)!.pageFormat).toBe('none');
        }
      });

      it('is numbered as the registry says it is', () => {
        const def = getMushaf(e.id)!;
        expect(manifest.ayahCounting).toBe(e.counting);
        expect(def.ayahCounting).toBe(e.counting);
        expect(pageIndex.totalAyahs).toBe(e.total);
        expect(AYAH_COUNTING[def.ayahCounting].totalAyahs).toBe(e.total);
      });

      it('records its provenance', () => {
        const prov = readFileSync(join(dir, 'PROVENANCE.md'), 'utf8');
        expect(prov).toMatch(String(e.total));
        if (e.plates) {
          expect(prov).toMatch(/King Fahd/i);
          expect(prov).toMatch(/quranpedia\/quran-svg/);
        } else {
          // A package with no images has to say so, and say what is missing.
          expect(prov).toMatch(/pagination only/i);
          expect(prov).toMatch(/QuranFlash/);
        }
      });

      it.skipIf(!e.plates)('carries a viewBox on every sampled page, and no scripts', () => {
        for (const page of ['001', '105', '604']) {
          const svg = readFileSync(join(dir, 'pages', `${page}.svg`), 'utf8');
          expect(svg, page).toMatch(/viewBox="[^"]+"/);
          expect(svg.includes('<script'), page).toBe(false);
        }
      });
    });
  }
});

describe('svg sanitiser', () => {
  const wrap = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100" height="200">${inner}</svg>`;

  it('drops scripts, handlers and outbound references', () => {
    const svg = sanitizeMushafSvg(wrap(
      '<script>alert(1)</script>' +
      '<path class="ayahPolygon" surah="1" ayah="1" onclick="steal()" d="M0 0"/>' +
      '<a href="https://elsewhere.example"><path d="M1 1"/></a>',
    ))!;
    expect(svg).not.toBeNull();
    expect(svg.querySelector('script')).toBeNull();
    expect(svg.querySelector('[onclick]')).toBeNull();
    expect(svg.querySelector('a')?.getAttribute('href')).toBeNull();
  });

  it('keeps the ayah layer and internal references intact', () => {
    const svg = sanitizeMushafSvg(wrap('<path class="ayahPolygon" surah="2" ayah="255" d="M0 0"/><use href="#g"/>'))!;
    expect(svg.querySelectorAll('.ayahPolygon')).toHaveLength(1);
    expect(svg.querySelector('use')?.getAttribute('href')).toBe('#g');
  });

  it('strips fixed dimensions so the viewBox governs scaling', () => {
    const svg = sanitizeMushafSvg(wrap('<path d="M0 0"/>'))!;
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 10 10');
  });

  it('refuses malformed input rather than injecting it', () => {
    expect(sanitizeMushafSvg('<svg><unclosed>')).toBeNull();
    expect(sanitizeMushafSvg('<html><body>no</body></html>')).toBeNull();
  });
});
