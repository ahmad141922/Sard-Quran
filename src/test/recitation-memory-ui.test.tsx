import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import MushafHeatMap from '@/components/board/MushafHeatMap';
import DueToday from '@/components/board/DueToday';
import RetentionPanel from '@/components/board/RetentionPanel';
import MemoryTimeline from '@/components/board/MemoryTimeline';
import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { coverSpan, type RecitationSession } from '@/lib/recitation-session';
import { pageStates, retention, type PageState } from '@/lib/recitation-memory';
import { testBooks, type TestBooks } from './session-helpers';

afterEach(cleanup);

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, '../../public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
});

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;
const pageOf = (id: number) => index.pageOf(id);

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

const night = (endedAt: number, faults: ('memory' | 'hesitation')[] = []): RecitationSession => {
  const s = coverSpan(books.session({ goalKind: 'juz1', startAyahId: 8 }), 8, 80);
  return {
    ...s, endedAt, lastSeenAt: endedAt, status: 'ended',
    notes: faults.map(k => books.note(k, 40)),
  };
};

const states = (sessions: RecitationSession[]) => pageStates(sessions, index, pageOf);

describe('the heat map', () => {
  it('draws a square for every page of the muṣḥaf', () => {
    const { container } = wrap(<MushafHeatMap states={states([night(T0)])} />);
    expect(container.querySelectorAll('[data-page]')).toHaveLength(604);
  });

  /**
   * The distinction the whole map rests on. Painting an unopened juzʾ the same
   * green as a mastered one tells a memoriser the opposite of the truth.
   */
  it('tells a page never recited from a page recited cleanly', () => {
    const { container } = wrap(<MushafHeatMap states={states([night(T0)])} />);
    const recited = [...container.querySelectorAll('[data-page]')]
      .filter(el => el.getAttribute('data-known') === 'true');
    const never = [...container.querySelectorAll('[data-page]')]
      .filter(el => el.getAttribute('data-known') === null);

    expect(recited.length).toBeGreaterThan(0);
    expect(never.length).toBeGreaterThan(0);
    expect(recited[0].className).not.toBe(never[0].className);
  });

  it('names the unknown state in the legend, not only in the grid', () => {
    const { container } = wrap(<MushafHeatMap states={states([night(T0)])} />);
    expect(container.textContent).toContain('لم يُسرَد بعدُ');
  });

  it('tells a screen reader what a square means', () => {
    const { container } = wrap(<MushafHeatMap states={states([night(T0)])} />);
    const known = container.querySelector('[data-known="true"]')!;
    expect(known.getAttribute('aria-label')).toMatch(/صفحة \d+/);
  });
});

describe('what is due', () => {
  it('says so plainly when nothing is', () => {
    const { container } = wrap(<DueToday states={states([night(T0)])} now={T0} />);
    expect(container.querySelector('[data-due-none]')).toBeTruthy();
    expect(container.querySelector('[data-due-page]')).toBeNull();
  });

  it('lists pages once they have gone past their interval', () => {
    const { container } = wrap(<DueToday states={states([night(T0)])} now={T0 + 90 * DAY} />);
    expect(container.querySelectorAll('[data-due-page]').length).toBeGreaterThan(0);
  });

  /**
   * A memoriser returning after a month has three hundred overdue pages, and
   * a list that long is the same as no list — but a silent truncation reads
   * as "you are nearly done".
   */
  it('bounds the list and says how many it left out', () => {
    const { container } = wrap(
      <DueToday states={states([night(T0)])} now={T0 + 90 * DAY} limit={3} />,
    );
    expect(container.querySelectorAll('[data-due-page]')).toHaveLength(3);
    expect(container.querySelector('[data-due-more]')).toBeTruthy();
  });

  it('says nothing about a remainder when there is none', () => {
    const { container } = wrap(
      <DueToday states={states([night(T0)])} now={T0 + 90 * DAY} limit={999} />,
    );
    expect(container.querySelector('[data-due-more]')).toBeNull();
  });
});

describe('the retention panel', () => {
  const score = (sessions: RecitationSession[], now: number) => retention(
    states(sessions).values(), sessions.flatMap(s => s.notes), now,
  );

  it('draws a bar for each dimension it can measure', () => {
    const { container } = wrap(<RetentionPanel retention={score([night(T0)], T0)} />);
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(4);
  });

  /**
   * The dimension that cannot be computed is named on screen rather than
   * dropped: an invented number would look exactly like the four real ones.
   */
  it('says out loud which dimension it cannot show', () => {
    const { container } = wrap(<RetentionPanel retention={score([night(T0)], T0)} />);
    const said = container.querySelector('[data-missing-dimension]');
    expect(said).toBeTruthy();
    expect(said!.textContent).toContain('المتشابهات');
    expect(container.querySelector('[data-bar="similarity"]')).toBeNull();
  });
});

describe('the timeline', () => {
  const draw = (sessions: RecitationSession[]) => wrap(
    <MemoryTimeline
      states={states(sessions)}
      sessions={sessions.length}
      firstAt={sessions.length ? Math.min(...sessions.map(s => s.startedAt)) : null}
      lang="ar"
    />,
  );

  it('says there is nothing yet rather than showing zeros', () => {
    const { container } = draw([]);
    expect(container.querySelector('[data-no-history]')).toBeTruthy();
    expect(container.querySelector('[data-timeline]')).toBeNull();
  });

  it('leads with the pages held steadily — the one figure that is an achievement', () => {
    const { container } = draw([night(T0), night(T0 + DAY)]);
    expect(container.querySelector('[data-steady]')).toBeTruthy();
    expect(Number(container.querySelector('[data-steady]')!.textContent)).toBeGreaterThan(0);
  });

  it('counts a shaky page as seen but not as steady', () => {
    const shaky = draw([night(T0, ['memory', 'memory', 'memory', 'memory'])]);
    const clean = draw([night(T0 + DAY)]);
    expect(Number(shaky.container.querySelector('[data-steady]')!.textContent))
      .toBeLessThan(Number(clean.container.querySelector('[data-steady]')!.textContent));
  });
});
