import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import HabitPanel from '@/components/board/HabitPanel';
import { standingGoal } from '@/lib/standing-goal';
import type { RecitationSession } from '@/lib/recitation-session';

/**
 * The panel, and the line it is not allowed to cross.
 *
 * There is no reward here and nothing is taken away for a missed day: a number
 * that congratulates attendance measures the app rather than the Qurʾān, and a
 * reciter opening the tool to keep a number alive is a reciter it has started
 * working against.
 */

const NOON = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const NOW = NOON(2026, 8, 31);
const daysAgo = (n: number) => NOON(2026, 8, 31 - n);

const majlis = (at: number, ayahs = 10): RecitationSession =>
  ({ startedAt: at, covered: ayahs > 0 ? [[1, ayahs]] : [] } as never);

const mount = (sessions: RecitationSession[]) => render(
  <I18nProvider forceLang="ar"><HabitPanel sessions={sessions} now={NOW} /></I18nProvider>,
);

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('the run', () => {
  it('says nothing has been recorded before the first majlis', () => {
    const { container } = mount([]);
    expect(container.querySelector('[data-streak-none]')).toBeTruthy();
    expect(container.querySelector('[data-streak]')).toBeNull();
  });

  it('shows the days in a row, and the longest there has been', () => {
    const { container } = mount([0, 1, 2].map(n => majlis(daysAgo(n))));
    expect(container.querySelector('[data-streak]')!.textContent).toBe('3');
    expect(container.textContent).toContain('أطولها');
  });

  /** The day is not over, and saying so is not a warning. */
  it('says the day is still open rather than treating it as a loss', () => {
    const { container } = mount([1, 2].map(n => majlis(daysAgo(n))));
    expect(container.querySelector('[data-streak]')!.textContent).toBe('2');
    expect(container.querySelector('[data-streak-open]')).toBeTruthy();
    expect(container.textContent).toContain('لم ينتهِ');
  });

  it('says nothing of the sort on a day that has already happened', () => {
    const { container } = mount([0, 1].map(n => majlis(daysAgo(n))));
    expect(container.querySelector('[data-streak-open]')).toBeNull();
  });
});

describe('the goal', () => {
  it('offers one without nagging when none is set', () => {
    const { container } = mount([majlis(daysAgo(1))]);
    expect(container.querySelector('[data-goal-none]')).toBeTruthy();
    expect(container.querySelectorAll('[data-goal-set]').length).toBeGreaterThan(0);
  });

  it('keeps the one that was chosen, and measures against it', () => {
    const { container } = mount([majlis(daysAgo(1), 60), majlis(daysAgo(2), 60)]);
    fireEvent.click(container.querySelector('[data-goal-set="month"]')!);

    expect(standingGoal()).toEqual({ ayahs: 200, period: 'month' });
    expect(container.querySelector('[data-goal]')!.textContent).toContain('120');
    expect(container.querySelector('[data-goal]')!.textContent).toContain('200');
  });

  it('reads back the goal it was left with', () => {
    const first = mount([majlis(daysAgo(1), 20)]);
    fireEvent.click(first.container.querySelector('[data-goal-set="day"]')!);
    cleanup();

    const { container } = mount([majlis(daysAgo(1), 20)]);
    expect(container.querySelector('[data-goal]')).toBeTruthy();
    expect(container.querySelector('[data-goal-none]')).toBeNull();
  });

  it('says how much is left', () => {
    const { container } = mount([majlis(daysAgo(1), 50)]);
    fireEvent.click(container.querySelector('[data-goal-set="month"]')!);
    expect(container.textContent).toContain('بقي');
    expect(container.textContent).toContain('150');
  });

  it('says it is met, once, however far past it they went', () => {
    const { container } = mount([majlis(daysAgo(1), 5000)]);
    fireEvent.click(container.querySelector('[data-goal-set="month"]')!);
    expect(container.textContent).toContain('تمّ الهدف');
    expect(container.querySelector('[data-goal-bar]')!.getAttribute('style'))
      .toContain('100%');
  });

  it('can be given up as easily as it was set', () => {
    const { container } = mount([majlis(daysAgo(1))]);
    fireEvent.click(container.querySelector('[data-goal-set="day"]')!);
    fireEvent.click(container.querySelector('[data-goal-clear]')!);

    expect(standingGoal()).toBeNull();
    expect(container.querySelector('[data-goal-none]')).toBeTruthy();
  });
});

describe('what it refuses to be', () => {
  /**
   * No badge, no reward, no scolding. The words are checked because this is
   * the one place the tool could quietly start measuring the app instead of
   * the Qurʾān.
   */
  it('never congratulates a streak, only states it', () => {
    const { container } = mount(Array.from({ length: 30 }, (_, n) => majlis(daysAgo(n))));
    expect(container.querySelector('[data-streak]')!.textContent).toBe('30');
    for (const word of ['أحسنت', 'مبروك', 'رائع', 'استمرّ', 'لا تفوّت']) {
      expect(container.textContent).not.toContain(word);
    }
  });

  it('says nothing at all about a day that was missed', () => {
    const { container } = mount([majlis(daysAgo(5))]);
    for (const word of ['فاتك', 'انقطع', 'خسرت']) {
      expect(container.textContent).not.toContain(word);
    }
  });
});
