import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import MatnReader from '@/components/board/MatnReader';
import { I18nProvider } from '@/hooks/useI18n';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { matnPosition } from '@/lib/matn/position';
import { MATN_REGISTRY } from '@/lib/matn/registry';

/**
 * What this reader has to get right is the pair of rules the design settled:
 * the bayt is the unit and the shaṭr is what a note pins to, and the bāb —
 * not a page — is the boundary you know where you are by.
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

const at = (bayt: number, shatr: 'sadr' | 'ajz' = 'sadr') =>
  matnPosition('tuhfa', 'طبعة الاختبار', bayt, shatr);

const draw = (over: Partial<React.ComponentProps<typeof MatnReader>> = {}) => {
  const onPick = vi.fn();
  const view = render(
    <I18nProvider forceLang="ar">
      <MatnReader matn={loaded()} current={at(1)} onPick={onPick} followCurrent={false} {...over} />
    </I18nProvider>,
  );
  return { ...view, onPick };
};

describe('the matn reader', () => {
  it('shows every line, both halves', () => {
    const { container } = draw();
    expect(container.querySelectorAll('[data-bayt]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-shatr]')).toHaveLength(8);
  });

  it('heads each stretch with its bāb, which is what replaces a page number', () => {
    const { getByText } = draw();
    expect(getByText('باب الأول')).toBeTruthy();
    expect(getByText('باب الثاني')).toBeTruthy();
  });

  it('reports the line and the half that were tapped', () => {
    const { container, onPick } = draw();
    const third = container.querySelector('[data-bayt="3"]')!;
    fireEvent.click(third.querySelector('[data-shatr="ajz"]')!);
    expect(onPick).toHaveBeenCalledWith(3, 'ajz');
  });

  /** The line is highlighted whole; only the pinned half is marked pinned. */
  it('highlights the whole line but pins one half', () => {
    const { container } = draw({ current: at(2, 'ajz') });
    const row = container.querySelector('[data-bayt="2"]')!;
    expect(row.getAttribute('data-current')).toBe('true');
    expect(row.querySelector('[data-shatr="ajz"]')!.getAttribute('data-pinned')).toBe('true');
    expect(row.querySelector('[data-shatr="sadr"]')!.getAttribute('data-pinned')).toBeNull();
  });

  it('pins nothing on the lines around it', () => {
    const { container } = draw({ current: at(2, 'ajz') });
    expect(container.querySelector('[data-bayt="1"]')!.getAttribute('data-current')).toBeNull();
    expect(container.querySelectorAll('[data-pinned]')).toHaveLength(1);
  });

  it('tells a screen reader which half is pinned', () => {
    const { container } = draw({ current: at(4, 'sadr') });
    const row = container.querySelector('[data-bayt="4"]')!;
    expect(row.querySelector('[data-shatr="sadr"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(row.querySelector('[data-shatr="ajz"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * The line number says where you are; it is not a way to record a position.
   * A note here must always know which half it belongs to.
   */
  it('does not make the line number tappable', () => {
    const { container } = draw();
    const row = container.querySelector('[data-bayt="1"]')!;
    expect(row.querySelectorAll('button')).toHaveLength(2);
  });

  it('draws the English titles when the interface is left to right', () => {
    const { getByText, queryByText } = draw({ dir: 'ltr' });
    expect(getByText('First chapter')).toBeTruthy();
    expect(queryByText('باب الأول')).toBeNull();
  });

  /**
   * The label names the place, not the action. A reciter following by ear
   * needs to hear which half they are about to pin.
   */
  it('labels each half by its line and its side', () => {
    const { container } = draw();
    const row = container.querySelector('[data-bayt="3"]')!;
    expect(row.querySelector('[data-shatr="sadr"]')!.getAttribute('aria-label'))
      .toBe('البيت 3 — الصدر');
    expect(row.querySelector('[data-shatr="ajz"]')!.getAttribute('aria-label'))
      .toBe('البيت 3 — العجز');
  });
});
