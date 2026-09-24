import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, List, Moon, Pencil, Search, StickyNote, Sun, Trash2, X,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/lib/theme';
import { loadQuranFont, localeDigits, surahName, surahNameAr, toArabicIndic, SURAHS } from '@/lib/quran-data';
import type { QuranIndex } from '@/lib/quran-index';
import { useMushaf } from '@/lib/mushaf/MushafProvider';
import { useMushafPageIndex } from '@/lib/mushaf/page-index';
import { hasPageAsset, useMushafCoverage } from '@/lib/mushaf/coverage';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
import { positionFromAnchor, positionInEdition } from '@/lib/mushaf/position';
import { getMushaf, mushafFullName, riwayaName } from '@/lib/mushaf/registry';
import { isTap, pageIntentOf } from '@/lib/mushaf/swipe';
import { usePageTurn } from '@/lib/mushaf/use-page-turn';
import {
  addNote, isBookmarked, loadMarks, noteOn, notesAmong, recentFirst, removeBookmark, removeNote,
  saveMarks, toggleBookmark, type ReadingMarks, type ReadingNote,
} from '@/lib/mushaf/reading-marks';
import { arabicCount } from '@/lib/recitation-session';
import { foldQuranText, searchMushaf, type ReaderHit, type ReaderJump } from '@/lib/mushaf/reader-search';
import MushafPageViewer from './MushafPageViewer';
import MushafPicker from './MushafPicker';
import LangToggle from './LangToggle';
import { MUSHAF_SURFACE, SurahBand } from './recitation-shared';

/**
 * The muṣḥaf, and nothing else.
 *
 * A majlis records: it asks who is reciting, to whom, from where and how far,
 * and every tap it takes means something afterwards. Most of the time nobody
 * wants any of that — they want to open the Book at a page and read. So this
 * is the same pages with the machinery taken out: no names, no notes, no
 * timer, no progress, nothing saved but the page you stopped at.
 *
 * The one choice it keeps is the riwaya, because that is the difference
 * between one muṣḥaf and another rather than a setting.
 *
 * What it adds instead is the way in: an index that lists the surahs, the
 * thirty juz' and the pages, and one search box that takes a reference, a
 * name, a number, or a line you half remember.
 */

const PAGE_KEY = 'tajweedoo:reading-page';

/** Which riwaya a mark was made in — said only when it is not this one. */
function riwayaOf(mushafId: string, lang: 'ar' | 'en' | 'fr' | 'de' | 'es'): string {
  const def = getMushaf(mushafId);
  return def ? riwayaName(def.riwayaId, lang) : mushafId;
}

function storedPages(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved && typeof saved === 'object' ? saved as Record<string, number> : {};
  } catch { return {}; }
}

interface Props {
  index: QuranIndex;
  onClose: () => void;
  /**
   * Where this screen says what its own back button should close.
   *
   * The shell around it can see that the reader is open; it cannot see that an
   * index sheet is open over it, and would close the reader out from under a
   * sheet the reader could have closed itself. Optional, because the board
   * embeds this too and a browser has no such button.
   */
  back?: React.MutableRefObject<(() => boolean) | null>;
  /**
   * Open here rather than where this muṣḥaf was last left.
   *
   * Read once, on mount, and deliberately not followed afterwards: the page
   * turner owns the page from then on, and an effect chasing this would drag
   * the reader back every time the riwaya changed. Whoever opens the reader at
   * a page opens it fresh — see the progress screen.
   */
  openAt?: number | null;
}

const MushafReader: React.FC<Props> = ({ index, onClose, back, openAt }) => {
  const { t, lang, dir } = useI18n();
  const [theme, toggleTheme] = useTheme();
  const { mushaf } = useMushaf();
  const coverageVersion = useMushafCoverage(mushaf);
  const editionPages = useMushafPageIndex(mushaf);
  const canonical = useMemo(() => canonicalBookFromQuranIndex(index), [index]);
  const book = useMemo(() => editionBook(mushaf, editionPages, canonical), [mushaf, editionPages, canonical]);

  const firstPage = mushaf.firstPageNumber;
  const lastPage = mushaf.firstPageNumber + mushaf.pageCount - 1;
  const clamp = useCallback(
    (p: number) => Math.min(lastPage, Math.max(firstPage, p)),
    [firstPage, lastPage],
  );

  /**
   * Where this muṣḥaf was left open.
   *
   * Per edition, not one number for all of them: the Warsh page 100 and the
   * Hafs page 100 are different places, and a reader who switches riwaya is
   * not asking to be moved.
   */
  const [page, setPage] = useState(
    () => clamp(openAt ?? storedPages()[mushaf.id] ?? mushaf.firstPageNumber),
  );
  const [sheet, setSheet] = useState<null | 'index' | 'search'>(null);
  /** The verse a jump landed on, or the one the reader just tapped. */
  const [landed, setLanded] = useState<{ surah: number; ayah: number } | null>(null);
  /**
   * The reader's own margin — notes on verses, marks on pages.
   *
   * Held in one object and written whole: it is a handful of kilobytes, and a
   * note is worth nothing if it is not on disk the instant it is written.
   */
  const [marks, setMarks] = useState<ReadingMarks>(() => loadMarks());
  const write = useCallback((next: ReadingMarks) => { setMarks(next); saveMarks(next); }, []);
  /** The verse whose note is being written, and the text so far. */
  const [editing, setEditing] = useState<{ anchorId: number; surah: number; ayah: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => { loadQuranFont('hafs').then(() => setFontReady(true)).catch(() => setFontReady(true)); }, []);

  /**
   * The place being read, in the language the two books share.
   *
   * Kept as an anchor rather than a page: page 133 of the Madinah muṣḥaf and
   * page 133 of another print are different places, and the verse numbers
   * themselves differ between riwayat. The anchor is what survives the change.
   */
  const anchorRef = useRef<number | null>(null);
  useEffect(() => {
    const first = book?.pages.ayahsOfPage(page)[0];
    if (!book || !first) return;
    anchorRef.current = positionInEdition(book, canonical, first)?.anchor.id ?? anchorRef.current;
  }, [book, canonical, page]);

  /**
   * Changing riwaya keeps the place if there is one to keep, and otherwise
   * reopens that book where it was last left.
   */
  const bookId = book?.def.id;
  useEffect(() => {
    if (!book) return;
    const anchor = anchorRef.current;
    const carried = anchor === null ? null : positionFromAnchor(book, canonical, anchor);
    const at = carried ? book.pages.pageOf(carried.surah, carried.ayah) : undefined;
    setPage(clamp(at ?? storedPages()[mushaf.id] ?? mushaf.firstPageNumber));
    setLanded(null);
    // Only when the book itself changes: following `page` here would fight the
    // page turner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    try { localStorage.setItem(PAGE_KEY, JSON.stringify({ ...storedPages(), [mushaf.id]: page })); }
    catch { /* private mode: the page is still on screen */ }
  }, [mushaf.id, page]);

  const turnDirection = usePageTurn(page);

  const turn = useCallback((delta: number) => {
    setPage(p => clamp(p + delta));
    setLanded(null);
  }, [clamp]);

  /** Where a search result or an index row sends the reader. */
  const go = useCallback((jump: ReaderJump) => {
    setSheet(null);
    if (jump.kind === 'page') { setPage(clamp(jump.page)); setLanded(null); return; }
    const target = jump.kind === 'juz'
      ? index.locOf(index.juzRanges[jump.juz - 1]?.firstId ?? 1)
      : jump.kind === 'surah'
        ? { surah: jump.surah, ayah: 1 }
        : { surah: jump.surah, ayah: jump.ayah };
    if (!target) return;
    const at = book?.pages.pageOf(target.surah, target.ayah);
    if (at !== undefined) setPage(clamp(at));
    setLanded({ surah: target.surah, ayah: target.ayah });
  }, [book, clamp, index]);

  // ── turning ──
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { down.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (isTap(dx, dy)) {
      // A tap on either edge turns; the middle is left alone so a reader can
      // rest a thumb on the page.
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - box.left;
      if (x < box.width * 0.25) turn(1);
      else if (x > box.width * 0.75) turn(-1);
      return;
    }
    const intent = pageIntentOf(dx, dy);
    if (intent) turn(intent === 'next' ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) { if (e.key === 'Escape') setSheet(null); return; }
      if (e.key === 'ArrowLeft') turn(1);
      else if (e.key === 'ArrowRight') turn(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, turn, onClose]);

  /**
   * The same unwinding for Android's back button, outermost layer last — a note
   * being written, then a sheet over the page, then the verse bar. Returning
   * false hands the press up, and the shell closes the reader.
   */
  useEffect(() => {
    if (!back) return;
    const handler = () => {
      if (editing) { setEditing(null); setDraft(''); return true; }
      if (sheet) { setSheet(null); return true; }
      if (landed) { setLanded(null); return true; }
      return false;
    };
    back.current = handler;
    // Cleared only while it is still ours: two screens sharing this slot must
    // not have the one that is leaving unregister the one that arrived.
    return () => { if (back.current === handler) back.current = null; };
  }, [back, editing, sheet, landed]);

  // ── the page itself ──
  const facsimile = useMemo(
    () => (hasPageAsset(mushaf, page) ? page : null),
    // coverageVersion re-runs this once the manifest lands.
    [mushaf, page, coverageVersion],
  );

  /** The text layer's page for the fallback renderer. */
  const textPage = useMemo(() => {
    const first = book?.pages.ayahsOfPage(page)[0];
    if (!first) return page;
    const id = index.idOf(first.surah, first.ayah);
    return id === undefined ? page : index.pageOf(id);
  }, [book, index, page]);

  const wordLines = useMemo(() => index.pageWordLines(textPage), [index, textPage]);
  const pageVerses = useMemo(() => index.pageFragments(textPage), [index, textPage]);
  const differentCounting = mushaf.ayahCounting !== canonical.scheme;

  const landedId = landed ? index.idOf(landed.surah, landed.ayah) : undefined;

  /**
   * The verses of this page, each with the anchor that names it in every
   * edition — the pairing every mark on this screen is matched through.
   */
  const pageAyahs = useMemo(() => {
    if (!book) return [];
    return book.pages.ayahsOfPage(page).map(ref => ({
      ...ref,
      anchorId: positionInEdition(book, canonical, ref)?.anchor.id,
    }));
  }, [book, canonical, page]);

  /** Which of them the reader has written on — the plate tints these. */
  const marked = useMemo(() => {
    const written = new Set(
      notesAmong(marks, pageAyahs.map(a => a.anchorId).filter((id): id is number => id !== undefined))
        .map(n => n.anchorId),
    );
    return pageAyahs.filter(a => a.anchorId !== undefined && written.has(a.anchorId))
      .map(({ surah, ayah }) => ({ surah, ayah }));
  }, [marks, pageAyahs]);

  /** The verse under the reader's finger, and whatever is written on it. */
  const selectedAnchor = useMemo(() => {
    if (!landed || !book) return undefined;
    return positionInEdition(book, canonical, landed)?.anchor.id;
  }, [book, canonical, landed]);
  const selectedNote = selectedAnchor === undefined ? undefined : noteOn(marks, selectedAnchor);

  const pageBookmarked = isBookmarked(marks, mushaf.id, page);
  const toggleThisPage = useCallback(() => {
    const anchor = pageAyahs[0]?.anchorId;
    if (anchor === undefined) return;
    write(toggleBookmark(marks, { anchorId: anchor, mushafId: mushaf.id, page }));
  }, [marks, mushaf.id, page, pageAyahs, write]);

  const openNote = useCallback(() => {
    if (!landed || selectedAnchor === undefined) return;
    setEditing({ anchorId: selectedAnchor, surah: landed.surah, ayah: landed.ayah });
    setDraft(selectedNote?.text ?? '');
  }, [landed, selectedAnchor, selectedNote]);

  const saveDraft = useCallback(() => {
    if (!editing) return;
    write(addNote(marks, {
      anchorId: editing.anchorId,
      mushafId: mushaf.id,
      surah: editing.surah,
      ayah: editing.ayah,
      text: draft,
    }));
    setEditing(null);
    setDraft('');
  }, [draft, editing, marks, mushaf.id, write]);

  /**
   * Where this page is in the Book.
   *
   * A page number alone says nothing — 294 is a number, «الكهف · جزء ١٥» is a
   * place. Read off the page's own first verse, so it follows every turn
   * without anything having to be tracked.
   */
  const where = useMemo(() => {
    const first = book?.pages.ayahsOfPage(page)[0];
    if (!first) return null;
    const id = index.idOf(first.surah, first.ayah);
    const juz = id === undefined ? undefined : index.locOf(id)?.juz;
    return { surah: first.surah, juz };
  }, [book, index, page]);

  return (
    // `*-safe`: the reader fills the window, which on a phone reaches under the
    // status bar and the gesture bar — and the two things it pins there are the
    // toolbar and the page-turn footer. Zero everywhere else.
    <div dir={dir} className={`fixed inset-0 z-50 flex flex-col pt-safe pb-safe px-safe ${MUSHAF_SURFACE}`}>
      {/* ── the bar: out, the book, the two ways in ── */}
      <header className="flex shrink-0 items-center gap-1 border-b border-emerald-900/10 px-2 py-1.5 dark:border-emerald-100/10 sm:gap-2 sm:px-3">
        <button
          onClick={onClose}
          data-a11y-tap
          aria-label={t('close')}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
        >
          <X size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <MushafPicker className="max-w-[220px]" compact />
        </div>

        <button
          onClick={toggleThisPage}
          data-a11y-tap
          aria-pressed={pageBookmarked}
          aria-label={pageBookmarked ? t('readBookmarked') : t('readBookmark')}
          title={pageBookmarked ? t('readBookmarked') : t('readBookmark')}
          className={`rounded-lg p-1.5 transition-colors sm:p-2 ${
            pageBookmarked ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {pageBookmarked ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        </button>
        <button
          onClick={() => setSheet('search')}
          data-a11y-tap
          aria-label={t('readSearch')}
          title={t('readSearch')}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
        >
          <Search size={18} />
        </button>
        <button
          onClick={() => setSheet('index')}
          data-a11y-tap
          aria-label={t('readIndex')}
          title={t('readIndex')}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
        >
          <List size={18} />
        </button>
        <button
          onClick={toggleTheme}
          data-a11y-tap
          aria-label={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <LangToggle iconOnly className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2" />
      </header>

      {/* ── the page ── */}
      <div
        className="relative min-h-0 flex-1 overflow-y-auto"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { down.current = null; }}
        style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {facsimile !== null ? (
          /* Keyed by page so React remounts it and the turn animation runs. */
          <div key={facsimile} data-turn={turnDirection} className="flex h-full w-full items-center justify-center px-2 pb-2 pt-2">
            <MushafPageViewer
              mushaf={mushaf}
              page={facsimile}
              selected={landed ?? undefined}
              marked={marked}
              onSelectAyah={ref => setLanded(ref)}
              className="flex h-full max-h-full w-full items-center justify-center [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full"
            />
          </div>
        ) : differentCounting ? (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {t('recPageUnavailableIn').replace('{name}', mushafFullName(mushaf, lang))}
          </div>
        ) : !fontReady ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t('recLoadingMushaf')}</div>
        ) : (
          <div
            key={page}
            data-turn={turnDirection}
            dir="rtl"
            className="mx-auto w-full max-w-3xl px-4 py-4 text-lg sm:text-2xl"
            style={{ fontFamily: 'HafsSmartCanvas, HafsSmart, serif', lineHeight: 2.1, textAlign: 'justify', textAlignLast: 'center' }}
          >
            {wordLines.length > 0 ? wordLines.map((line, li) => (
              <React.Fragment key={li}>
                {line[0]?.opensSurah && <SurahBand name={surahNameAr(line[0].surah)} />}
                <div className="flex items-baseline justify-between gap-1 whitespace-nowrap">
                  {line.map((w, wi) => (
                    <span
                      key={wi}
                      onClick={() => setLanded({ surah: w.surah, ayah: w.ayah })}
                      className={`cursor-pointer rounded ${w.ayahId === landedId ? 'bg-emerald-500/20' : ''}`}
                    >
                      {w.text}
                    </span>
                  ))}
                </div>
              </React.Fragment>
            )) : pageVerses.map(({ verse: v, from, to }, i) => {
              const prev = pageVerses[i - 1]?.verse;
              const tokens = v.aya_text.trim().split(/\s+/);
              const shown = tokens.slice(from, to < 0 ? undefined : to).join(' ');
              const opensSurah = (!prev || prev.sura_no !== v.sura_no) && v.aya_no === 1 && from === 0;
              return (
                <React.Fragment key={`${v.id}-${from}`}>
                  {opensSurah && <SurahBand name={surahNameAr(v.sura_no)} />}
                  <span
                    onClick={() => setLanded({ surah: v.sura_no, ayah: v.aya_no })}
                    className={`cursor-pointer rounded ${v.id === landedId ? 'bg-emerald-500/20' : ''}`}
                  >{shown} </span>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/*
        A verse was tapped.

        Reading mode records nothing on its own, so a tap has to offer
        something or it is a highlight that does nothing. What it offers is the
        margin: write on this verse, read what was written, or take it off.
      */}
      {landed && selectedAnchor !== undefined && !editing && (
        <div className="flex shrink-0 items-center gap-2 border-t border-amber-600/25 bg-amber-500/[0.07] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs">
            <span className="font-bold">{surahName(landed.surah, lang)} {localeDigits(landed.ayah, lang)}</span>
            {selectedNote && <span className="ms-2 text-muted-foreground">{selectedNote.text}</span>}
          </span>
          {selectedNote && (
            <button
              onClick={() => write(removeNote(marks, selectedNote.id))}
              data-a11y-tap
              aria-label={t('recDelete')}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={openNote}
            data-a11y-tap
            className="flex items-center gap-1.5 rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600"
          >
            {selectedNote ? <Pencil size={14} /> : <StickyNote size={14} />}
            {selectedNote ? t('readEditNote') : t('readAddNote')}
          </button>
          <button
            onClick={() => setLanded(null)}
            data-a11y-tap
            aria-label={t('close')}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* The note itself — one field, because that is the whole of it. */}
      {editing && (
        <div className="shrink-0 border-t border-amber-600/25 bg-amber-500/[0.07] px-3 py-2.5">
          <div className="mb-1.5 text-xs font-bold">
            {surahName(editing.surah, lang)} {localeDigits(editing.ayah, lang)}
          </div>
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDraft(); }
              if (e.key === 'Escape') { setEditing(null); setDraft(''); }
            }}
            placeholder={t('readNotePlaceholder')}
            aria-label={t('readAddNote')}
            className="w-full resize-none rounded-lg border-2 border-amber-600/30 bg-background px-3 py-2 text-sm text-foreground outline-none ring-amber-500/20 focus:border-amber-600 focus:ring-2"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={saveDraft}
              className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700"
            >
              {t('recSave')}
            </button>
            <button
              onClick={() => { setEditing(null); setDraft(''); }}
              className="rounded-lg bg-muted px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted/70"
            >
              {t('recCancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── where you are, and the two ways on ── */}
      <footer className="flex shrink-0 items-center justify-center gap-4 border-t border-emerald-900/10 px-3 py-2 dark:border-emerald-100/10">
        <button
          onClick={() => turn(-1)}
          disabled={page <= firstPage}
          data-a11y-tap
          aria-label={t('recPrevPage')}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight size={20} className="rtl:hidden" />
          <ChevronLeft size={20} className="hidden rtl:block" />
        </button>
        <span className="min-w-0 text-center text-sm">
          {where && (
            <span className="font-bold text-foreground">
              {surahName(where.surah, lang)}
              {where.juz !== undefined && (
                <span className="font-normal text-muted-foreground"> · 
                  {t('recJuzWord')} {localeDigits(where.juz, lang)}
                </span>
              )}
            </span>
          )}
          <span className="font-bold tabular-nums">{where ? " · " : ""}{t('recPage')} {localeDigits(page, lang)}</span>
        </span>
        <button
          onClick={() => turn(1)}
          disabled={page >= lastPage}
          data-a11y-tap
          aria-label={t('recNextPage')}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft size={20} className="rtl:hidden" />
          <ChevronRight size={20} className="hidden rtl:block" />
        </button>
      </footer>

      {sheet === 'index' && (
        <IndexSheet
          index={index}
          book={book}
          marks={marks}
          mushafId={mushaf.id}
          onGo={go}
          onRemoveNote={id => write(removeNote(marks, id))}
          onRemoveBookmark={id => write(removeBookmark(marks, id))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'search' && <SearchSheet index={index} onGo={go} onClose={() => setSheet(null)} />}
    </div>
  );
};

/** A sheet that covers the page rather than sitting beside it — one hand, one screen. */
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  // The label used to be the glyph itself, which a screen reader reads out as
  // the character and nothing else — «✕» is a drawing, not a word.
  const { t } = useI18n();
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-extrabold">{title}</h2>
        <button
          onClick={onClose}
          data-a11y-tap
          aria-label={t('close')}
          title={t('close')}
          className="flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
};

const Row: React.FC<{ onClick: () => void; title: string; detail?: string; trailing?: string }> = ({ onClick, title, detail, trailing }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 text-start transition-colors hover:bg-accent"
  >
    <span className="min-w-0">
      <span className="block truncate text-sm font-bold">{title}</span>
      {detail && <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>}
    </span>
    {trailing && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{trailing}</span>}
  </button>
);

/**
 * The index: the surahs, the thirty juz', and a page to go to.
 *
 * Three tabs rather than one long scroll, because they are three different
 * questions — "which surah", "which juz'", "which page" — and mixing them
 * makes each of them slower to answer.
 */
const IndexSheet: React.FC<{
  index: QuranIndex;
  book: ReturnType<typeof editionBook>;
  marks: ReadingMarks;
  mushafId: string;
  onGo: (jump: ReaderJump) => void;
  onRemoveNote: (id: string) => void;
  onRemoveBookmark: (id: string) => void;
  onClose: () => void;
}> = ({ index, book, marks, mushafId, onGo, onRemoveNote, onRemoveBookmark, onClose }) => {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<'surah' | 'juz' | 'page' | 'marks'>('surah');
  const [filter, setFilter] = useState('');
  const [pageInput, setPageInput] = useState('');

  const pageOf = (surah: number, ayah: number) => book?.pages.pageOf(surah, ayah);
  /** «٧ آيات» in Arabic, "7 ayahs" in English — one rule each. */
  const ayahCount = (n: number) => (lang === 'ar'
    ? arabicCount(n, 'آية واحدة', 'آيتان', 'آيات', 'آية').replace(/\d+/, m => localeDigits(Number(m), lang))
    : `${n} ${n === 1 ? 'ayah' : 'ayahs'}`);
  const folded = foldQuranText(filter).replace(/^ال/, '');
  const latin = filter.trim().toLowerCase();

  const surahs = SURAHS.filter(s => {
    if (!filter.trim()) return true;
    if (String(s.n) === filter.trim()) return true;
    const ar = foldQuranText(s.name).replace(/^ال/, '');
    const en = surahName(s.n, 'en').toLowerCase();
    return (folded.length >= 1 && ar.includes(folded)) || (latin.length >= 2 && en.includes(latin));
  });

  const myMarks = marks.notes.length + marks.bookmarks.length;
  const TABS: { key: typeof tab; label: string }[] = [
    { key: 'surah', label: t('readSurahs') },
    { key: 'juz', label: t('recJuzStrip') },
    { key: 'page', label: t('recPage') },
    { key: 'marks', label: myMarks ? `${t('readMyMarks')} · ${localeDigits(myMarks, lang)}` : t('readMyMarks') },
  ];

  /**
   * A mark made in another print still names a place in this one, so it is
   * shown either way — jumping through the anchor, which both books know.
   */
  const jumpToAnchor = (anchorId: number) => {
    const loc = index.locOf(anchorId);
    if (loc) onGo({ kind: 'ayah', surah: loc.surah, ayah: loc.ayah });
  };

  return (
    <Sheet title={t('readIndex')} onClose={onClose}>
      <div className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2">
        <div className="grid grid-cols-4 gap-1.5">
          {TABS.map(x => (
            <button
              key={x.key}
              onClick={() => setTab(x.key)}
              aria-pressed={tab === x.key}
              className={`rounded-lg border-2 px-2 py-1.5 text-xs font-bold transition-all ${
                tab === x.key
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-border bg-background text-foreground hover:border-emerald-600/40'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        {tab === 'surah' && (
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('readFilterSurahs')}
            aria-label={t('readFilterSurahs')}
            className="mt-2 w-full rounded-lg border-2 border-primary/20 bg-background px-3 py-2 text-sm text-foreground outline-none ring-primary/20 focus:border-primary focus:ring-2"
          />
        )}
      </div>

      {tab === 'surah' && (
        surahs.length ? surahs.map(s => (
          <Row
            key={s.n}
            onClick={() => onGo({ kind: 'surah', surah: s.n })}
            title={`${localeDigits(s.n, lang)}. ${surahName(s.n, lang)}`}
            detail={ayahCount(s.ayahs)}
            trailing={(() => { const p = pageOf(s.n, 1); return p ? `${t('recPage')} ${localeDigits(p, lang)}` : undefined; })()}
          />
        )) : <p className="px-4 py-10 text-center text-xs text-muted-foreground">{t('readNoMatch')}</p>
      )}

      {tab === 'juz' && Array.from({ length: 30 }, (_, i) => i + 1).map(j => {
        const loc = index.locOf(index.juzRanges[j - 1]?.firstId ?? 1);
        const p = loc ? pageOf(loc.surah, loc.ayah) : undefined;
        return (
          <Row
            key={j}
            onClick={() => onGo({ kind: 'juz', juz: j })}
            title={`${t('recJuzWord')} ${localeDigits(j, lang)}`}
            detail={loc ? `${surahName(loc.surah, lang)} ${localeDigits(loc.ayah, lang)}` : undefined}
            trailing={p ? `${t('recPage')} ${localeDigits(p, lang)}` : undefined}
          />
        );
      })}

      {tab === 'marks' && (
        myMarks === 0 ? (
          <p className="px-4 py-10 text-center text-xs leading-relaxed text-muted-foreground">
            {t('readNoMarks')}
          </p>
        ) : (
          <>
            {marks.bookmarks.length > 0 && (
              <p className="bg-accent/40 px-4 py-1.5 text-[11px] font-bold text-muted-foreground">
                {t('readBookmarks')}
              </p>
            )}
            {recentFirst(marks.bookmarks).map(b => {
              const loc = index.locOf(b.anchorId);
              const here = b.mushafId === mushafId;
              return (
                <div key={b.id} className="flex items-center gap-1 border-b border-border/60">
                  <button
                    onClick={() => (here ? onGo({ kind: 'page', page: b.page }) : jumpToAnchor(b.anchorId))}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {t('recPage')} {localeDigits(b.page, lang)}
                      </span>
                      {loc && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {surahName(loc.surah, lang)} {localeDigits(loc.ayah, lang)}
                          {!here && ` · ${riwayaOf(b.mushafId, lang)}`}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    onClick={() => onRemoveBookmark(b.id)}
                    data-a11y-tap
                    aria-label={t('recDelete')}
                    className="me-2 rounded-lg p-2 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}

            {marks.notes.length > 0 && (
              <p className="bg-accent/40 px-4 py-1.5 text-[11px] font-bold text-muted-foreground">
                {t('readNotes')}
              </p>
            )}
            {recentFirst(marks.notes).map((n: ReadingNote) => (
              <div key={n.id} className="flex items-center gap-1 border-b border-border/60">
                <button
                  onClick={() => jumpToAnchor(n.anchorId)}
                  className="flex min-w-0 flex-1 flex-col items-start px-4 py-2.5 text-start transition-colors hover:bg-accent"
                >
                  <span className="truncate text-sm font-bold">
                    {surahName(n.surah, lang)} {localeDigits(n.ayah, lang)}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{n.text}</span>
                </button>
                <button
                  onClick={() => onRemoveNote(n.id)}
                  data-a11y-tap
                  aria-label={t('recDelete')}
                  className="me-2 rounded-lg p-2 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </>
        )
      )}

      {tab === 'page' && (
        <form
          className="space-y-3 p-4"
          onSubmit={e => {
            e.preventDefault();
            const n = Number(pageInput.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
            if (n >= 1) onGo({ kind: 'page', page: n });
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={pageInput}
            onChange={e => setPageInput(e.target.value)}
            placeholder={t('readPagePlaceholder')}
            aria-label={t('recPage')}
            className="w-full rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-center text-lg font-bold tabular-nums text-foreground outline-none ring-primary/20 focus:border-primary focus:ring-2"
          />
          <p className="text-center text-[11px] text-muted-foreground">
            {localeDigits(index.totalPages, lang)} {t('recPagesUnit')}
          </p>
          <button className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))]">
            {t('readGo')}
          </button>
        </form>
      )}
    </Sheet>
  );
};

/**
 * One box for every way of naming a place.
 *
 * The parsing lives in `reader-search`, tested against the real muṣḥaf; this
 * only debounces it, because a scan of six thousand verses on every keystroke
 * is work nobody asked for.
 */
const SearchSheet: React.FC<{
  index: QuranIndex;
  onGo: (jump: ReaderJump) => void;
  onClose: () => void;
}> = ({ index, onGo, onClose }) => {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ReaderHit[]>([]);

  useEffect(() => {
    const id = setTimeout(() => setHits(searchMushaf(query, index, lang)), 160);
    return () => clearTimeout(id);
  }, [query, index, lang]);

  return (
    <Sheet title={t('readSearch')} onClose={onClose}>
      <div className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('readSearchPlaceholder')}
          aria-label={t('readSearch')}
          className="w-full rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 focus:border-primary focus:ring-2"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{t('readSearchHint')}</p>
      </div>

      {query.trim() && !hits.length && (
        <p className="px-4 py-10 text-center text-xs text-muted-foreground">{t('readNoMatch')}</p>
      )}
      {hits.map((h, i) => (
        <Row key={i} onClick={() => onGo(h.jump)} title={h.title} detail={h.detail} />
      ))}
    </Sheet>
  );
};

export default MushafReader;
