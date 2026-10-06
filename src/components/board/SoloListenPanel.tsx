/**
 * The microphone, in a majlis where nobody is listening.
 *
 * It sits exactly where `CorrectionRecorder` sits in a majlis of two, and for
 * the mirrored reason: there, the shaykh's voice is the thing worth keeping;
 * here, there is no shaykh, and the most a machine can offer is to ask whether
 * something it noticed was a slip.
 *
 * ## What it will not do
 *
 * It never writes a note. A candidate becomes a note when the reciter presses
 * «yes», and never otherwise — see `asr/engine.ts`. Nothing on this screen
 * counts, totals or badges the pending list either: the moment a machine's
 * guess is tallied anywhere, it has become a record of what a person did.
 *
 * It draws nothing at all where the recogniser cannot run — the browser, a
 * build without the model, a device that refused the microphone. There is no
 * disabled button and no explanation, because a feature that cannot work is
 * better absent than advertised.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Mic, Square, Footprints } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { useAsrReview } from '@/lib/asr/use-asr';
import type { At } from '@/lib/asr/follow';
import { candidateDetail } from '@/lib/asr/review';
import { surahName } from '@/lib/quran-data';
import type { ReviewedCandidate } from '@/lib/asr/engine';
import { positionFromAnchor, type AyahPosition } from '@/lib/mushaf/position';
import type { CanonicalBook, EditionBook } from '@/lib/mushaf/position';
import type { QuranIndex } from '@/lib/quran-index';
import { positionLabel } from './recitation-shared';
import AsrSuggestions from './AsrSuggestions';


/** Whether the reciter has read how recording works — per device, a convenience only. */
const INTRO_KEY = 'sard:asr-intro-v1';
function introSeen(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; }
}
function markIntroSeen(): void {
  try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* shown again next time; harmless */ }
}

interface Props {
  index: QuranIndex;
  book: EditionBook;
  canonical: CanonicalBook;
  /** Where the marker is right now — the passage runs from press to press. */
  anchorNow: () => number | null;
  disabled?: boolean;
  /** Called only for a candidate the reciter accepted. */
  onAccept: (position: AyahPosition, detail: string) => void;
  /**
   * Moves the marker to a verse just finished, while the recitation runs.
   *
   * Absent means the marker never moves on its own. See `follow.ts` for why
   * this is verse-by-verse and never word-by-word.
   */
  onFollow?: (anchorId: number) => void;
  /**
   * The verse and word thought to be under way, reported as it changes.
   *
   * Lifted out because the page is drawn by the caller, not here: marking the
   * word being recited is something only the thing holding the page can do.
   * Null whenever nothing is being followed, so the caller can clear its mark
   * without knowing why — stopped, paused, or simply not switched on.
   */
  onAt?: (state: { listening: boolean; at: At | null }) => void;
}

export const SoloListenPanel: React.FC<Props> = ({
  index, book, canonical, anchorNow, disabled, onAccept, onFollow, onAt,
}) => {
  const { t } = useI18n();
  /*
   * Following is off until it is switched on, and the switch is remembered for
   * the session only. A marker that moves on its own is something a reciter
   * should have chosen, not something they discover happening to them.
   */
  const [followOn, setFollowOn] = useState(false);
  /** The first-use explainer is open — see `begin`. */
  const [intro, setIntro] = useState(false);
  const asr = useAsrReview(index, anchorNow, followOn ? onFollow : undefined);

  /*
   * Reported through an effect rather than from the poll, so the caller is told
   * once per render and is told about *leaving* the estimate too: switching
   * following off has to clear the mark on the page, and the poll that would
   * have said so is exactly the one that no longer runs.
   */
  const listening = followOn && asr.phase === 'listening';
  const at = listening ? asr.at : null;
  const told = useRef(onAt);
  told.current = onAt;
  useEffect(() => {
    told.current?.({ listening, at });
  }, [listening, at]);
  useEffect(() => () => { told.current?.({ listening: false, at: null }); }, []);

  // Not «hidden»: not rendered. See the header.
  if (asr.phase === 'unavailable') return null;

  const place = (anchorId: number) => positionFromAnchor(book, canonical, anchorId);

  /**
   * The verse's printed words, in the imlāʾī spelling the index counted.
   *
   * The ʿUthmānī text is a private-use encoding whose spacing does not line up
   * with them word for word, so it cannot be indexed into.
   */
  const wordsOf = (anchorId: number): string[] | null => {
    const text = index.verseById(anchorId)?.aya_text_emlaey;
    return text ? text.split(' ').filter(Boolean) : null;
  };

  const accept = (candidate: ReviewedCandidate) => {
    const position = place(candidate.anchorId);
    asr.say(candidate.id, 'accepted');
    // A candidate whose place cannot be expressed in this book is answered and
    // dropped rather than pinned to a guessed verse.
    if (!position) return;
    // The verse whose wording was said here travels into the note, so the
    // report — and the revision after it — names both places.
    const src = candidate.source;
    const detail = src
      ? `${candidateDetail(candidate, t)} — ${t('asrSourceNote')} ${surahName(src.surah)} ${src.ayah}`
      : candidateDetail(candidate, t);
    onAccept(position, detail);
  };

  const working = asr.phase === 'preparing' || asr.phase === 'reading';

  /*
    The first press explains before it records: what to do, what comes back,
    and that nothing is written without a «yes». Once — the reciter who has
    read it does not need it between every passage.
  */
  const begin = () => {
    if (introSeen()) asr.start();
    else setIntro(true);
  };
  const introGo = () => {
    markIntroSeen();
    setIntro(false);
    asr.start();
  };

  return (
    <div data-solo-listen className="w-full">
      {/*
        Both controls on one line. They are the pair a reciter sets before
        starting — record, and be followed — and stacking them pushed the page
        down by a row for no reason. The follow toggle is absent while the
        recitation runs, so the row simply narrows to the stop button.
      */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {asr.phase === 'listening' ? (
          <button
            type="button"
            data-asr-stop
            onClick={asr.stop}
            className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700"
          >
            <Square size={12} /> {t('asrStop')}
          </button>
        ) : (
          <button
            type="button"
            data-asr-start
            onClick={begin}
            disabled={disabled || working || intro || asr.phase === 'review' || asr.phase === 'consent'}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            {working ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
            {asr.phase === 'preparing'
              ? `${t('asrPreparing')}${asr.progress === null ? '' : ` ${Math.round(asr.progress * 100)}%`}`
              : asr.phase === 'reading' ? t('asrReading') : t('asrListen')}
          </button>
        )}

        {/*
          Offered only where the engine can report mid-recitation, and only
          before one starts — flipping it half way would leave the marker
          stranded wherever it had got to.
        */}
        {asr.canFollow && onFollow && asr.phase === 'idle' && (
          <button
            type="button"
            data-follow-toggle
            aria-pressed={followOn}
            onClick={() => setFollowOn(v => !v)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${
              followOn
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Footprints size={11} /> {t('followMarker')}
          </button>
        )}
      </div>

      {intro && asr.phase === 'idle' && (
        <div data-asr-intro className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
          <p className="font-bold text-foreground">{t('asrIntroTitle')}</p>
          <ol className="mt-1.5 list-decimal space-y-1 ps-4 text-muted-foreground">
            <li>{t('asrIntroStep1')}</li>
            <li>{t('asrIntroStep2')}</li>
            <li>{t('asrIntroStep3')}</li>
          </ol>
          <p className="mt-1.5 text-muted-foreground">{t('asrIntroScope')}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-asr-intro-go
              onClick={introGo}
              className="flex-1 rounded-full bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
            >
              {t('asrIntroGo')}
            </button>
            <button
              type="button"
              data-asr-intro-later
              onClick={() => setIntro(false)}
              className="flex-1 rounded-full border border-border px-3 py-1.5 font-bold text-muted-foreground hover:bg-muted"
            >
              {t('asrConsentLater')}
            </button>
          </div>
        </div>
      )}

      {/*
        The download is asked for, never assumed: about 70 MB the first time,
        then kept on the device. Saying no leaves the majlis exactly as it was.
      */}
      {asr.phase === 'consent' && asr.consentBytes !== null && (
        <div data-asr-consent className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
          <p className="font-bold text-foreground">{t('asrConsentTitle')}</p>
          <p className="mt-1 text-muted-foreground">
            {t('asrConsentBody').replace('{mb}', String(Math.round(asr.consentBytes / 1e6)))}
          </p>
          <p className="mt-1 text-muted-foreground">{t('asrNotATeacher')}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-asr-agree
              onClick={asr.agree}
              className="flex-1 rounded-full bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
            >
              {t('asrConsentAgree')}
            </button>
            <button
              type="button"
              data-asr-later
              onClick={asr.cancel}
              className="flex-1 rounded-full border border-border px-3 py-1.5 font-bold text-muted-foreground hover:bg-muted"
            >
              {t('asrConsentLater')}
            </button>
          </div>
        </div>
      )}

      {asr.phase === 'listening' && (
        <div data-asr-listening className="mt-1 text-center text-[10px] text-muted-foreground">
          {(() => {
            /*
              Where the recitation is thought to be, word by word.
              A live estimate and shown as one — faint, and it disappears the
              moment it cannot be placed. It is never what moves the marker;
              see `asr/follow.ts`.
            */
            const word = asr.at?.word;
            const words = asr.at ? wordsOf(asr.at.anchorId) : null;
            const said = word === null || word === undefined ? null : words?.[word];
            if (!said) return t('asrListening');
            return (
              <span data-at-word>
                {t('asrListening')}{' · '}
                <span dir="rtl" className="font-bold text-emerald-700 dark:text-emerald-400">
                  {said}
                </span>
              </span>
            );
          })()}
        </div>
      )}

      {asr.phase === 'review' && asr.review && (
        <div className="mt-2 max-h-[45vh] overflow-y-auto">
          <AsrSuggestions
            review={asr.review}
            label={anchorId => positionLabel(place(anchorId))}
            /*
              The verse itself, in the encoding the muṣḥaf font renders — the
              same words on the page behind this panel.

              It earns its space because the machine cannot say which *word*
              went wrong. The index numbers its sounds by phonetic group, not
              by written word: «هدى من ربهم» is one group, and pointing at a
              word from that would be right about a third of the time. So the
              verse is shown whole and the reciter, who knows what they just
              said, finds it in a second.
            */
            textOf={anchorId => index.verseById(anchorId)?.aya_text ?? null}
            wordsOf={wordsOf}
            textFont="HafsSmartCanvas, HafsSmart, serif"
            onAccept={accept}
            onDismiss={c => asr.say(c.id, 'dismissed')}
            onDismissRest={asr.sayRestFine}
            onPlay={asr.canPlay ? asr.play : undefined}
          />
          <button
            type="button"
            data-asr-done
            onClick={asr.clear}
            className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {t('close')}
          </button>
        </div>
      )}
    </div>
  );
};

export default SoloListenPanel;
