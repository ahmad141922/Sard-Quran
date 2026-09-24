/**
 * How steady the memorisation is, in four dimensions — and the fifth, named.
 *
 * A single score would be easier to draw and worse to act on: «78%» tells a
 * student nothing about whether to slow down or to space their review out.
 * Four bars say which one to work on.
 *
 * The fifth dimension the tool was asked for — **similar passages** — is shown
 * as explicitly unavailable rather than dropped. Telling a student that a slip
 * came from a look-alike verse elsewhere needs a checked dataset of
 * mutashābihāt, and there is none here. A number invented for it would sit on
 * screen looking exactly like the four that are real, which is precisely why
 * it is named instead.
 */

import React from 'react';
import { Info } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import type { Retention } from '@/lib/recitation-memory';

const BARS = [
  { key: 'recall', label: 'recRecall' },
  { key: 'fluency', label: 'recFluency' },
  { key: 'accuracy', label: 'recAccuracy' },
  { key: 'spacing', label: 'recSpacing' },
] as const;

export const RetentionPanel: React.FC<{ retention: Retention }> = ({ retention }) => {
  const { t } = useI18n();

  return (
    <section data-retention>
      <div className="mb-2 text-xs font-bold text-muted-foreground">{t('recRetention')}</div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        {BARS.map(({ key, label }) => {
          const value = retention[key];
          const pct = Math.round(value * 100);
          return (
            <div key={key} data-bar={key}>
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span className="text-foreground">{t(label)}</span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Said, not hidden — see the note at the top of this file. */}
        <div
          data-missing-dimension
          className="flex items-start gap-1.5 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground"
        >
          <Info size={12} className="mt-0.5 shrink-0" />
          {t('recSimilarityMissing')}
        </div>
      </div>
    </section>
  );
};

export default RetentionPanel;
