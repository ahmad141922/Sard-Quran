/**
 * The journey, in the few numbers that are actually true of it.
 *
 * Deliberately small. A timeline that listed every majlis would be a log, and
 * a log is the thing this screen exists to spare somebody reading. What a
 * memoriser wants back after a year is: when did I start, how many times have
 * I sat down, how much of the Book have I been through, and how many pages am
 * I holding steadily.
 *
 * The last of those is the only one that is an achievement rather than a
 * tally, which is why it is the one shown large.
 */

import React from 'react';

import { useI18n } from '@/hooks/useI18n';
import { heatKnown, heatOf, type PageState } from '@/lib/recitation-memory';

interface Props {
  states: Map<number, PageState>;
  sessions: number;
  /** The earliest majlis on record, or null when there is none. */
  firstAt: number | null;
  lang: string;
}

/** A page is "steady" when it has been sampled and is in the coolest band. */
const STEADY_BELOW = 0.2;

export const MemoryTimeline: React.FC<Props> = ({ states, sessions, firstAt, lang }) => {
  const { t } = useI18n();
  const all = [...states.values()];
  const sampled = all.filter(heatKnown);
  const steady = sampled.filter(s => heatOf(s) < STEADY_BELOW).length;

  if (!sessions) {
    return (
      <p data-no-history className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
        {t('recNoHistory')}
      </p>
    );
  }

  return (
    <section data-timeline>
      <div className="mb-2 text-xs font-bold text-muted-foreground">{t('recTimeline')}</div>

      <div className="rounded-lg border border-border bg-card p-3">
        {/*
          The one figure here that is an achievement rather than a count: pages
          sampled enough to judge, and holding.
        */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tabular-nums text-foreground" data-steady>
            {steady}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t('recHeatCool')} · {t('recPageUnit')}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-[11px]">
          <Figure value={String(sessions)} label={t('recSessionsCount')} />
          <Figure value={String(all.length)} label={t('recPagesSeen')} />
          {firstAt !== null && (
            <Figure
              value={new Date(firstAt).toLocaleDateString(lang, { year: 'numeric', month: 'short' })}
              label={t('recFirstSession')}
              wide
            />
          )}
        </div>
      </div>
    </section>
  );
};

const Figure: React.FC<{ value: string; label: string; wide?: boolean }> = ({ value, label, wide }) => (
  <div className={wide ? 'col-span-2' : undefined}>
    <div className="font-bold tabular-nums text-foreground">{value}</div>
    <div className="text-muted-foreground">{label}</div>
  </div>
);

export default MemoryTimeline;
