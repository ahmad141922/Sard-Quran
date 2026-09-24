import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import MatnOverlay from '@/components/board/MatnOverlay';
import MatnSetupModal from '@/components/board/MatnSetupModal';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { MATN_REGISTRY } from '@/lib/matn/registry';
import { createMatnSession, fullMatnGoal, type MatnSession } from '@/lib/matn/session';
import { makeNote } from '@/lib/recitation-session';

afterEach(cleanup);

function fixtureFile(): MatnFile {
  return {
    id: 'tuhfa',
    editionAr: 'طبعة الاختبار',
    editionEn: 'Test print',
    totalAbyat: 4,
    abwab: [
      { n: 1, titleAr: 'باب الأول', titleEn: 'First', from: 1, to: 2 },
      { n: 2, titleAr: 'باب الثاني', titleEn: 'Second', from: 3, to: 4 },
    ],
    abyat: Array.from({ length: 4 }, (_, i) => ({
      n: i + 1, sadr: `صدر ${i + 1}`, ajz: `عجز ${i + 1}`, bab: i < 2 ? 1 : 2,
    })),
  };
}

/**
 * The fixture is smaller than the real Tuhfa, so the registry's counts are
 * relaxed around it. The edition is set from the fixture too, which is what
 * lets the guard below be tested in both directions on demand rather than by
 * whatever the shipped registry happens to say today.
 */
function withRelaxedRegistry<T>(run: (matn: Matn) => T): T {
  const f = fixtureFile();
  const def = MATN_REGISTRY[f.id];
  const saved = { ...def };
  def.totalAbyat = f.totalAbyat;
  def.totalAbwab = f.abwab.length;
  def.editionAr = f.editionAr;
  def.editionEn = f.editionEn;
  try { return run(matnFromFile(f)); } finally { Object.assign(def, saved); }
}

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

describe('the matn setup screen', () => {
  /**
   * The guard that matters most: a matn whose print nobody named is not
   * offered at all. Following a student in an undeclared numbering is the
   * mistake the whole design is arranged around.
   */
  it('offers nothing while no print has been settled', () => {
    const def = MATN_REGISTRY.tuhfa;
    const saved = { ...def };
    const matn = withRelaxedRegistry(m => m);
    // Blanked deliberately rather than relying on what the registry ships:
    // both matns now name a source, and this guard must still be provable.
    def.editionAr = '';
    def.editionEn = '';
    try {
      const { container } = wrap(
        <MatnSetupModal open available={[{ id: 'tuhfa', matn }]} onClose={() => {}} onStart={() => {}} />,
      );
      expect(container.querySelector('[data-none]')).toBeTruthy();
      expect(container.querySelector('[data-matn="tuhfa"]')).toBeNull();
    } finally {
      Object.assign(def, saved);
    }
  });

  it('offers the matn once its print is settled, and names that print', () => {
    withRelaxedRegistry(matn => {
      const { container, getByText } = wrap(
        <MatnSetupModal open available={[{ id: 'tuhfa', matn }]} onClose={() => {}} onStart={() => {}} />,
      );
      expect(container.querySelector('[data-matn="tuhfa"]')).toBeTruthy();
      expect(getByText('طبعة الاختبار')).toBeTruthy();
    });
  });

  it('will not start without a matn and a reciter', () => {
    withRelaxedRegistry(matn => {
      const onStart = vi.fn();
      const { container } = wrap(
        <MatnSetupModal open available={[{ id: 'tuhfa', matn }]} onClose={() => {}} onStart={onStart} />,
      );
      const start = container.querySelector('[data-start]') as HTMLButtonElement;
      expect(start.disabled).toBe(true);

      fireEvent.click(container.querySelector('[data-matn="tuhfa"]')!);
      fireEvent.change(container.querySelector('[data-student]')!, { target: { value: 'محمّد' } });
      // A majlis still needs the listener named.
      expect((container.querySelector('[data-start]') as HTMLButtonElement).disabled).toBe(true);

      fireEvent.change(container.querySelector('[data-instructor]')!, { target: { value: 'الشيخ' } });
      expect((container.querySelector('[data-start]') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  /** Reciting alone there is no second side to name, so the field goes. */
  it('drops the listener field when reciting alone', () => {
    withRelaxedRegistry(matn => {
      const onStart = vi.fn();
      const { container } = wrap(
        <MatnSetupModal open available={[{ id: 'tuhfa', matn }]} onClose={() => {}} onStart={onStart} />,
      );
      fireEvent.click(container.querySelector('[data-choice="solo"]')!);
      expect(container.querySelector('[data-instructor]')).toBeNull();

      fireEvent.click(container.querySelector('[data-matn="tuhfa"]')!);
      fireEvent.change(container.querySelector('[data-student]')!, { target: { value: 'محمّد' } });
      fireEvent.click(container.querySelector('[data-start]')!);

      const started: MatnSession = onStart.mock.calls[0][0];
      expect(started.mode).toBe('solo');
      expect(started.instructorName).toBeUndefined();
      expect(started.textKind).toBe('matn');
    });
  });
});

describe('the matn overlay', () => {
  const draw = (matn: Matn, over: Partial<MatnSession> = {}) => {
    const base = createMatnSession({
      studentName: 'محمّد', instructorName: 'الشيخ', matn, goal: fullMatnGoal(matn), now: 1_000,
    });
    const session = { ...base, ...over };
    const onChange = vi.fn();
    const view = wrap(
      <MatnOverlay session={session} matn={matn} onChange={onChange} onEnd={() => {}} />,
    );
    return { ...view, onChange, session };
  };

  it('offers the ḍabṭ error as its third button, not a tajweed note', () => {
    withRelaxedRegistry(matn => {
      const { getByText, queryByText } = draw(matn);
      expect(getByText('خطأ ضبط')).toBeTruthy();
      expect(queryByText('تنبيه تجويد')).toBeNull();
    });
  });

  it('offers the mark instead when nobody is listening', () => {
    withRelaxedRegistry(matn => {
      const { getByText, queryByText } = draw(matn, { mode: 'solo' });
      expect(getByText('يحتاج مراجعة')).toBeTruthy();
      expect(queryByText('خطأ ضبط')).toBeNull();
    });
  });

  it('records a ḍabṭ error at the line and half the marker sits on', () => {
    withRelaxedRegistry(matn => {
      const { getByText, onChange } = draw(matn);
      fireEvent.click(getByText('خطأ ضبط'));
      const next: MatnSession = onChange.mock.calls[0][0];
      expect(next.notes).toHaveLength(1);
      expect(next.notes[0].kind).toBe('dabt');
      expect(next.notes[0].position.bayt).toBe(1);
    });
  });

  it('sends a mark to its own list, never to the notes', () => {
    withRelaxedRegistry(matn => {
      const { getByText, onChange } = draw(matn, { mode: 'solo' });
      fireEvent.click(getByText('يحتاج مراجعة'));
      const next: MatnSession = onChange.mock.calls[0][0];
      expect(next.notes).toEqual([]);
      expect(next.marks).toHaveLength(1);
    });
  });

  /** Browsing follows the reciter; nothing is credited by moving. */
  it('pins the position on a tap without crediting it', () => {
    withRelaxedRegistry(matn => {
      const { container, onChange } = draw(matn);
      const row = container.querySelector('[data-bayt="3"]')!;
      fireEvent.click(row.querySelector('[data-shatr="ajz"]')!);
      const next: MatnSession = onChange.mock.calls[0][0];
      expect(next.current).toMatchObject({ bayt: 3, shatr: 'ajz' });
      expect(next.covered).toEqual([]);
    });
  });

  /** The finish button must never arrive ahead of the student. */
  it('shows the finish button only at the last line of the bāb', () => {
    withRelaxedRegistry(matn => {
      const early = draw(matn);
      expect(early.container.querySelector('[data-finish-bab]')).toBeNull();
      cleanup();

      const atEnd = draw(matn, {
        current: { matnId: 'tuhfa', editionId: 'طبعة الاختبار', bayt: 2, shatr: 'ajz', origin: 'read' },
      });
      expect(atEnd.container.querySelector('[data-finish-bab]')).toBeTruthy();
    });
  });

  it('credits the whole bāb when the button is pressed', () => {
    withRelaxedRegistry(matn => {
      const { container, onChange } = draw(matn, {
        current: { matnId: 'tuhfa', editionId: 'طبعة الاختبار', bayt: 2, shatr: 'ajz', origin: 'read' },
      });
      fireEvent.click(container.querySelector('[data-finish-bab]')!);
      const next: MatnSession = onChange.mock.calls[0][0];
      expect(next.covered).toEqual([[1, 2]]);
    });
  });

  it('names the print on screen for the whole session', () => {
    withRelaxedRegistry(matn => {
      const { getByText } = draw(matn);
      expect(getByText('طبعة الاختبار')).toBeTruthy();
    });
  });
});

/**
 * The affordances around the loop, which the first matn build shipped without.
 * They are not decoration: without the list, the only way to take back a note
 * is the five-second chip.
 */
describe('the matn overlay, around the loop', () => {
  const draw = (matn: Matn, over: Partial<MatnSession> = {}) => {
    const base = createMatnSession({
      studentName: 'محمّد', instructorName: 'الشيخ', matn, goal: fullMatnGoal(matn), now: 1_000,
    });
    const session = { ...base, ...over };
    const onChange = vi.fn();
    const view = wrap(
      <MatnOverlay session={session} matn={matn} onChange={onChange} onEnd={() => {}} />,
    );
    return { ...view, onChange, session };
  };

  it('offers the night mode and the language, as the muṣḥaf does', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn);
      expect(container.querySelector('[data-theme-toggle]')).toBeTruthy();
    });
  });

  it('lists what was recorded, and lets it be deleted', () => {
    withRelaxedRegistry(matn => {
      const s = createMatnSession({
        studentName: 'م', instructorName: 'ش', matn, goal: fullMatnGoal(matn), now: 1_000,
      });
      const note = makeNote('dabt', s.current, 2_000);
      const { container, onChange } = draw(matn, { notes: [note] });

      fireEvent.click(container.querySelector('[data-open-list]')!);
      const row = container.querySelector(`[data-entry="${note.id}"]`);
      expect(row).toBeTruthy();
      expect(row!.textContent).toContain('خطأ ضبط');

      fireEvent.click(row!.querySelector('[data-remove]')!);
      expect(onChange.mock.calls[0][0].notes).toEqual([]);
    });
  });

  it('shows marks in that list too, not only notes', () => {
    withRelaxedRegistry(matn => {
      const s = createMatnSession({ studentName: 'م', matn, goal: fullMatnGoal(matn), now: 1_000 });
      const { container } = draw(matn, {
        mode: 'solo', marks: [{ id: 'm1', at: 2_000, position: s.current }],
      });
      fireEvent.click(container.querySelector('[data-open-list]')!);
      expect(container.querySelector('[data-entry="m1"]')!.textContent).toContain('يحتاج مراجعة');
    });
  });

  it('says so when nothing has been recorded yet', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn);
      fireEvent.click(container.querySelector('[data-open-list]')!);
      expect(container.querySelector('[data-entry]')).toBeNull();
    });
  });

  /**
   * A long press means something now — before, it was a second tap.
   * The hold is 450 ms, so the clock has to be driven rather than waited on.
   */
  it('opens the detail sheet on a long press, and only on a long one', () => {
    vi.useFakeTimers();
    try {
      withRelaxedRegistry(matn => {
        const { container, getByText } = draw(matn);
        const btn = getByText('خطأ ضبط').closest('button')!;

        // A tap is not a hold.
        fireEvent.pointerDown(btn);
        act(() => { vi.advanceTimersByTime(100); });
        fireEvent.pointerUp(btn);
        fireEvent.click(btn);
        expect(container.querySelector('[data-detail]')).toBeNull();

        // A hold is.
        fireEvent.pointerDown(btn);
        act(() => { vi.advanceTimersByTime(500); });
        expect(container.querySelector('[data-detail]')).toBeTruthy();
      });
    } finally { vi.useRealTimers(); }
  });

  it('announces what was recorded for a screen reader', () => {
    withRelaxedRegistry(matn => {
      const { container, getByText } = draw(matn);
      expect(container.querySelector('[aria-live]')).toBeTruthy();
      fireEvent.click(getByText('تردد').closest('button')!);
      expect(container.querySelector('[aria-live]')!.textContent).toContain('تردد');
    });
  });

  /**
   * Covering the matn to recite it from memory.
   *
   * What the overlay owns is *where* the cover starts: at the marker when it is
   * switched on, moving forward a line at a time as they are revealed, and back
   * to the marker if it is switched off and on again. What a covered line looks
   * like, and that it stays tappable, is in `matn-veil.test.tsx`.
   */
  describe('reciting from memory', () => {
    const veil = (c: HTMLElement) => c.querySelector('[data-toggle-veil]')!;
    const covered = (c: HTMLElement, n: number) =>
      c.querySelector(`[data-bayt="${n}"]`)!.hasAttribute('data-covered');

    it('starts uncovered, so nobody meets a blank matn they did not ask for', () => {
      withRelaxedRegistry(matn => {
        const { container } = draw(matn);
        expect(veil(container).getAttribute('aria-pressed')).toBe('false');
        expect(container.querySelector('[data-covered]')).toBeNull();
      });
    });

    it('covers from the marker on, leaving what was already recited', () => {
      withRelaxedRegistry(matn => {
        const { container } = draw(matn, { current: { bayt: 3, shatr: 'sadr' } as never });
        fireEvent.click(veil(container));
        expect(covered(container, 2)).toBe(false);
        expect(covered(container, 3)).toBe(true);
        expect(covered(container, 4)).toBe(true);
      });
    });

    it('says once that the lines are hidden on purpose', () => {
      withRelaxedRegistry(matn => {
        const { container } = draw(matn);
        expect(container.querySelector('[data-veil-hint]')).toBeNull();
        fireEvent.click(veil(container));
        expect(container.querySelector('[data-veil-hint]')).toBeTruthy();
      });
    });

    /** Reveal the line just recited; the next one is still covered. */
    it('uncovers one line at a time', () => {
      withRelaxedRegistry(matn => {
        const { container } = draw(matn, { current: { bayt: 2, shatr: 'sadr' } as never });
        fireEvent.click(veil(container));
        fireEvent.click(container.querySelector('[data-reveal-bayt]')!);
        expect(covered(container, 2)).toBe(false);
        expect(covered(container, 3)).toBe(true);
      });
    });

    it('uncovers everything again when it is switched off', () => {
      withRelaxedRegistry(matn => {
        const { container } = draw(matn);
        fireEvent.click(veil(container));
        fireEvent.click(veil(container));
        expect(veil(container).getAttribute('aria-pressed')).toBe('false');
        expect(container.querySelector('[data-covered]')).toBeNull();
      });
    });

    /**
     * Switching it off and on again is the one deliberate way to cover a line
     * that has already been revealed, so a reciter can test themselves on it a
     * second time.
     */
    it('covers from the marker again when it is switched back on', () => {
      withRelaxedRegistry(matn => {
        const { container } = draw(matn, { current: { bayt: 2, shatr: 'sadr' } as never });
        fireEvent.click(veil(container));
        fireEvent.click(container.querySelector('[data-reveal-bayt]')!);
        expect(covered(container, 2)).toBe(false);

        fireEvent.click(veil(container));
        fireEvent.click(veil(container));
        expect(covered(container, 2)).toBe(true);
      });
    });
  });
});
