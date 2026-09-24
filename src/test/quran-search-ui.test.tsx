import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import QuranSearchBox from '@/components/board/QuranSearchBox';

/**
 * The screen, and the one thing it exists to do: take the reciter to the verse.
 *
 * A search that only names the verse leaves them to find it by hand, which is
 * the fussing this whole tool exists to remove.
 */

const rows = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as {
  id: number; sura_no: number; aya_no: number; aya_text_emlaey: string;
}[];

const index = {
  verses: rows.map(r => ({ id: r.id, aya_text_emlaey: r.aya_text_emlaey })),
  locOf: (id: number) => {
    const row = rows[id - 1];
    return row ? { surah: row.sura_no, ayah: row.aya_no } : undefined;
  },
} as never;

const mount = (onGo = vi.fn(), onClose = vi.fn()) => ({
  onGo,
  onClose,
  ...render(
    <I18nProvider forceLang="ar">
      <QuranSearchBox index={index} onGo={onGo} onClose={onClose} />
    </I18nProvider>,
  ),
});

const type = (container: HTMLElement, text: string) =>
  fireEvent.change(container.querySelector('[data-search-input]')!, { target: { value: text } });

afterEach(cleanup);

describe('before anything is typed', () => {
  it('says what to type rather than showing an empty void', () => {
    const { container } = mount();
    expect(container.querySelector('[data-search-idle]')).toBeTruthy();
    expect(container.querySelector('[data-search-hit]')).toBeNull();
  });
});

describe('searching', () => {
  it('finds the verse and names its place', async () => {
    const { container } = mount();
    type(container, 'رب العالمين');
    await waitFor(() => expect(container.querySelector('[data-search-hit]')).toBeTruthy());
    expect(container.textContent).toContain('الفاتحة');
  });

  /** The whole point of the screen. */
  it('takes the reciter to the verse when a result is pressed', async () => {
    const { container, onGo } = mount();
    type(container, 'الحمد لله رب العالمين');
    await waitFor(() => expect(container.querySelector('[data-search-hit]')).toBeTruthy());

    fireEvent.click(container.querySelector('[data-search-hit]')!);
    // al-Fātiḥa 2 is anchor 2 in the canonical numbering.
    expect(onGo).toHaveBeenCalledWith(2);
  });

  it('marks the phrase inside the verse it found', async () => {
    const { container } = mount();
    type(container, 'رب العالمين');
    await waitFor(() => expect(container.querySelector('mark')).toBeTruthy());
    expect(container.querySelector('mark')!.textContent).toBe('رب العالمين');
  });

  it('finds a verse typed without its hamza', async () => {
    const { container } = mount();
    type(container, 'اياك نعبد');
    await waitFor(() => expect(container.querySelector('[data-search-hit]')).toBeTruthy());
    expect(container.querySelector('mark')!.textContent).toBe('إياك نعبد');
  });

  it('says plainly when nothing has that wording', async () => {
    const { container } = mount();
    type(container, 'حاسوب محمول');
    await waitFor(() => expect(container.querySelector('[data-search-empty]')).toBeTruthy());
    expect(container.querySelector('[data-search-hit]')).toBeNull();
  });

  /**
   * A list that silently stops at forty looks like the whole answer, and
   * somebody counting occurrences of a word would be counting a wrong number.
   */
  it('says when it is showing only the first of many', async () => {
    const { container } = mount();
    type(container, 'من');
    await waitFor(() => expect(container.querySelector('[data-search-more]')).toBeTruthy());
  });

  it('shows no such note for a search that fits on the screen', async () => {
    const { container } = mount();
    type(container, 'الحمد لله رب العالمين');
    await waitFor(() => expect(container.querySelector('[data-search-hit]')).toBeTruthy());
    expect(container.querySelector('[data-search-more]')).toBeNull();
  });
});

describe('leaving', () => {
  it('closes without going anywhere', () => {
    const { container, onGo, onClose } = mount();
    fireEvent.click(container.querySelector('[data-search-close]')!);
    expect(onClose).toHaveBeenCalled();
    expect(onGo).not.toHaveBeenCalled();
  });
});
