import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import MatnIndexSheet from '@/components/board/MatnIndexSheet';
import { matnFromFile } from '@/lib/matn/load';

/**
 * The chapter index, and the one thing it must not do.
 *
 * Picking a chapter moves the marker. It does **not** touch the goal the
 * majlis was started with: the goal is what this sitting set out to recite,
 * and quietly rewriting it because somebody looked something up would make the
 * progress figure a lie.
 */

const jazariyya = matnFromFile(
  JSON.parse(readFileSync('sard/public/matn-jazariyya.json', 'utf8')),
);

const mount = (current = 1, onGo = vi.fn(), onClose = vi.fn()) => ({
  onGo,
  onClose,
  ...render(
    <I18nProvider forceLang="ar">
      <MatnIndexSheet matn={jazariyya} current={current} onGo={onGo} onClose={onClose} />
    </I18nProvider>,
  ),
});

afterEach(cleanup);

describe('the chapters it lists', () => {
  it('lists every one the matn has', () => {
    const { container } = mount();
    expect(container.querySelectorAll('[data-bab-jump]')).toHaveLength(jazariyya.abwab.length);
    expect(jazariyya.abwab).toHaveLength(19);
  });

  it('names them, and says which lines each covers', () => {
    const { container } = mount();
    expect(container.textContent).toContain('باب المَدّ');
    // The numbering is the print's own — the same one a note will name later.
    expect(container.textContent).toContain('69–72');
  });

  it('lists them in the order they are recited', () => {
    const { container } = mount();
    const shown = [...container.querySelectorAll('[data-bab-jump]')]
      .map(el => Number(el.getAttribute('data-bab-jump')));
    expect(shown).toEqual(jazariyya.abwab.map(b => b.n));
  });
});

describe('saying where the reciter is', () => {
  it('marks the chapter holding the current bayt', () => {
    // Bayt 70 sits in bāb al-madd, 69–72.
    const { container } = mount(70);
    const here = container.querySelector('[aria-current="true"]');
    expect(here).toBeTruthy();
    expect(here!.textContent).toContain('باب المَدّ');
  });

  it('marks exactly one, whichever bayt the marker is on', () => {
    for (const bayt of [1, 9, 44, 69, 105, 109]) {
      const { container } = mount(bayt);
      expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
      cleanup();
    }
  });
});

describe('jumping', () => {
  it('goes to the chapter’s first bayt, not to the chapter number', () => {
    const { container, onGo } = mount();
    const madd = jazariyya.abwab.find(b => b.titleAr.includes('المَدّ'))!;
    fireEvent.click(container.querySelector(`[data-bab-jump="${madd.n}"]`)!);
    expect(onGo).toHaveBeenCalledWith(madd.from);
  });

  it('closes without going anywhere', () => {
    const { container, onGo, onClose } = mount();
    fireEvent.click(container.querySelector('[data-index-close]')!);
    expect(onClose).toHaveBeenCalled();
    expect(onGo).not.toHaveBeenCalled();
  });

  /** Every chapter is reachable, including the last. */
  it('can reach the closing chapter as easily as the first', () => {
    const { container, onGo } = mount();
    const last = jazariyya.abwab[jazariyya.abwab.length - 1];
    fireEvent.click(container.querySelector(`[data-bab-jump="${last.n}"]`)!);
    expect(onGo).toHaveBeenCalledWith(last.from);
  });
});
