/**
 * This majlis against the one before it.
 *
 * The sentence everybody wants is «last week seventeen stumbles, this week
 * eight» — and it is a lie whenever the two sessions were different sizes.
 * Three pages against a juzʾ manufactures a triumph out of nothing, and a
 * memoriser told they improved when they did not is worse served than one
 * told nothing.
 *
 * So the counts are shown **only** when the two are comparable, and the rate
 * — weighted faults per page — is what carries the judgement. When they are
 * not comparable the component says so in a sentence rather than going blank,
 * because the absence of a comparison is itself worth knowing.
 */

import React from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import type { SessionComparison as Comparison } from '@/lib/recitation-review';

const round = (n: number) => Math.round(n * 10) / 10;

export const SessionComparison: React.FC<{ comparison: Comparison }> = ({ comparison }) => {
  const { t } = useI18n();
  const { current, previous, comparable, deltaRate } = comparison;

  // A tenth of a fault per page is noise, not a trend.
  const direction = Math.abs(deltaRate) < 0.1 ? 'same' : deltaRate < 0 ? 'better' : 'worse';
  const Icon = direction === 'better' ? TrendingDown : direction === 'worse' ? TrendingUp : Minus;
  const tone = direction === 'better'
    ? 'text-emerald-700 dark:text-emerald-400'
    : direction === 'worse' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground';

  return (
    <div className="mt-4" data-comparison>
      <div className="mb-1.5 text-xs font-bold text-muted-foreground">{t('recVsLast')}</div>
      <div className="rounded-lg border border-emerald-900/10 bg-white/50 px-2.5 py-2 text-xs dark:border-emerald-100/10 dark:bg-white/[0.04]">
        <div className={`flex items-center gap-1.5 font-bold ${tone}`} data-direction={direction}>
          <Icon size={14} />
          <span className="tabular-nums">
            {round(previous.rate)} → {round(current.rate)} {t('recPerPage')}
          </span>
          <span>· {t(direction === 'better' ? 'recBetter' : direction === 'worse' ? 'recWorse' : 'recSame')}</span>
        </div>

        {comparable ? (
          <div className="mt-1 tabular-nums text-muted-foreground" data-counts>
            {previous.notes} → {current.notes}
          </div>
        ) : (
          /* Said plainly rather than hidden: the reader would otherwise wonder
             where the two numbers went. */
          <div className="mt-1 leading-relaxed text-muted-foreground" data-not-comparable>
            {t('recVsLastNotComparable')}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionComparison;
