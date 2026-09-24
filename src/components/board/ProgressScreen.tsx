/**
 * Everything the sessions add up to, on one screen.
 *
 * Ordered by what a memoriser opening it actually wants, which is not the
 * order the parts were built in: **what should I do tonight** comes first, the
 * shape of the whole muṣḥaf second, how it is holding third, and the journey
 * last. A dashboard that led with the year's totals would be a trophy cabinet.
 */

import React, { useMemo } from 'react';
import { X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import type { QuranIndex } from '@/lib/quran-index';
import type { RecitationSession } from '@/lib/recitation-session';
import { pageStates, retention } from '@/lib/recitation-memory';
import { pageOfAnchorIn } from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
import { getMushaf } from '@/lib/mushaf/registry';
import { useMushaf } from '@/lib/mushaf/MushafProvider';
import { useMushafPageIndex } from '@/lib/mushaf/page-index';
import DueToday from './DueToday';
import HabitPanel from './HabitPanel';
import MushafHeatMap from './MushafHeatMap';
import RetentionPanel from './RetentionPanel';
import MemoryTimeline from './MemoryTimeline';

interface Props {
  sessions: RecitationSession[];
  index: QuranIndex;
  /** Passed in rather than read from the clock, so the view is testable. */
  now?: number;
  onClose: () => void;
  /**
   * Opens a page of the muṣḥaf — what a plan for the evening is *for*.
   *
   * Optional, and offered onward only when the page numbers on this screen
   * belong to the book the reader would open. See below: a page is a page of
   * one print, and sending somebody to page 294 of a book they are not holding
   * is worse than sending them nowhere.
   */
  onOpenPage?: (page: number) => void;
}

export const ProgressScreen: React.FC<Props> = ({
  sessions, index, now = Date.now(), onClose, onOpenPage,
}) => {
  const { t, lang, dir } = useI18n();

  /**
   * Pages of the edition the sessions were actually recited in.
   *
   * Falls back to the text layer's own pagination when no plate index is to
   * hand — the map is then still true, just drawn on the default layout.
   */
  const edition = useMemo(
    () => getMushaf(sessions[0]?.mushafId ?? '') ?? null,
    [sessions],
  );
  const pageIndex = useMushafPageIndex(edition);
  const pageOf = useMemo(() => {
    if (!edition) return undefined;
    const canonical = canonicalBookFromQuranIndex(index);
    const book = editionBook(edition, pageIndex, canonical);
    return book ? pageOfAnchorIn(book, canonical) : undefined;
  }, [edition, pageIndex, index]);

  const finished = useMemo(() => sessions.filter(s => s.endedAt !== null), [sessions]);
  const states = useMemo(() => pageStates(finished, index, pageOf), [finished, index, pageOf]);
  const score = useMemo(
    () => retention(states.values(), finished.flatMap(s => s.notes), now),
    [states, finished, now],
  );
  const firstAt = finished.length
    ? Math.min(...finished.map(s => s.startedAt))
    : null;

  /**
   * Whether a page number here can be handed to the reader as it stands.
   *
   * Every figure on this screen is counted in the pagination of the muṣḥaf
   * these sessions were recited from. The reader opens whichever riwaya is
   * currently chosen — and page 294 of ash-Shamarly is not page 294 of the
   * Madinah print. So the pages are offered as somewhere to go only while the
   * two are the same book; otherwise they are read, not tapped, which is what
   * they were before this screen could open anything at all.
   */
  const { mushaf: reading } = useMushaf();
  const openPage = edition && edition.id === reading.id ? onOpenPage : undefined;

  return (
    <div className="fixed inset-0 z-[190] overflow-y-auto bg-background" dir={dir} data-progress-screen>
      {/* The screen is `fixed inset-0`, so on a phone its top edge is under the
          status bar and the way out was half of it. The inset is zero
          everywhere else, where the padding it already had stands. */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <span className="text-sm font-bold text-foreground">{t('recProgress')}</span>
        <button
          onClick={onClose}
          data-a11y-tap
          aria-label={t('close')}
          title={t('close')}
          className="-me-1.5 flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={18} />
        </button>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5">
        {/*
          Above the heat map on purpose: «how am I doing» is the question
          somebody opens this screen with, and the map answers a narrower one.
        */}
        <HabitPanel sessions={sessions} now={now} />
        <DueToday states={states} now={now} onPick={openPage} />
        <MushafHeatMap states={states} onPick={openPage} />
        <RetentionPanel retention={score} />
        <MemoryTimeline
          states={states}
          sessions={finished.length}
          firstAt={firstAt}
          lang={lang}
        />
      </div>
    </div>
  );
};

export default ProgressScreen;
