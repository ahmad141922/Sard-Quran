/**
 * The whole muṣḥaf as 604 squares, coloured by how the pages are holding.
 *
 * The point is the one glance: **I am strong here, and weak there.** Which is
 * why two things below matter more than the colours do.
 *
 * **A page never recited is not a cool page.** «No faults» and «no evidence»
 * look identical to any scale that only knows heat, and painting an unopened
 * juzʾ the same green as a mastered one would tell a memoriser the opposite of
 * the truth. Unsampled pages get their own neutral tone — see `heatKnown`.
 *
 * **The colour is a rate, not a count.** A page recited twenty times collects
 * more faults than a page recited once; colouring by raw faults would paint
 * the pages a student works hardest at as their weakest.
 */

import React, { useMemo } from 'react';

import { useI18n } from '@/hooks/useI18n';
import { heatKnown, heatOf, type PageState } from '@/lib/recitation-memory';

interface Props {
  states: Map<number, PageState>;
  totalPages?: number;
  onPick?: (page: number) => void;
}

/**
 * Green through amber to rose, in five steps.
 *
 * Stepped rather than a continuous gradient: a reader cannot tell 0.62 from
 * 0.68 by eye, so a smooth ramp only pretends to a precision the underlying
 * rate does not have. Five bands are as many as the eye can actually read off
 * a grid this dense.
 */
const BANDS = [
  'bg-emerald-500/80',
  'bg-emerald-400/60',
  'bg-amber-400/70',
  'bg-orange-500/75',
  'bg-rose-600/80',
];

const UNSEEN = 'bg-muted-foreground/15';

function bandOf(state: PageState | undefined): string {
  if (!state || !heatKnown(state)) return UNSEEN;
  const heat = heatOf(state);
  return BANDS[Math.min(BANDS.length - 1, Math.floor(heat * BANDS.length))];
}

export const MushafHeatMap: React.FC<Props> = ({ states, totalPages = 604, onPick }) => {
  const { t } = useI18n();

  const pages = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

  return (
    <section data-heat-map>
      <div className="mb-0.5 text-xs font-bold text-muted-foreground">{t('recHeatMap')}</div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{t('recHeatHint')}</p>

      {/*
        A fixed 604-cell grid, scrolling inside itself rather than stretching
        the page. On a phone the cells land near 6px, which is small but still
        reads as a shape — the map is for the pattern, not for picking a page
        out of it; that is what the list below is for.
      */}
      <div
        className="grid gap-[2px] overflow-x-auto rounded-lg border border-border bg-card p-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(7px, 1fr))' }}
      >
        {/*
          A cell is a button only where there is somewhere to go.

          Without `onPick` this drew six hundred and four *disabled* buttons —
          six hundred and four things a screen reader announces as unavailable,
          to say one thing about a shape. Where nothing can be opened they are
          cells, and the map speaks by colour as it was always meant to.
        */}
        {pages.map(page => {
          const state = states.get(page);
          const known = state && heatKnown(state);
          const label = `${t('recPageUnit')} ${page} — ${
            known ? `${Math.round(heatOf(state!) * 100)}%` : t('recHeatUnknown')
          }`;
          const shape = `aspect-square rounded-[2px] ${bandOf(state)} transition-transform hover:scale-150`;
          return onPick ? (
            <button
              key={page}
              type="button"
              data-page={page}
              data-known={known || undefined}
              onClick={() => onPick(page)}
              title={`${t('recPageUnit')} ${page}`}
              aria-label={label}
              className={shape}
            />
          ) : (
            /* `role="img"`, because that is what it is: one part of a picture,
               carrying its own description. An `aria-label` on a bare `div` is
               ignored, and the label is the whole reason a screen reader gets
               anything out of a grid of colour. */
            <div
              key={page}
              role="img"
              data-page={page}
              data-known={known || undefined}
              title={`${t('recPageUnit')} ${page}`}
              aria-label={label}
              className={shape}
            />
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <Key className={BANDS[0]} label={t('recHeatCool')} />
        <Key className={BANDS[4]} label={t('recHeatHot')} />
        {/* Named in the legend, because it is the distinction that matters. */}
        <Key className={UNSEEN} label={t('recHeatUnknown')} />
      </div>
    </section>
  );
};

const Key: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="flex items-center gap-1">
    <span className={`h-2.5 w-2.5 rounded-[2px] ${className}`} aria-hidden />
    {label}
  </span>
);

export default MushafHeatMap;
