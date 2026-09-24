import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import MatnReader from '@/components/board/MatnReader';
import { I18nProvider } from '@/hooks/useI18n';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { matnPosition } from '@/lib/matn/position';
import { MATN_REGISTRY } from '@/lib/matn/registry';

/**
 * Reciting a matn from memory: the lines ahead covered, revealed one at a time.
 *
 * This began as the answer to a sheet laid over the whole page, which the
 * muṣḥaf used to have and no longer does — the muṣḥaf now covers a verse at a
 * time by the same rule, and both are tested for the same two things.
 *
 * **The marker must still move.** A matn moves only by tapping a line, so a
 * sheet over the reader would strand the reciter on the bayt they started at.
 * The cover therefore hides the *words* and leaves the row tappable.
 *
 * **Revealing is the exercise, not a lapse.** Say the line, then look at it. So
 * it is a plain tap, what is already recited stays readable, and the words fade
 * in rather than snapping.
 */

afterEach(cleanup);

function file(): MatnFile {
  return {
    id: 'tuhfa',
    editionAr: 'طبعة الاختبار',
    editionEn: 'Test print',
    totalAbyat: 4,
    abwab: [
      { n: 1, titleAr: 'باب الأول', titleEn: 'First chapter', from: 1, to: 2 },
      { n: 2, titleAr: 'باب الثاني', titleEn: 'Second chapter', from: 3, to: 4 },
    ],
    abyat: Array.from({ length: 4 }, (_, i) => ({
      n: i + 1, sadr: `صدر ${i + 1}`, ajz: `عجز ${i + 1}`, bab: i < 2 ? 1 : 2,
    })),
  };
}

/** The fixture is smaller than the real Tuhfa; let the loader accept it. */
function loaded(): Matn {
  const f = file();
  const def = MATN_REGISTRY[f.id];
  const saved = { abyat: def.totalAbyat, abwab: def.totalAbwab };
  def.totalAbyat = f.totalAbyat;
  def.totalAbwab = f.abwab.length;
  try { return matnFromFile(f); } finally {
    def.totalAbyat = saved.abyat;
    def.totalAbwab = saved.abwab;
  }
}

const mount = (hideFrom: number | null, current = 2, onReveal = vi.fn(), onPick = vi.fn()) => ({
  onReveal,
  onPick,
  ...render(
    <I18nProvider forceLang="ar">
      <MatnReader
        matn={loaded()}
        current={matnPosition('tuhfa', 'طبعة الاختبار', current, 'sadr')}
        onPick={onPick}
        onReveal={onReveal}
        hideFrom={hideFrom}
        followCurrent={false}
      />
    </I18nProvider>,
  ),
});

const row = (c: HTMLElement, n: number) => c.querySelector(`[data-bayt="${n}"]`)!;

describe('with nothing covered', () => {
  it('shows every line, as it always did', () => {
    const { container } = mount(null);
    for (let n = 1; n <= 4; n++) expect(container.textContent).toContain(`صدر ${n}`);
    expect(container.querySelector('[data-covered]')).toBeNull();
  });

  it('offers nothing to reveal', () => {
    const { container } = mount(null);
    expect(container.querySelector('[data-reveal-bayt]')).toBeNull();
  });
});

describe('what the cover hides', () => {
  /**
   * Hidden, not absent.
   *
   * The words stay in the markup with the cover drawn over them, because a line
   * that swapped a short bar for full-height text jumped the page as it was
   * revealed, and because nothing can fade between two things only one of which
   * exists. So what is asserted is that each half is *drawn* covered — the
   * text at zero opacity, the bar at full — not that the text is gone.
   */
  const half = (c: HTMLElement, n: number, which: string) =>
    c.querySelector(`[data-bayt="${n}"] [data-shatr="${which}"]`)!;

  it('draws the marker’s line and everything after it covered', () => {
    const { container } = mount(2);
    for (const [n, which] of [[2, 'sadr'], [3, 'ajz'], [4, 'sadr']] as const) {
      const el = half(container, n, which);
      expect(el.querySelector('span.opacity-0'), `bayt ${n} ${which} text`).toBeTruthy();
      expect(el.querySelector('span.opacity-100'), `bayt ${n} ${which} bar`).toBeTruthy();
    }
  });

  /** What is already recited stays readable — that is how a hand covers a page. */
  it('leaves the lines already recited alone', () => {
    const { container } = mount(2);
    expect(container.textContent).toContain('صدر 1');
    expect(container.textContent).toContain('عجز 1');
  });

  it('marks exactly the covered rows', () => {
    const { container } = mount(3);
    expect(row(container, 1).hasAttribute('data-covered')).toBe(false);
    expect(row(container, 2).hasAttribute('data-covered')).toBe(false);
    expect(row(container, 3).hasAttribute('data-covered')).toBe(true);
    expect(row(container, 4).hasAttribute('data-covered')).toBe(true);
  });

  /**
   * A dash per word, or the text blurred, would leak the thing being tested:
   * a memoriser reads the shape of a line, and knowing a shaṭr has five words
   * is most of remembering it. So both halves cover to the same blank.
   */
  it('gives away neither the shape of the line nor its length', () => {
    const { container } = mount(2);
    const halves = [...row(container, 2).querySelectorAll('[data-shatr]')];
    expect(halves).toHaveLength(2);
    for (const el of halves) {
      // One bar of a fixed width, and the words behind it fully transparent.
      const bar = el.querySelector('span[aria-hidden]')!;
      expect(bar).toBeTruthy();
      expect(bar.className).toContain('opacity-100');
      expect(bar.textContent).toBe('');
      expect(el.querySelector('span.opacity-0')!.textContent).not.toBe('');
    }
  });

  /** Revealed, the two swap over — and both stay, so the swap can be a fade. */
  it('fades the words in rather than snapping them into place', () => {
    const { container } = mount(3);
    const el = half(container, 2, 'sadr');
    expect(el.querySelector('span.opacity-100')!.textContent!.trim()).not.toBe('');
    expect(el.querySelector('span[aria-hidden]')!.className).toContain('opacity-0');
    for (const span of el.querySelectorAll('span')) {
      expect(span.className).toContain('transition-opacity');
    }
  });
});

describe('still being able to get on', () => {
  /**
   * The whole reason the cover is not a sheet over the reader: nothing else in
   * a matn session moves the marker.
   */
  it('lets the marker be moved onto a line nobody can read yet', () => {
    const { container, onPick } = mount(2);
    fireEvent.click(row(container, 4).querySelector('[data-shatr="sadr"]')!);
    expect(onPick).toHaveBeenCalledWith(4, 'sadr');
  });

  it('keeps the line numbers visible, so the place is never lost', () => {
    const { container } = mount(1);
    for (let n = 1; n <= 4; n++) expect(row(container, n).textContent).toContain(String(n));
  });
});

describe('revealing', () => {
  it('is offered on the marker’s line only', () => {
    const { container } = mount(2, 2);
    expect(container.querySelectorAll('[data-reveal-bayt]')).toHaveLength(1);
    expect(row(container, 2).querySelector('[data-reveal-bayt]')).toBeTruthy();
  });

  /** A plain tap: saying the line then looking at it is the exercise. */
  it('takes one tap, not a held one', () => {
    const { container, onReveal } = mount(2, 2);
    fireEvent.click(container.querySelector('[data-reveal-bayt]')!);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('is not offered on a line that is already visible', () => {
    const { container } = mount(3, 2);
    expect(row(container, 2).querySelector('[data-reveal-bayt]')).toBeNull();
  });
});
