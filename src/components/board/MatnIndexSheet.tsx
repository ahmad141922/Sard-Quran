/**
 * The chapters of a matn, to jump between mid-session.
 *
 * A matn is one long scroll — al-Jazariyya is 109 abyāt in nineteen chapters,
 * Ṭayyibat an-Nashr is a thousand — and finding «bāb al-madd» by dragging past
 * everything before it is the fussing this tool exists to remove. The chapter
 * a reciter wants is a name, so it is offered as one.
 *
 * ## It moves, it does not narrow
 *
 * Picking a chapter takes the marker there. It does **not** change the goal the
 * majlis was started with: the goal is what this sitting set out to recite, and
 * quietly rewriting it because somebody looked something up would make the
 * progress figure a lie. Reciting one chapter is chosen at setup, where it is a
 * decision rather than a side effect.
 */

import React from 'react';
import { X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { isArabic } from '@/lib/display-lang';
import type { Matn, MatnBab } from '@/lib/matn/load';

interface Props {
  matn: Matn;
  /** The bayt the marker is on, so the chapter holding it can say so. */
  current: number;
  onGo: (bayt: number) => void;
  onClose: () => void;
}

export const MatnIndexSheet: React.FC<Props> = ({ matn, current, onGo, onClose }) => {
  const { t, lang, dir } = useI18n();
  const arabic = isArabic(lang);

  const title = (bab: MatnBab) => (arabic ? bab.titleAr : bab.titleEn);
  const holds = (bab: MatnBab) => current >= bab.from && current <= bab.to;

  return (
    <div
      dir={dir}
      data-matn-index
      className="fixed inset-0 z-[200] flex flex-col bg-background/98 pt-safe pb-safe px-safe"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-bold text-foreground">{t('matnIndex')}</span>
        <button
          type="button"
          data-index-close
          onClick={onClose}
          aria-label={t('close')}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X size={16} />
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {matn.abwab.map(bab => (
          <li key={bab.n}>
            <button
              type="button"
              data-bab-jump={bab.n}
              aria-current={holds(bab) ? 'true' : undefined}
              onClick={() => onGo(bab.from)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-start ${
                holds(bab)
                  ? 'border-emerald-500/40 bg-emerald-600/10'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <span className="min-w-0 flex-1 text-[13px] font-bold text-foreground">
                {title(bab)}
              </span>
              {/*
                The lines it covers, in the numbering the print uses — the same
                numbering a note will name later, so the two can be matched.
              */}
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {bab.from}–{bab.to}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MatnIndexSheet;
