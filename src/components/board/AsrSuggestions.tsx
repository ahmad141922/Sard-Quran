/**
 * What the recording noticed, put to the reciter as questions.
 *
 * Every line here is a **question**, never a finding. The reciter answers it,
 * and only «yes» writes anything into the majlis. This is the screen where the
 * rule stated in `asr/engine.ts` is actually kept, so it is worth saying what
 * would break it: a count, a total, a badge, anything that reads the pending
 * list would turn a machine's guess into a record of what a person did.
 *
 * The two sentences at the bottom are not decoration either. One says the
 * machine can be wrong — the model's own card asks for it, and it is true. The
 * other names what it cannot hear at all, so nobody reads silence about
 * tafkhīm as approval of it.
 */

import React from 'react';
import { Check, Play, X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import type { AsrReview } from '@/lib/asr/review';
import { candidateDetail } from '@/lib/asr/review';
import type { ReviewedCandidate } from '@/lib/asr/engine';

interface Props {
  review: AsrReview;
  /** How a place is written for the reader — the caller knows the numbering. */
  label: (anchorId: number) => string;
  /** The words themselves; null where the verse is not certain. */
  textOf?: (anchorId: number) => string | null;
  textFont?: string;
  /**
   * The verse's words, in order — so the one that went wrong can be picked out
   * of it rather than left for the reciter to find.
   *
   * Absent for the 94 āyāt whose word boundaries could not be checked against
   * the printed verse, and for a matn. The verse is then shown whole, which is
   * what it did before this existed.
   */
  wordsOf?: (anchorId: number) => string[] | null;
  onAccept: (candidate: ReviewedCandidate) => void;
  onDismiss: (candidate: ReviewedCandidate) => void;
  onDismissRest?: () => void;
  /** Takes the reciter to that moment of their own recording, where offered. */
  onPlay?: (atMs: number) => void;
}

export const AsrSuggestions: React.FC<Props> = ({
  review, label, textOf, textFont, wordsOf, onAccept, onDismiss, onDismissRest, onPlay,
}) => {
  const { t } = useI18n();

  /**
   * Not enough recitation to have an opinion about — which is a different
   * sentence from «nothing was found», and the reciter is owed the right one.
   * Measured on a device: five seconds on «الم» is eight sounds.
   */
  if (!review.enough) {
    return (
      <div data-asr-short className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        {t('asrTooShort')}
      </div>
    );
  }

  /**
   * A recording the model could barely follow says nothing about the reciter,
   * so it is not shown as findings-with-a-caveat. It is shown as a recording
   * that did not work.
   */
  if (!review.followed) {
    return (
      <div data-asr-unclear className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        {t('asrUnclear')}
      </div>
    );
  }

  const pending = review.candidates.filter(c => c.verdict === 'pending');
  const accepted = review.candidates.filter(c => c.verdict === 'accepted').length;

  /**
   * Two very different things, said differently.
   *
   * «The recording noticed nothing» after the reciter has just answered two
   * places is a plain untruth, and it was the first thing that confused a real
   * reciter using this. A list that has been worked through says so, and says
   * what came of it.
   */
  if (!pending.length && review.candidates.length > 0) {
    return (
      <div data-asr-answered className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        {t('asrAnswered')}{' '}
        {accepted > 0 ? `${t('asrKept')} ${accepted}.` : t('asrKeptNone')}
      </div>
    );
  }

  if (!pending.length) {
    return (
      <div data-asr-clean className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        {t('asrClean')}
      </div>
    );
  }

  return (
    <div data-asr-suggestions className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-bold text-muted-foreground">
        {t('asrSuggestions')} · {pending.length}
      </div>

      <ul className="space-y-2">
        {pending.map(candidate => (
          <li
            key={candidate.id}
            data-asr-candidate={candidate.id}
            className="rounded-lg border border-emerald-900/10 bg-white/50 px-2.5 py-2 text-xs dark:border-emerald-100/10 dark:bg-white/[0.04]"
          >
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-bold text-foreground">{label(candidate.anchorId)}</span>
                {(() => {
                  /*
                    The word itself where it is known, and the whole verse
                    where it is not — never a guess. The index reproduces the
                    printed words for all but 94 āyāt, and `word` is null for
                    exactly those.
                  */
                  const words = candidate.word === null ? null : wordsOf?.(candidate.anchorId);
                  const at = words?.[candidate.word as number];
                  if (at) {
                    return (
                      <p
                        data-ayah-word
                        dir="rtl"
                        style={textFont ? { fontFamily: textFont } : undefined}
                        className="mt-1 text-[17px] font-bold leading-[2] text-foreground"
                      >
                        {at}
                      </p>
                    );
                  }
                  const text = textOf?.(candidate.anchorId);
                  return text ? (
                    <p
                      data-ayah-text
                      dir="rtl"
                      style={textFont ? { fontFamily: textFont } : undefined}
                      className="mt-1 text-[15px] leading-[2.1] text-foreground/90"
                    >
                      {text}
                    </p>
                  ) : null;
                })()}
                <div className="mt-1 text-muted-foreground">
                  {candidateDetail(candidate, t)}
                </div>
              </span>

              {/* Only where the recording is still to hand. */}
              {onPlay && candidate.atMs !== null && (
                <button
                  type="button"
                  data-asr-play
                  onClick={() => onPlay(candidate.atMs as number)}
                  aria-label={t('asrPlay')}
                  className="shrink-0 rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400"
                >
                  <Play size={14} />
                </button>
              )}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-asr-accept
                onClick={() => onAccept(candidate)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-2 py-1.5 font-bold text-white hover:bg-rose-700"
              >
                <Check size={13} /> {t('asrAccept')}
              </button>
              <button
                type="button"
                data-asr-dismiss
                onClick={() => onDismiss(candidate)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={13} /> {t('asrDismiss')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {onDismissRest && pending.length > 1 && (
        <button
          type="button"
          data-asr-dismiss-rest
          onClick={onDismissRest}
          className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          {t('asrDismissRest')}
        </button>
      )}

      {/*
        Both sentences are load-bearing. See the header.
      */}
      <p data-asr-caveat className="mt-2.5 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t('asrNotATeacher')} {t('asrCannotHear')}
      </p>
    </div>
  );
};

export default AsrSuggestions;
