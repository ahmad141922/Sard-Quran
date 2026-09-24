/**
 * «Where is the verse that goes…?»
 *
 * The thing a memoriser does constantly and the tool could not do at all. It
 * ends in one place — the marker moves and the page turns — because a search
 * that only tells you the number leaves you to find it by hand, which is the
 * fussing this whole tool exists to remove.
 *
 * The muṣḥaf text is already on the device, so this needs no network and works
 * in the middle of a majlis with the aeroplane mode on.
 *
 * ## The verse is shown in imlāʾī, not as the page prints it
 *
 * Deliberately. The result list is for *recognising* a verse in a hurry, and
 * the ʿUthmānī text needs a font that may not have loaded, would be far larger
 * on the line, and cannot be matched against character by character to show
 * where the phrase sits. The page behind it is the muṣḥaf; this is an index.
 */

import React, { useDeferredValue, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { DEFAULT_LIMIT, quranSearch, type SearchHit } from '@/lib/quran-search';
import type { QuranIndex } from '@/lib/quran-index';
import { surahName } from '@/lib/quran-data';

interface Props {
  index: QuranIndex;
  /** Takes the reciter there: the marker moves and the page turns with it. */
  onGo: (anchorId: number) => void;
  onClose: () => void;
}

export const QuranSearchBox: React.FC<Props> = ({ index, onGo, onClose }) => {
  const { t, dir } = useI18n();
  const [query, setQuery] = useState('');

  // Folding 6,236 verses is a few milliseconds and happens once; typing must
  // not wait for it, nor for the search of the keystroke before last.
  const search = useMemo(() => quranSearch(index), [index]);
  const typed = useDeferredValue(query);
  const hits = useMemo(() => search.find(typed), [search, typed]);

  const tooMany = hits.length >= DEFAULT_LIMIT;

  return (
    <div
      dir={dir}
      data-quran-search
      className="fixed inset-0 z-[200] flex flex-col bg-background/98 pt-safe pb-safe px-safe"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search size={16} className="shrink-0 text-muted-foreground" />
        <input
          data-search-input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
        />
        <button
          type="button"
          data-search-close
          onClick={onClose}
          aria-label={t('close')}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {/* Nothing typed yet: say what this is for rather than showing a void. */}
        {typed.trim().length === 0 && (
          <p data-search-idle className="mt-6 text-center text-xs text-muted-foreground">
            {t('searchHint')}
          </p>
        )}

        {typed.trim().length > 0 && hits.length === 0 && (
          <p data-search-empty className="mt-6 text-center text-xs text-muted-foreground">
            {t('searchNothing')}
          </p>
        )}

        {hits.length > 0 && (
          <>
            <div className="mb-1.5 text-[11px] text-muted-foreground">
              {hits.length}{tooMany ? '+' : ''}
            </div>
            <ul className="space-y-1">
              {hits.map(hit => (
                <li key={hit.anchorId}>
                  <button
                    type="button"
                    data-search-hit={hit.anchorId}
                    onClick={() => onGo(hit.anchorId)}
                    className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-start hover:bg-muted"
                  >
                    <div className="text-[11px] font-bold text-muted-foreground">
                      {surahName(hit.surah)} {hit.ayah}
                    </div>
                    <p dir="rtl" className="mt-0.5 text-[15px] leading-[1.9] text-foreground">
                      <Marked hit={hit} />
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {/*
              Said, not hidden. A list that silently stops at forty looks like
              the whole answer, and somebody counting occurrences of a word
              would be counting the wrong number.
            */}
            {tooMany && (
              <p data-search-more className="mt-2 text-center text-[11px] text-muted-foreground">
                {t('searchMore')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/** The verse with the phrase picked out, using the offsets the search returned. */
const Marked: React.FC<{ hit: SearchHit }> = ({ hit }) => (
  <>
    {hit.text.slice(0, hit.from)}
    <mark className="rounded bg-emerald-500/25 text-foreground">
      {hit.text.slice(hit.from, hit.to)}
    </mark>
    {hit.text.slice(hit.to)}
  </>
);

export default QuranSearchBox;
