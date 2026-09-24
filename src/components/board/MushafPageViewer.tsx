import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { getPlate, prefetchPlatesAround } from '@/lib/mushaf/page-plate';
import { mushafFullName, type MushafDefinition } from '@/lib/mushaf/registry';

export interface AyahRef { surah: number; ayah: number }

interface Props {
  mushaf: MushafDefinition;
  /** Printed page number, in this edition's own numbering. */
  page: number;
  selected?: AyahRef | null;
  /** Verses carrying a reader's note, tinted so the page shows its own margin. */
  marked?: AyahRef[];
  /**
   * Verses hidden because they have not been recited yet.
   *
   * Covered exactly where each one sits, which is what the polygon layer makes
   * possible: the unit is the āyah, not the line it happens to share.
   */
  covered?: AyahRef[];
  onSelectAyah?: (ref: AyahRef) => void;
  className?: string;
}

/**
 * Shows a real muṣḥaf page and nothing else.
 *
 * The browser does not lay this page out — it is the publisher's own vector
 * page, inlined so the ayah-polygon layer inside it stays clickable. No word
 * positioning, no font fitting, no reflow: if it looks wrong, the asset is
 * wrong, not the CSS.
 *
 * It knows no riwaya and no page number of its own: give it a definition and a
 * page and it renders that. Adding an edition never touches this file.
 */
/**
 * Marks every polygon of one ayah. An ayah can span several — two lines, or a
 * wrap — so all of them are selected, not the first.
 */
function applyHighlight(
  host: HTMLElement,
  selected: AyahRef | null | undefined,
  marked?: AyahRef[],
  covered?: AyahRef[],
) {
  for (const el of host.querySelectorAll(
    '.ayahPolygon.is-selected, .ayahPolygon.is-marked, .ayahPolygon.is-covered',
  )) {
    el.classList.remove('is-selected', 'is-marked', 'is-covered');
  }
  const paint = (ref: AyahRef, className: string) => {
    for (const el of host.querySelectorAll(
      `.ayahPolygon[surah="${ref.surah}"][ayah="${ref.ayah}"]`,
    )) el.classList.add(className);
  };
  for (const ref of marked ?? []) paint(ref, 'is-marked');
  if (selected) paint(selected, 'is-selected');
  // Last, so a covered āyah stays covered even where it is also the marker's.
  for (const ref of covered ?? []) paint(ref, 'is-covered');
}

const MushafPageViewer: React.FC<Props> = ({
  mushaf, page, selected, marked, covered, onSelectAyah, className,
}) => {
  const { t, lang } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  // Bumping this re-runs the fetch: a page that failed on a dropped connection
  // is one tap from being here, and a blank rectangle explains nothing.
  const [attempt, setAttempt] = useState(0);
  // The marker as of this moment, for the injection below: a page already in
  // the cache resolves inside the same tick, so the highlight effect can run
  // against the outgoing page and be wiped by the incoming one — and never run
  // again, because `state` began and ended as 'ready'. Turning back to a page
  // just visited would show it unmarked.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Read through a ref for the same reason the selection is: the plate arrives
  // from a promise, and the effect that receives it holds the render it started in.
  const markedRef = useRef(marked);
  markedRef.current = marked;
  // And the cover, for the same reason again.
  const coveredRef = useRef(covered);
  coveredRef.current = covered;

  useEffect(() => {
    let alive = true;
    setState('loading');

    getPlate(mushaf, page)
      .then(svg => {
        if (!alive) return;
        const host = hostRef.current;
        if (!host) return;
        if (!svg) { setState('error'); return; }
        // The outgoing page stays until this instant: the plate arrives with
        // its ink already decoded, so the swap is a single frame and there is
        // no blank rectangle in between to announce.
        host.replaceChildren(svg);
        applyHighlight(host, selectedRef.current, markedRef.current, coveredRef.current);
        setState('ready');
        // Warm the neighbours only once this page is on screen, so a fast
        // page-turn never waits behind a prefetch.
        prefetchPlatesAround(mushaf, page);
      })
      .catch(() => { if (alive) setState('error'); });

    return () => { alive = false; };
  }, [mushaf, page, attempt]);

  // Highlight by class, not by rewriting fills — the Qur'anic glyphs are never
  // recoloured, only the transparent polygon above them.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || state !== 'ready') return;
    applyHighlight(host, selected, marked, covered);
  }, [selected, marked, covered, state, page]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const poly = (e.target as Element).closest?.('.ayahPolygon');
    if (!poly) return;
    const surah = Number(poly.getAttribute('surah'));
    const ayah = Number(poly.getAttribute('ayah'));
    if (surah > 0 && ayah > 0) onSelectAyah?.({ surah, ayah });
  }, [onSelectAyah]);

  if (state === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${className ?? ''}`}>
        <p className="text-sm text-muted-foreground">{t('recPageLoadFailed').replace('{n}', String(page))}</p>
        <button
          onClick={() => setAttempt(n => n + 1)}
          className="rounded-lg border border-emerald-600/40 px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-600/10 dark:text-emerald-300"
        >
          {t('recRetry')}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      onClick={handleClick}
      data-mushaf-page
      data-state={state}
      className={className}
      role="img"
      aria-label={`${mushafFullName(mushaf, lang)} — ${t('recPage')} ${page}`}
    />
  );
};

export default MushafPageViewer;
