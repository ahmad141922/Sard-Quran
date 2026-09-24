/**
 * What has gone too long unopened — the one screen with an answer on it.
 *
 * The heat map says where you are weak; this says what to do tonight. It is
 * the more useful of the two on most evenings, which is why it sits above.
 *
 * Bounded on purpose: a memoriser returning after a month has three hundred
 * overdue pages, and a list that long is the same as no list. Showing the
 * worst handful and **saying how many were left out** is the difference
 * between a plan and a reproach.
 */

import React from 'react';
import { CalendarClock, Check } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { dueNow, overdueDays, type PageState } from '@/lib/recitation-memory';

interface Props {
  states: Map<number, PageState>;
  now: number;
  /** How many to show before saying "and N more". */
  limit?: number;
  onPick?: (page: number) => void;
}

export const DueToday: React.FC<Props> = ({ states, now, limit = 8, onPick }) => {
  const { t } = useI18n();
  const due = dueNow(states.values(), now);
  const shown = due.slice(0, limit);
  const hidden = due.length - shown.length;

  return (
    <section data-due>
      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <CalendarClock size={13} />
        {t('recDueToday')}{due.length ? ` · ${due.length}` : ''}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{t('recDueHint')}</p>

      {due.length === 0 ? (
        <p
          data-due-none
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-5 text-center text-[11px] text-muted-foreground"
        >
          <Check size={14} className="text-emerald-600" />
          {t('recDueNone')}
        </p>
      ) : (
        <>
          {/*
            A row is a button only where there is somewhere to go.

            Without `onPick` every one of these rendered as a disabled button —
            a plan for the evening drawn as eight things you may not touch,
            which reads as broken rather than as a list. Where nothing can be
            opened they are simply rows.
          */}
          <ul className="space-y-1">
            {shown.map(state => {
              const inside = (
                <>
                  <span className="font-bold text-foreground">
                    {t('recPageUnit')} {state.page}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {overdueDays(state, now)}{t('recDaysUnit')} {t('recOverdue')}
                  </span>
                </>
              );
              const shape = 'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs';
              return (
                <li key={state.page} data-due-page={state.page}>
                  {onPick ? (
                    <button
                      type="button"
                      onClick={() => onPick(state.page)}
                      aria-label={`${t('recPageUnit')} ${state.page}`}
                      className={`${shape} transition-colors hover:bg-accent`}
                    >
                      {inside}
                    </button>
                  ) : (
                    <div className={shape}>{inside}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {/*
            Never a silent truncation: a list that quietly showed eight of
            three hundred would read as "you are nearly done".
          */}
          {hidden > 0 && (
            <div data-due-more className="mt-1.5 text-center text-[11px] text-muted-foreground">
              + {hidden}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default DueToday;
