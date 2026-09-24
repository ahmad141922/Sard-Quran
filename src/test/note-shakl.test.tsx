import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import {
  MAJLIS_SLOTS, NoteButtons, SOLO_SLOTS, reportRows,
} from '@/components/board/recitation-shared';
import { NOTE_WEIGHT } from '@/lib/recitation-session';
import { buildQuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { testBooks } from './session-helpers';

/**
 * The wrong-vowel note, pressed.
 *
 * Adding it meant turning a row built for three into a row of four, and the
 * note row had no render test at all until now - so every assertion here is
 * about the row itself: that the new button is there in a majlis and absent
 * when reciting alone, that it lands at the end so no existing button moved,
 * that the grid actually widens to fit it, and that pressing it records the
 * kind it says it records.
 *
 * Rendered in English so the labels can be checked without typing Arabic; the
 * Arabic label is the same table key and is checked for presence elsewhere.
 */

afterEach(cleanup);

const raw = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as QuranVerse[];
const books = testBooks(buildQuranIndex(raw));

const row = (slots: readonly string[], extra: Record<string, unknown> = {}) => {
  const onNote = vi.fn();
  const view = render(
    <I18nProvider forceLang="en">
      <NoteButtons
        slots={slots as typeof MAJLIS_SLOTS}
        onNote={onNote}
        onLongNote={vi.fn()}
        {...extra}
      />
    </I18nProvider>,
  );
  return { ...view, onNote };
};

const buttonAt = (c: HTMLElement, n: number) =>
  c.querySelector('button[aria-keyshortcuts="' + n + '"]') as HTMLButtonElement | null;

describe('the majlis row', () => {
  it('has four buttons, the fourth being the wrong-vowel note', () => {
    const { container } = row(MAJLIS_SLOTS);
    expect(container.querySelectorAll('button')).toHaveLength(4);
    expect(buttonAt(container, 4)!.getAttribute('aria-label')).toBe('Vowel error');
  });

  /** Appended, so a teacher's thumb still finds the first three where it left them. */
  it('leaves the first three where they were', () => {
    const { container } = row(MAJLIS_SLOTS);
    expect(buttonAt(container, 1)!.getAttribute('aria-label')).toBe('Hesitation');
    expect(buttonAt(container, 3)!.getAttribute('aria-label')).toBe('Tajweed note');
  });

  it('records the kind it says it records', () => {
    const { container, onNote } = row(MAJLIS_SLOTS);
    fireEvent.click(buttonAt(container, 4)!);
    expect(onNote).toHaveBeenCalledWith('shakl');
  });

  it('shows its running count, as the others do', () => {
    const { container } = row(MAJLIS_SLOTS, { counts: { shakl: 2 } });
    expect(buttonAt(container, 4)!.getAttribute('aria-label')).toBe('Vowel error: 2');
  });

  /** A row of four squeezed into three columns would wrap the new button alone. */
  it('lays four buttons out in four columns', () => {
    const { container } = row(MAJLIS_SLOTS);
    expect(container.firstElementChild!.className).toContain('grid-cols-4');
  });
});

describe('reciting alone', () => {
  it('offers no wrong-vowel button - a reciter cannot catch their own', () => {
    const { container } = row(SOLO_SLOTS);
    expect(container.querySelectorAll('button')).toHaveLength(3);
    const labels = [...container.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
    expect(labels).not.toContain('Vowel error');
  });

  it('keeps its three columns', () => {
    const { container } = row(SOLO_SLOTS);
    expect(container.firstElementChild!.className).toContain('grid-cols-3');
  });
});

describe('the report', () => {
  it('lists the wrong-vowel notes of a majlis as their own row', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: 1 });
    const withOne = { ...s, notes: [...s.notes, books.note('shakl', 5)] };
    const shakl = reportRows(withOne).find(r => r.slot === 'shakl');
    expect(shakl).toBeTruthy();
    expect(shakl!.count).toBe(1);
  });

  it('has no such row for a session recited alone', () => {
    const s = { ...books.session({ goalKind: 'juz1', startAyahId: 1 }), mode: 'solo' as const };
    expect(reportRows(s).some(r => r.slot === 'shakl')).toBe(false);
  });
});

describe('how much it counts for', () => {
  /**
   * Above a tajweed slip - a misread vowel can change what a word means - and
   * still below a memory slip, the heaviest thing a majlis records. The
   * teacher's decision, pinned because a weight here reorders every review plan.
   */
  it('weighs more than a tajweed note, and less than a memory slip', () => {
    expect(NOTE_WEIGHT.shakl).toBeGreaterThan(NOTE_WEIGHT.tajweed);
    expect(NOTE_WEIGHT.shakl).toBeLessThan(NOTE_WEIGHT.memory);
  });
});
