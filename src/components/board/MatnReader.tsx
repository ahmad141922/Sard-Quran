/**
 * The matn as it is recited from: lines that flow, not pages that turn.
 *
 * The muṣḥaf reader exists to hold a page still — the publisher's own plate,
 * its line endings, its word positions — because that is what the memoriser
 * learned by sight. A matn has no such thing. It is memorised as numbered
 * abyāt, and its printed layout carries none of the weight a muṣḥaf page
 * carries. So this reader is deliberately the opposite kind of thing: text
 * that reflows, scrolled rather than swiped.
 *
 * Two rules from the design carry through to every decision below:
 *
 * - **The bayt is the unit, the shaṭr is what a note pins to.** The teacher
 *   sees the whole line — the sense is not complete without both halves — and
 *   the note is fixed to the half the slip fell in.
 * - **The bāb replaces the page** as the boundary you know where you are by,
 *   so its title stays pinned at the top instead of a page number.
 */

import React, { useEffect, useMemo, useRef } from 'react';

import { useI18n } from '@/hooks/useI18n';
import type { Bayt, Matn, MatnBab } from '@/lib/matn/load';
import type { MatnPosition } from '@/lib/matn/position';
import type { Shatr } from '@/lib/matn/registry';
import { MUSHAF_SURFACE } from './recitation-shared';

interface ShatrLabels { bayt: string; sadr: string; ajz: string }

interface Props {
  matn: Matn;
  /** Where the marker is. The line is highlighted; the shaṭr more so. */
  current: MatnPosition;
  /** A tap on half a line — pins the position there. */
  onPick: (bayt: number, shatr: Shatr) => void;
  /** Whether the reader follows the marker when it moves from outside. */
  followCurrent?: boolean;
  /**
   * The first bayt whose text is covered, or null when nothing is.
   *
   * Everything from here on is hidden and everything before it stays legible —
   * which is how a hand covers a printed page, and it means the lines already
   * recited are still there to look back at.
   */
  hideFrom?: number | null;
  /** Uncovers the line the marker is on. Absent when nothing is covered. */
  onReveal?: () => void;
  dir?: 'rtl' | 'ltr';
}

const MatnReader: React.FC<Props> = ({
  matn, current, onPick, followCurrent = true, hideFrom = null, onReveal, dir = 'rtl',
}) => {
  const { t } = useI18n();
  const currentRef = useRef<HTMLDivElement>(null);

  /**
   * Lines grouped under their chapter, once.
   *
   * The file is already ordered and already validated to tile the matn
   * exactly, so this is a fold rather than a search — no line can fall outside
   * a bāb, and the loader has refused the file if one could.
   */
  const chapters = useMemo(
    () => matn.abwab.map(bab => ({
      bab,
      abyat: matn.abyat.slice(bab.from - 1, bab.to),
    })),
    [matn],
  );

  // Bring the marker into view when it moves from outside — the finish button
  // or a jump — but never mid-scroll: `nearest` leaves a line already on
  // screen exactly where the reciter is looking at it.
  useEffect(() => {
    if (!followCurrent) return;
    // Optional call: not every environment the reader renders in has it.
    currentRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [current.bayt, current.shatr, followCurrent]);

  return (
    <div dir={dir} className={`h-full overflow-y-auto ${MUSHAF_SURFACE}`}>
      {chapters.map(({ bab, abyat }) => (
        <section key={bab.n} aria-labelledby={`bab-${bab.n}`}>
          {/*
            The bāb title, pinned. It is what tells the teacher where in the
            matn they are — the job a page number does in the muṣḥaf — so it
            has to stay legible while the lines under it move.
          */}
          <h2
            id={`bab-${bab.n}`}
            className="sticky top-0 z-10 border-b border-emerald-900/10 bg-[#fdf8ef]/95 px-4 py-2
              text-xs font-bold text-emerald-900/70 backdrop-blur
              dark:border-emerald-100/10 dark:bg-[#171512]/95 dark:text-emerald-100/70"
          >
            {babTitle(bab, dir)}
          </h2>

          <ol className="px-2 py-1 sm:px-4">
            {abyat.map(bayt => (
              <BaytRow
                key={bayt.n}
                bayt={bayt}
                isCurrent={bayt.n === current.bayt}
                currentShatr={current.shatr}
                onPick={onPick}
                labels={{ bayt: t('recBayt'), sadr: t('recSadr'), ajz: t('recAjz') }}
                rowRef={bayt.n === current.bayt ? currentRef : undefined}
                covered={hideFrom !== null && bayt.n >= hideFrom}
                onReveal={onReveal}
                revealLabel={t('matnVeilReveal')}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

const babTitle = (bab: MatnBab, dir: 'rtl' | 'ltr') => (dir === 'rtl' ? bab.titleAr : bab.titleEn);

/**
 * One line: two halves with the gutter a printed dīwān puts between them.
 *
 * On a narrow screen the halves stack instead, because squeezing both into a
 * phone's width would either shrink the type past reading or break the
 * vowelling across lines — and the ḍabṭ is the thing a note is taken against.
 */
const BaytRow: React.FC<{
  bayt: Bayt;
  isCurrent: boolean;
  currentShatr: Shatr;
  onPick: (bayt: number, shatr: Shatr) => void;
  labels: ShatrLabels;
  rowRef?: React.Ref<HTMLDivElement>;
  covered?: boolean;
  onReveal?: () => void;
  revealLabel?: string;
}> = ({ bayt, isCurrent, currentShatr, onPick, labels, rowRef, covered, onReveal, revealLabel }) => (
  <li>
    <div
      ref={rowRef}
      data-bayt={bayt.n}
      data-current={isCurrent || undefined}
      data-covered={covered || undefined}
      className={`flex flex-col items-stretch gap-0 rounded-lg py-0.5 transition-colors sm:flex-row sm:items-baseline sm:gap-6
        ${isCurrent ? 'bg-emerald-600/[0.07] dark:bg-emerald-300/[0.07]' : ''}`}
    >
      <ShatrButton
        bayt={bayt}
        shatr="sadr"
        text={bayt.sadr}
        covered={covered}
        pinned={isCurrent && currentShatr === 'sadr'}
        onPick={onPick}
        labels={labels}
        align="text-start"
      />
      <ShatrButton
        bayt={bayt}
        shatr="ajz"
        text={bayt.ajz}
        covered={covered}
        pinned={isCurrent && currentShatr === 'ajz'}
        onPick={onPick}
        labels={labels}
        align="text-start sm:text-end"
      />
      {/*
        The way out of the cover, and it is offered on the marker's line only.
        Revealing is not peeking — it is the second half of the exercise: recite
        the line, then look at it. So it is a plain tap rather than the muṣḥaf's
        press-and-hold, which exists there to make glancing cost something.
      */}
      {covered && isCurrent && onReveal && (
        <button
          type="button"
          data-reveal-bayt
          onClick={onReveal}
          className="mx-2 my-1 shrink-0 self-center rounded-full border border-emerald-600/40 bg-emerald-600/10
            px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-600/20
            dark:text-emerald-200 sm:order-last"
        >
          {revealLabel}
        </button>
      )}
      {/*
        The line number sits outside the halves and is not a tap target: it
        says where you are, and tapping it would pin a position without saying
        which half — the one thing a note here must always know.
      */}
      <span
        aria-hidden
        className="order-first shrink-0 select-none px-2 text-[10px] tabular-nums text-emerald-900/35 dark:text-emerald-100/30 sm:order-none sm:w-8 sm:text-center"
      >
        {bayt.n}
      </span>
    </div>
  </li>
);

const ShatrButton: React.FC<{
  bayt: Bayt;
  shatr: Shatr;
  text: string;
  pinned: boolean;
  covered?: boolean;
  onPick: (bayt: number, shatr: Shatr) => void;
  labels: ShatrLabels;
  align: string;
}> = ({ bayt, shatr, text, pinned, covered, onPick, labels, align }) => (
  <button
    type="button"
    onClick={() => onPick(bayt.n, shatr)}
    data-shatr={shatr}
    data-pinned={pinned || undefined}
    aria-pressed={pinned}
    // Says the place, not the action: a reciter scanning by ear needs to know
    // which half they are about to pin, and "note" would name the wrong thing.
    aria-label={`${labels.bayt} ${bayt.n} — ${shatr === 'sadr' ? labels.sadr : labels.ajz}`}
    className={`relative flex-1 rounded-md px-2 py-1 font-[Amiri,serif] text-[1.35rem] leading-[2.05] text-foreground
      transition-colors hover:bg-emerald-600/[0.06] dark:hover:bg-emerald-300/[0.06] ${align}
      ${pinned ? 'bg-emerald-600/15 shadow-[inset_0_-2px_0_theme(colors.emerald.600)] dark:bg-emerald-300/15' : ''}`}
  >
    {/*
      The words are always here and the cover sits over them, rather than the
      two taking turns.

      Two reasons, and neither is decoration. A line that swaps a short bar for
      full-height text jumps the whole page down as it is revealed, right at the
      moment the reciter is looking at it. And nothing can fade between two
      things only one of which exists — the reveal has to be a crossfade, so
      both have to be on the page.
    */}
    <span
      className={`block transition-opacity duration-300 ease-out ${covered ? 'opacity-0' : 'opacity-100'}`}
    >
      {text}
    </span>
    {/*
      One bar of a fixed width — not the text blurred, and not a dash per word.
      Both of those leak what is being tested: a memoriser reads the shape of a
      line, and counting a shaṭr's words is most of remembering it.
    */}
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-2 top-1/2 h-4 -translate-y-1/2 rounded
        bg-emerald-900/15 transition-opacity duration-300 ease-out dark:bg-emerald-100/15
        ${covered ? 'opacity-100' : 'opacity-0'}`}
    />
  </button>
);

export default MatnReader;
