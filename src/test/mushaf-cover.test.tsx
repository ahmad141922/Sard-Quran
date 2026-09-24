import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import MushafPageViewer from '@/components/board/MushafPageViewer';
import type { MushafDefinition } from '@/lib/mushaf/registry';

/**
 * Covering the muṣḥaf a verse at a time.
 *
 * The old cover was a sheet over the whole page with a press-and-hold peek.
 * This is the matn's rule brought to the muṣḥaf: hide from the marker on,
 * uncover each verse as it is recited, and never show one nobody has reached.
 *
 * It is exact rather than approximate only because the plate carries an
 * **ayah-polygon layer** — the same one that makes a verse tappable. Working
 * from `line_start`/`line_end` instead would have had to hide whole lines, and
 * on page 2 alone line 3 holds the end of one verse and the start of another,
 * so every reveal would have leaked the next verse's opening words.
 */

afterEach(cleanup);

/** A plate with two verses, each in two pieces, as a real page has. */
const plate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon class="ayahPolygon" surah="2" ayah="1" points="0,0 10,0 10,10 0,10" />
  <polygon class="ayahPolygon" surah="2" ayah="1" points="0,10 10,10 10,20 0,20" />
  <polygon class="ayahPolygon" surah="2" ayah="2" points="0,20 10,20 10,30 0,30" />
  <polygon class="ayahPolygon" surah="2" ayah="3" points="0,30 10,30 10,40 0,40" />
</svg>`;

vi.mock('@/lib/mushaf/page-plate', () => ({
  getPlate: async () => {
    const doc = new DOMParser().parseFromString(plate, 'image/svg+xml');
    return doc.documentElement as unknown as SVGElement;
  },
  prefetchPlatesAround: () => {},
}));

const mushaf = { id: 'madinah', nameAr: 'م', nameEn: 'M' } as unknown as MushafDefinition;

const draw = (props: Partial<React.ComponentProps<typeof MushafPageViewer>> = {}) =>
  render(
    <I18nProvider forceLang="ar">
      <MushafPageViewer mushaf={mushaf} page={2} {...props} />
    </I18nProvider>,
  );

const settle = () => new Promise(r => setTimeout(r, 0));

const coveredRefs = (c: HTMLElement) =>
  [...c.querySelectorAll('.ayahPolygon.is-covered')]
    .map(el => `${el.getAttribute('surah')}:${el.getAttribute('ayah')}`);

describe('covering a verse on the page', () => {
  it('covers nothing when nothing was asked to be covered', async () => {
    const { container } = draw();
    await settle();
    expect(container.querySelectorAll('.ayahPolygon')).toHaveLength(4);
    expect(coveredRefs(container)).toEqual([]);
  });

  /** A verse is several polygons — two lines, or a wrap — and all of them hide. */
  it('covers every piece of a verse, not just its first', async () => {
    const { container } = draw({ covered: [{ surah: 2, ayah: 1 }] });
    await settle();
    expect(coveredRefs(container)).toEqual(['2:1', '2:1']);
  });

  it('leaves the verses it was not given alone', async () => {
    const { container } = draw({ covered: [{ surah: 2, ayah: 2 }, { surah: 2, ayah: 3 }] });
    await settle();
    expect(coveredRefs(container)).toEqual(['2:2', '2:3']);
  });

  /**
   * The reveal, as it happens: the verse just recited is dropped from the list
   * and its polygons clear, without the page being fetched again.
   */
  it('uncovers a verse when it is taken off the list', async () => {
    const { container, rerender } = draw({ covered: [{ surah: 2, ayah: 2 }, { surah: 2, ayah: 3 }] });
    await settle();
    expect(coveredRefs(container)).toEqual(['2:2', '2:3']);

    rerender(
      <I18nProvider forceLang="ar">
        <MushafPageViewer mushaf={mushaf} page={2} covered={[{ surah: 2, ayah: 3 }]} />
      </I18nProvider>,
    );
    expect(coveredRefs(container)).toEqual(['2:3']);
  });

  /**
   * The marker can sit on a verse still covered — it does, the moment the
   * cover is switched on — and the cover has to win, or switching it on would
   * show the very verse about to be recited.
   */
  it('keeps a verse covered even while it is the marker’s', async () => {
    const { container } = draw({
      selected: { surah: 2, ayah: 2 },
      covered: [{ surah: 2, ayah: 2 }],
    });
    await settle();
    const el = container.querySelector('.ayahPolygon[surah="2"][ayah="2"]')!;
    expect(el.classList.contains('is-covered')).toBe(true);
  });
});
