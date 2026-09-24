import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import SimilarAyahs from '@/components/board/SimilarAyahs';
import { indexFromFile, type SimilarAyah } from '@/lib/mutashabihat';

afterEach(cleanup);

const SHIPPED = resolve(process.cwd(), 'sard/public/mutashabihat.json');
const shipped = existsSync(SHIPPED)
  ? JSON.parse(readFileSync(SHIPPED, 'utf8'))
  : null;

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

const match = (over: Partial<SimilarAyah> = {}): SimilarAyah => ({
  ref: '18:24', surah: 18, ayah: 24, type: 'one_word_change', similarity: 92, weak: false, ...over,
});

describe('the index', () => {
  const fixture = indexFromFile({
    meta: { attribution: [{ name: 'X', url: 'https://x.test' }] },
    byAyah: {
      '2:2': [{ r: '3:7', t: 'one_word_change', s: 92 }, { r: '8:2', t: 'phrase_overlap', s: 70, w: 1 }],
    },
  });

  it('finds the twins of a verse, strongest first', () => {
    const found = fixture.similarTo(2, 2);
    expect(found).toHaveLength(2);
    expect(found[0].ref).toBe('3:7');
    expect(found[0].weak).toBe(false);
    expect(found[1].weak).toBe(true);
  });

  it('reads a verse with none as an empty list, not undefined', () => {
    expect(fixture.similarTo(114, 1)).toEqual([]);
  });

  it('carries the attribution the licence requires', () => {
    expect(fixture.attribution[0].url).toBe('https://x.test');
  });
});

/**
 * The shipped file, held to the bar the whole feature depends on.
 *
 * The upstream dataset classifies 95% of its pairs by a machine measure whose
 * median similarity is 0.30 — verses sharing a common word. Telling a student
 * «you may be confusing 2:15 with 2:174» teaches them to stop reading the
 * cards, and a feature nobody reads is worse than one that is not there.
 */
describe('what actually ships', () => {
  it('exists and is small enough to fetch on a phone', () => {
    expect(shipped).not.toBeNull();
    expect(readFileSync(SHIPPED).length).toBeLessThan(200 * 1024);
  });

  it('names every upstream source, with links', () => {
    for (const a of shipped.meta.attribution) {
      expect(a.name).toBeTruthy();
      expect(a.url).toMatch(/^https?:\/\//);
    }
    expect(shipped.meta.attribution.map((a: { name: string }) => a.name))
      .toContain('Quranic Arabic Corpus');
  });

  it('admits no weak match below the declared bar', () => {
    const floor = shipped.meta.looseMinSimilarity * 100;
    for (const list of Object.values(shipped.byAyah) as { s: number; w?: 1 }[][]) {
      for (const m of list) if (m.w === 1) expect(m.s).toBeGreaterThanOrEqual(floor);
    }
  });

  it('never points a verse at itself', () => {
    for (const [key, list] of Object.entries(shipped.byAyah) as [string, { r: string }[]][]) {
      for (const m of list) expect(m.r).not.toBe(key);
    }
  });

  /** A pair is a resemblance both ways: the student may stumble at either end. */
  it('records both directions of every pair', () => {
    const byAyah = shipped.byAyah as Record<string, { r: string }[]>;
    for (const [key, list] of Object.entries(byAyah)) {
      for (const m of list) {
        expect(byAyah[m.r], `${m.r} should point back at ${key}`).toBeDefined();
        expect(byAyah[m.r].some(back => back.r === key)).toBe(true);
      }
    }
  });
});

describe('the card', () => {
  it('names the verse it might be confused with', () => {
    const { container } = wrap(<SimilarAyahs matches={[match()]} />);
    expect(container.querySelector('[data-similar-ref="18:24"]')).toBeTruthy();
    expect(container.textContent).toContain('قد يختلط عليك مع');
  });

  it('draws nothing when there is nothing to say', () => {
    const { container } = wrap(<SimilarAyahs matches={[]} />);
    expect(container.querySelector('[data-similar]')).toBeNull();
  });

  /**
   * The distinction the feature's credibility rests on: a possibility offered
   * as a certainty is exactly the failure this is arranged to avoid.
   */
  it('marks a weaker match as a possibility, and states a strong one plainly', () => {
    const strong = wrap(<SimilarAyahs matches={[match()]} />);
    expect(strong.container.querySelector('[data-weak]')).toBeNull();
    cleanup();

    const weak = wrap(<SimilarAyahs matches={[match({ weak: true })]} />);
    expect(weak.container.querySelector('[data-weak]')).toBeTruthy();
    expect(weak.container.textContent).toContain('احتمال أضعف');
  });

  /**
   * The credit is no longer under every card — it lives once on the About
   * page, which is what the licence actually asks for. The card must stay
   * clean, and the source file must still carry the links, so the two halves
   * of that arrangement are asserted separately.
   */
  it('carries no credit line of its own', () => {
    const { container } = wrap(<SimilarAyahs matches={[match()]} />);
    expect(container.querySelector('[data-attribution]')).toBeNull();
  });

  it('but the About page still names every source, with links', () => {
    const about = readFileSync(resolve(process.cwd(), 'sard/src/AboutPage.tsx'), 'utf8');
    expect(about).toContain('Quranic Arabic Corpus');
    expect(about).toContain('https://corpus.quran.com');
    expect(about).toContain('Quranpedia');
    expect(about).toContain('Quran_Mutashabihat_Data');
  });

  it('stops naming twins after the limit', () => {
    const many = [match({ ref: '1:1' }), match({ ref: '2:2' }), match({ ref: '3:3' }), match({ ref: '4:4' })];
    const { container } = wrap(<SimilarAyahs matches={many} limit={2} />);
    expect(container.querySelectorAll('[data-similar-ref]')).toHaveLength(2);
  });
});
