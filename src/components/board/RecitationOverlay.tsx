import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  X, Pause, Play, Minimize2, ChevronRight, ChevronLeft, Sun, Moon, Lightbulb, Undo2, CheckCheck,
  ChevronUp, Trash2, ListX, Search, Eye, EyeOff, Type,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/lib/theme';
import { useKeepAwake } from '@/lib/use-keep-awake';
import { loadQuranFont, surahName, surahNameAr, toArabicIndic } from '@/lib/quran-data';
import type { QuranIndex } from '@/lib/quran-index';
import {
  activeMs, addCorrection, addMark, closeSegment, completeSurah, formatClock, juzStates, makeNote,
  moveTo, noteCounts, noteKindsFor, progressPct, sessionMarks, sessionMode, startSegment,
  type NoteKind, type RecitationSession, type SessionCorrection, type SessionNote,
} from '@/lib/recitation-session';
import {
  MAJLIS_SLOTS, MUSHAF_SURFACE, NOTE_LABEL_KEY, NOTE_STYLE, NoteButtons, SOLO_SLOTS, TAJWEED_TAGS,
  TAJWEED_TAG_KEY, haptic,
  noteLabel, positionLabel,
  SurahBand,
  type QuranSlot,
} from './recitation-shared';
import PlaceTagRow from './PlaceTagRow';
import { allTags, tagsAt } from '@/lib/place-tags';
import LangToggle from './LangToggle';
import MushafPageViewer from './MushafPageViewer';
import type { At } from '@/lib/asr/follow';
import { notedWords, pinnedWordAt, tapWord, withPinnedWord, type WordPin } from '@/lib/word-pin';
import MushafPicker from './MushafPicker';
import CorrectionRecorder from './CorrectionRecorder';
import SoloListenPanel from './SoloListenPanel';
import QuranSearchBox from './QuranSearchBox';
import { ACCEPTED_KIND } from '@/lib/asr/review';
import {
  AYAH_COUNTING, CANONICAL_COUNTING, countingName, mushafFullName, type MushafDefinition,
} from '@/lib/mushaf/registry';
import { hasPageAsset, useMushafCoverage } from '@/lib/mushaf/coverage';
import { getMushaf, defaultMushaf } from '@/lib/mushaf/registry';
import { useMushafPageIndex } from '@/lib/mushaf/page-index';
import { isTap, pageIntentOf } from '@/lib/mushaf/swipe';
import { usePageTurn } from '@/lib/mushaf/use-page-turn';
import {
  isCertain, pageOfAnchorIn, positionFromAnchor, positionInEdition, surahEndPosition,
  type AyahPosition,
} from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';

/**
 * A note or a mark, reduced to what this screen does with either.
 *
 * They live in separate lists on the session — a mark is not an error and has
 * to stay out of the error arithmetic — but the undo chip and the detail sheet
 * treat them identically. So they are carried here as one shape, with `slot`
 * saying which list to write back to.
 */
type Entry = { slot: QuranSlot; id: string; at: number; position: AyahPosition; detail?: string; word?: number };

/**
 * The item just appended, read back off the session rather than kept from
 * before the append — so the id carried around is the one actually stored.
 */
const lastOf = <T,>(list: T[]): T => list[list.length - 1];

interface Props {
  session: RecitationSession;
  index: QuranIndex;
  onChange: (next: RecitationSession) => void;
  onMinimize: () => void;
  onEnd: () => void;
  /**
   * Where this screen says what its own back button should close.
   *
   * The shell can see that a majlis is open; it cannot see the detail dialog a
   * long press just raised over it, so back was dropping the whole majlis to
   * the home screen to dismiss a text field. Optional — the board embeds this
   * too, and a browser has no such button.
   */
  back?: React.MutableRefObject<(() => boolean) | null>;
}

const UNDO_MS = 5000;

/**
 * A page at a time.
 *
 * The majlis used to ask whether a press confirmed a page or a whole surah.
 * The question is gone: a press confirms the page, and finishing the surah is
 * its own button on the surah's last page. Old sessions that recorded the
 * choice still read — nothing reads it back.
 */

/** Fraction of the mushaf width, each side, that turns the page when clicked. */
const EDGE_ZONE = 0.25;
/** Bounds for the auto-fitted mushaf type, in px. */
const MIN_FONT = 9;
const MAX_FONT = 40;

const RecitationOverlay: React.FC<Props> = ({ session, index, onChange, onMinimize, onEnd, back }) => {
  const { t, dir, lang } = useI18n();
  const isRtl = dir === 'rtl';

  const [fontReady, setFontReady] = useState(false);
  /**
   * The page on screen, numbered as this edition numbers it.
   *
   * The text layer's pagination used to be the spine and the printed page was
   * derived from it — which holds only while every edition is set to the same
   * 604 pages. ash-Shamarly is not, so the spine is the edition's own page
   * index and the text layer is what gets derived.
   */
  const [printedPage, setPrintedPage] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  /*
   * Reciting with the page covered. Kept here rather than on the session: it is
   * how the reciter is working right now, not a fact about the majlis — and a
   * majlis restored tomorrow should not silently come back covered.
   */
  const [veiled, setVeiled] = useState(false);
  /**
   * The last āyah uncovered, by anchor — 0 before anything is.
   *
   * Everything after it is hidden and everything up to it stays readable, which
   * is how a hand covers a page: what has been recited is still there to look
   * back at, what is ahead is not.
   */
  const [revealedThrough, setRevealedThrough] = useState(0);
  const [lastEntry, setLastEntry] = useState<Entry | null>(null);
  const [detailEntry, setDetailEntry] = useState<Entry | null>(null);
  const [detailText, setDetailText] = useState('');
  const [detailTag, setDetailTag] = useState<string>('');
  const [keepAwake, setKeepAwake] = useState(true);
  /**
   * Which kind the list below the tallies is showing, or all of them.
   *
   * The tallies answer «how many»; a teacher who taps one is asking «which»,
   * and making them scan a mixed list for it is the fussing this tool exists
   * to remove.
   */
  const [onlyKind, setOnlyKind] = useState<QuranSlot | null>(null);
  /** Re-read after each edit — the store is a few hundred short strings. */
  const [tagsVersion, setTagsVersion] = useState(0);
  /**
   * The sheet below lg, and which of its two doors was used: the figures, or
   * the notes. Opening it on the notes puts them first — a teacher who taps a
   * count wants the list, not a scroll past the progress bar to find it.
   */
  const [sheet, setSheet] = useState<null | 'panel' | 'notes'>(null);
  const [overflows, setOverflows] = useState(false);
  const [tooNarrow, setTooNarrow] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [, setTick] = useState(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const running = session.status === 'active';
  const [theme, toggleTheme] = useTheme();

  useEffect(() => { loadQuranFont('hafs').then(() => setFontReady(true)).catch(() => setFontReady(true)); }, []);

  // Follow the marker when it moves from elsewhere (restore, console, jump).
  const currentPage = index.pageOf(session.current.anchor.id);

  // Live duration — only ticks while listening.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // A majlis outlasts the screen timeout; without this the tablet sleeps
  // mid-recitation. Shared with the matn overlay — see `useKeepAwake`.
  useKeepAwake(keepAwake && running);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  /**
   * The home screen behind this one is taller than the window, so the document
   * kept a scrollbar that scrolled nothing anybody could see. The majlis fills
   * the screen; while it does, the page underneath holds still.
   */
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = previous; };
  }, []);

  /**
   * Removing a note, at any point in the majlis.
   *
   * The five-second chip catches the slip you notice at once; this catches the
   * one you notice at the end of the page. A note is a claim about a student,
   * so taking it back must never be harder than making it.
   */
  const removeEntry = useCallback(({ id, slot }: Entry) => {
    onChange(slot === 'mark'
      ? { ...session, marks: sessionMarks(session).filter(m => m.id !== id) }
      : { ...session, notes: session.notes.filter(n => n.id !== id) });
    setLastEntry(current => (current?.id === id ? null : current));
    setDetailEntry(current => (current?.id === id ? null : current));
    haptic(8);
  }, [session, onChange]);

  // When we hold the publisher's own page, that is what we show. The text
  // renderer below is the fallback for pages we have not vendored yet.
  /**
   * One majlis, one muṣḥaf.
   *
   * Read from the session rather than from the picker: the riwaya and the print
   * run are chosen before the majlis and fixed for its whole length. Changing
   * the book mid-recitation would change the page breaks and the line the
   * student has memorised the shape of, so the picker is locked while this is
   * open and nothing here can be moved by it.
   */
  const activeMushaf = useMemo(
    () => getMushaf(session.mushafId) ?? defaultMushaf(),
    [session.mushafId],
  );
  const coverageVersion = useMushafCoverage(activeMushaf);
  const editionPages = useMushafPageIndex(activeMushaf);
  const turnDirection = usePageTurn(printedPage);
  // The interop language, and the book the numbers on screen belong to.
  const canonical = useMemo(() => canonicalBookFromQuranIndex(index), [index]);
  const book = useMemo(
    () => editionBook(activeMushaf, editionPages, canonical),
    [activeMushaf, editionPages, canonical],
  );

  const inThisBook = session.current.mushafId === activeMushaf.id;

  /** Where the marker sits in this edition's own pagination. */
  const markerPage = useMemo(
    () => (book ? book.pages.pageOf(session.current.surah, session.current.ayah) : undefined),
    [book, session.current.surah, session.current.ayah],
  );

  // Follow the marker whenever it moves from outside the page turner —
  // restoring a majlis, tapping an ayah, finishing a surah.
  useEffect(() => {
    if (markerPage !== undefined) setPrintedPage(markerPage);
  }, [markerPage]);

  /** First and last page this edition actually has. */
  const firstPage = activeMushaf.firstPageNumber;
  const lastPage = activeMushaf.firstPageNumber + activeMushaf.pageCount - 1;

  /**
   * The text layer's page for what is on screen — used only by the fallback
   * renderer and the ornament, and derived from the edition rather than the
   * other way round.
   */
  const textPage = useMemo(() => {
    if (!book || printedPage === null) return currentPage;
    const first = book.pages.ayahsOfPage(printedPage)[0];
    if (!first) return currentPage;
    const at = positionInEdition(book, canonical, first);
    return at ? index.pageOf(at.anchor.id) : currentPage;
  }, [book, canonical, index, printedPage, currentPage]);

  // The page as printed: the first and last entries may be word fragments.
  const pageVerses = useMemo(() => index.pageFragments(textPage), [index, textPage]);
  // Editions that carry a line layout are set line by line, like the print.
  // Madinah has none, so it keeps flowing.
  const wordLines = useMemo(() => index.pageWordLines(textPage), [index, textPage]);

  /**
   * What the recogniser believes is being recited right now.
   *
   * Held here rather than in the listening panel because the page is drawn
   * here: only the thing holding the page can mark a word on it. `listening`
   * is separate from `at` on purpose — the estimate is null between polls and
   * before the first one, and the page must not flick back and forth in the gap.
   */
  /*
   * The page as words instead of as the printed plate, by choice. The plate is
   * a picture and nothing on it is a word; here each word is its own element,
   * so one can be pinned for the next note. See `word-pin.ts`.
   */
  const [wordView, setWordView] = useState(false);
  const [pin, setPin] = useState<WordPin | null>(null);
  const noted = useMemo(() => notedWords(session.notes), [session.notes]);

  const [heard, setHeard] = useState<{ listening: boolean; at: At | null }>(
    { listening: false, at: null },
  );

  const facsimile = useMemo<{ mushaf: MushafDefinition; page: number } | null>(() => {
    if (printedPage === null) return null;
    /*
     * The plate is a picture. It carries a polygon per verse — which is why a
     * verse can be lit on it — and nothing per word, so a word cannot be. While
     * somebody is being followed, the page is set from the same text with the
     * print's own line breaks instead, where each word is its own element.
     *
     * It is not a different muṣḥaf: same words, same lines, same page. It is
     * switched rather than offered because a reciter who has turned following
     * on has already asked for this, and a second control to make the first one
     * work is a control that should not exist.
     */
    if (heard.listening || wordView) return null;
    return hasPageAsset(activeMushaf, printedPage) ? { mushaf: activeMushaf, page: printedPage } : null;
    // coverageVersion re-runs this once the manifest lands.
  }, [activeMushaf, printedPage, coverageVersion, heard.listening, wordView]);

  /**
   * Which surah the page on screen closes, if it closes one.
   *
   * Read off the page itself rather than from `sessionSurah`: a majlis that
   * began in al-Fatiha and read on would otherwise never see the button again,
   * because the session's surah only advances when the button is pressed —
   * which is exactly the button that never appeared. The page knows what ends
   * on it; ask the page.
   *
   * Deliberately not "has the marker reached the last ayah" either: the teacher
   * is on the closing page from the moment it opens, and making them tap their
   * way to the final verse first would be a puzzle, not a workflow. So it shows
   * the instant the page opens, however they got there, and hides on turning
   * back.
   *
   * Where several surahs end on one page — 112, 113 and 114 all close the last
   * page — the majlis's own surah wins, then the one the marker sits in, then
   * the first that ends there.
   */
  const closingSurah = useMemo<number | null>(() => {
    if (!book || printedPage === null) return null;
    const ending: number[] = [];
    for (const ref of book.pages.ayahsOfPage(printedPage)) {
      if (book.pages.lastAyahOf(ref.surah) === ref.ayah && !ending.includes(ref.surah)) {
        ending.push(ref.surah);
      }
    }
    if (!ending.length) return null;
    if (ending.includes(session.sessionSurah)) return session.sessionSurah;
    if (ending.includes(session.current.surah)) return session.current.surah;
    return ending[0];
  }, [book, printedPage, session.sessionSurah, session.current.surah]);

  const finishSurahReady = closingSurah !== null;

  /**
   * The marker, in the numbering the page on screen is printed with — which
   * is simply what the session stores, once the switch above has run.
   */
  const selectedAyah = useMemo(
    () => (inThisBook ? { surah: session.current.surah, ayah: session.current.ayah } : null),
    [inThisBook, session.current.surah, session.current.ayah],
  );

  /**
   * The āyāt of this page that have not been recited yet.
   *
   * Worked out in anchors, never in printed numbers: the page is in the
   * edition's own numbering and the reveal boundary is in the canonical one,
   * and comparing the two directly is exactly the confusion the anchor exists
   * to prevent.
   *
   * Empty when the cover is off, so the page is never asked to hide anything
   * nobody switched on.
   */
  const coveredAyahs = useMemo<{ surah: number; ayah: number }[]>(() => {
    if (!veiled || !book || printedPage === null) return [];
    const out: { surah: number; ayah: number }[] = [];
    for (const ref of book.pages.ayahsOfPage(printedPage)) {
      const at = positionInEdition(book, canonical, ref);
      // A verse this edition cannot place is covered rather than shown: the cover
      // failing open would hand the reciter the line it was hiding.
      if (!at || at.anchor.id > revealedThrough) out.push(ref);
    }
    return out;
  }, [veiled, book, canonical, printedPage, revealedThrough]);

  /** The same cover, in the form the word renderer can ask about. */
  const coveredKeys = useMemo(
    () => new Set(coveredAyahs.map(r => `${r.surah}:${r.ayah}`)),
    [coveredAyahs],
  );

  const differentCounting = activeMushaf.ayahCounting !== CANONICAL_COUNTING;

  /**
   * Scales the page's type so the whole page fits the box exactly — binary
   * search, because Arabic reflow is not linear in font size. Runs on page
   * change and on resize only, and writes the size straight to the node so an
   * unrelated re-render (a note landing) cannot undo it.
   */
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text || !fontReady) return;

    const fit = () => {
      const cs = getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (avail <= 0) return;
      /**
       * A set line must fit its width as well as the page its height: the rows
       * are `nowrap`, so an oversized type spills words past the frame instead
       * of wrapping. Height alone was letting that through.
       */
      const fitsAt = (size: number) => {
        text.style.fontSize = `${size}px`;
        if (text.scrollHeight > avail) return false;
        for (const row of text.querySelectorAll('[data-line]')) {
          if (row.scrollWidth > row.clientWidth + 1) return false;
        }
        return true;
      };

      let lo = MIN_FONT;
      let hi = MAX_FONT;
      let best = MIN_FONT;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) { best = mid; lo = mid; } else { hi = mid; }
      }
      text.style.fontSize = `${best}px`;
      // On a pane too narrow for a set line even at the floor size, let the
      // lines wrap. The printed break is lost, but every word stays inside the
      // frame — spilling words past the margin is the worse failure.
      setTooNarrow([...text.querySelectorAll('[data-line]')].some(r => r.scrollWidth > r.clientWidth + 1));
      // On a screen too short even for the floor size — a landscape phone —
      // scrolling is the lesser evil. Clipping would hide ayahs silently, and
      // a teacher following a recitation must never lose a line to the layout.
      setOverflows(text.scrollHeight > avail + 1);
    };

    fit();
    // ResizeObserver alone is not enough: it is delivered on the rendering
    // step, which a backgrounded or non-compositing tab can skip. The window
    // events cover rotation and the board's fullscreen toggle.
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    document.addEventListener('fullscreenchange', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      document.removeEventListener('fullscreenchange', fit);
    };
  }, [textPage, fontReady, pageVerses]);
  const tagsMap = allTags();
  void tagsVersion;
  const noteTotals = noteCounts(session);
  /** The three this session offers — the third differs when nobody is listening. */
  const slots = sessionMode(session) === 'solo' ? SOLO_SLOTS : MAJLIS_SLOTS;
  const counts: Partial<Record<QuranSlot, number>> = {
    ...noteTotals,
    mark: sessionMarks(session).length,
  };
  /**
   * Everything recorded this majlis, in the order it happened.
   *
   * The two lists are separate in the model because only one of them is
   * evidence of a mistake; on screen they are one running record, which is how
   * the person who made them remembers them.
   */
  const entries: Entry[] = [
    ...session.notes.map(n => ({ slot: n.kind as QuranSlot, ...n })),
    ...sessionMarks(session).map(m => ({ slot: 'mark' as QuranSlot, ...m })),
  ].sort((a, b) => a.at - b.at);
  const pct = progressPct(session);
  const juz = useMemo(() => juzStates(session, index), [session, index]);
  const startPos = session.goal.start;
  const currentPos = session.current;

  /**
   * Records whichever of the three buttons was pressed.
   *
   * A mark goes to its own list; the other two are notes as before. Which slot
   * sits third is the session's business, not this handler's — see `slots`.
   */
  const addSlot = useCallback((slot: QuranSlot, openDetail: boolean) => {
    const next = slot === 'mark'
      ? addMark(session, session.current)
      // On the pinned word when there is one — but only while the words are on
      // screen: the plate has none, and a pin nobody can see must not catch a note.
      : {
        ...session,
        notes: [
          ...session.notes,
          withPinnedWord(makeNote(slot, session.current), facsimile ? null : pin, session.current.anchor.id),
        ],
      };
    const added: Entry = slot === 'mark'
      ? { slot, ...lastOf(sessionMarks(next)) }
      : { slot, ...lastOf(next.notes) };
    onChange(next);
    // A pin is for one note: the next goes on the marker's verse again, never
    // silently on a word picked a while ago.
    setPin(null);
    haptic();
    setLastEntry(added);
    setAnnouncement(`${t(NOTE_LABEL_KEY[slot])} — ${positionLabel(added.position)}`);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setLastEntry(null), UNDO_MS);
    if (openDetail) { setDetailEntry(added); setDetailText(''); setDetailTag(''); }
  }, [pin, facsimile, session, index, onChange, t]);

  const undoLast = useCallback(() => {
    if (!lastEntry) return;
    removeEntry(lastEntry);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [lastEntry, removeEntry]);

  const saveDetail = useCallback(() => {
    if (!detailEntry) return;
    const detail = detailText.trim() || undefined;
    onChange(detailEntry.slot === 'mark'
      ? {
        ...session,
        marks: sessionMarks(session).map(m => m.id === detailEntry.id ? { ...m, detail } : m),
      }
      : {
        ...session,
        notes: session.notes.map(n => n.id === detailEntry.id
          // The rule tag belongs to a tajweed note; a mark never reaches here.
          ? { ...n, detail, tajweedRuleId: detailTag || undefined }
          : n),
      });
    setDetailEntry(null);
  }, [detailEntry, detailText, detailTag, session, onChange]);

  /** Browsing the mushaf carries the marker along — free, and it keeps notes sharp. */
  /**
   * Turns to a printed page of **this** edition and puts the marker on its
   * first verse. Bounded by the edition's own first and last page, so a book
   * of 522 pages does not pretend to have 604.
   */
  const goToPage = useCallback((page: number) => {
    if (!book) return;
    const target = Math.min(lastPage, Math.max(firstPage, page));
    const first = book.pages.ayahsOfPage(target)[0];
    setPrintedPage(target);
    if (!first) return;
    const at = positionInEdition(book, canonical, first);
    if (at) onChange(moveTo(session, at));
  }, [book, canonical, session, onChange, firstPage, lastPage]);

  /**
   * Goes to where something was recorded.
   *
   * A note in the list is a place, and a teacher reading it back is asking to
   * be taken there — scrolling to find it by number is the fussing this whole
   * tool exists to remove. The marker moves and the page turns with it, so the
   * verse is on screen and pinned when they arrive.
   */
  const goToEntry = useCallback((entry: Entry) => {
    onChange(moveTo(session, entry.position));
    const page = book ? pageOfAnchorIn(book, canonical)(entry.position.anchor.id) : undefined;
    if (page !== undefined) setPrintedPage(page);
    haptic(8);
  }, [book, canonical, session, onChange]);

  /**
   * Goes to a verse the reciter searched for.
   *
   * Deliberately the same move as `goToEntry`: a search that only names the
   * verse leaves them to find it by hand, which is the fussing this tool
   * exists to remove. The marker lands there and the page turns with it, so
   * the next thing they do — a note, a recitation — starts from that verse.
   */
  const goToAnchor = useCallback((anchorId: number) => {
    const at = book ? positionFromAnchor(book, canonical, anchorId) : null;
    if (!at) return;
    onChange(moveTo(session, at));
    const page = book ? pageOfAnchorIn(book, canonical)(anchorId) : undefined;
    if (page !== undefined) setPrintedPage(page);
    setSearching(false);
    haptic(8);
  }, [book, canonical, session, onChange]);

  /**
   * A verse the reciter has been heard to finish.
   *
   * Uncovers it, then moves the marker past it — see the note where this is
   * handed to the listening panel.
   */
  const followedTo = useCallback((anchorId: number) => {
    setRevealedThrough(n => Math.max(n, anchorId));
    goToAnchor(anchorId + 1);
    haptic(8);
  }, [goToAnchor]);

  // One pair of doors: the arrows, the keyboard, the edge taps and the swipe
  // all go through these, so they can never drift apart.
  const goToNextPage = useCallback(
    () => { if (printedPage !== null) goToPage(printedPage + 1); },
    [goToPage, printedPage],
  );
  const goToPreviousPage = useCallback(
    () => { if (printedPage !== null) goToPage(printedPage - 1); },
    [goToPage, printedPage],
  );

  /**
   * A finger on the page.
   *
   * One pointer only — a second one is somebody pinching, not turning — and the
   * gesture is judged once, on release, by `pageIntentOf`. A drag that turns
   * the page swallows the click that follows it, so a swipe that begins on an
   * ayah never also pins that ayah.
   */
  const drag = useRef<{ id: number; x: number; y: number; multi: boolean } | null>(null);
  const swallowClick = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // A press that starts on the floating button is that button's, not a drag.
    if ((e.target as HTMLElement).closest('button')) return;
    if (drag.current) { drag.current.multi = true; return; }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, multi: false };
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    drag.current = null;
    if (!start || start.id !== e.pointerId || start.multi) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (isTap(dx, dy)) return;
    // Moved too far to be a tap: whatever happens, it is not an ayah pick.
    swallowClick.current = true;
    const intent = pageIntentOf(dx, dy);
    if (intent === 'next') goToNextPage();
    else if (intent === 'previous') goToPreviousPage();
  }, [goToNextPage, goToPreviousPage]);

  const onPointerCancel = useCallback(() => { drag.current = null; }, []);

  /**
   * Turns the page when the tap lands in the outer quarter and not on an ayah.
   * Leftwards is forwards — the mushaf is a right-to-left book, whatever the
   * interface language.
   */
  const handlePaneClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // A drag that already moved the page must not also be read as a tap.
    if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); return; }
    // An ayah tap wins over the page turn — in the facsimile that means a
    // polygon, not the text renderer's `data-ayah`. Without both, tapping a
    // verse in the outer quarter of a real page would pin it and then turn the
    // page out from under it.
    if ((e.target as HTMLElement).closest('button, [data-ayah], .ayahPolygon')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const edge = rect.width * EDGE_ZONE;
    const x = e.clientX - rect.left;
    if (x <= edge) goToNextPage();
    else if (x >= rect.width - edge) goToPreviousPage();
  }, [goToNextPage, goToPreviousPage]);

  const currentSurah = session.current.surah;

  /**
   * Confirms the surah as recited and moves the majlis on to the next one.
   *
   * Progress, not an ending — the majlis closes only from the header. The
   * credited span runs to that surah's last ayah **in this edition's
   * numbering** (176 in the Hafs muṣḥaf, 175 in the Warsh and Qalun ones), and
   * never reaches back before the majlis began.
   */
  const finishSurah = useCallback(() => {
    if (!book || closingSurah === null) return;
    const end = surahEndPosition(book, canonical, closingSurah);
    const surahRange = index.surahRanges[closingSurah - 1];
    if (!end || !surahRange) return;
    const to = end.anchor.id;
    // Credit from wherever this majlis actually began inside the surah, never
    // from before it: finishing al-Kahf does not mean al-Baqara was recited.
    const from = Math.max(surahRange.firstId, Math.min(session.goal.start.anchor.id, to));
    const nextId = Math.min(index.totalAyahs, to + 1);
    const next = nextId > to ? positionFromAnchor(book, canonical, nextId) : null;
    haptic(20);
    setAnnouncement(`${t('recFinishedSurah')} ${surahName(closingSurah)}`);
    onChange(completeSurah(session, from, to, next));
  }, [book, canonical, closingSurah, index, session, onChange, t]);

  /** The text fallback speaks in anchor ids; the session speaks in positions. */
  const moveToAnchor = useCallback((anchorId: number) => {
    if (!book) return;
    const at = positionFromAnchor(book, canonical, anchorId);
    if (at) onChange(moveTo(session, at));
  }, [book, canonical, session, onChange]);

  const togglePause = useCallback(() => {
    onChange(running
      ? { ...session, status: 'paused', segments: closeSegment(session) }
      : { ...session, status: 'active', segments: startSegment(session) });
  }, [running, session, onChange]);

  // Keyboard: the three notes, page browsing, undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undoLast(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Keyed by position in the row, so 3 records whatever the third slot is
      // in this mode rather than a kind that may not be on screen.
      if (e.key === '1') { e.preventDefault(); addSlot(slots[0], false); }
      else if (e.key === '2') { e.preventDefault(); addSlot(slots[1], false); }
      else if (e.key === '3') { e.preventDefault(); addSlot(slots[2], false); }
      // The mushaf reads right to left whatever the interface language, so the
      // arrow keys follow the book, not the UI.
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goToNextPage(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goToPreviousPage(); }
      else if (e.code === 'Space') { e.preventDefault(); goToNextPage(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addSlot, slots, undoLast, goToNextPage, goToPreviousPage]);

  /**
   * Android's back button, unwinding this screen's own layers, innermost first.
   *
   * The majlis itself is not among them: closing it belongs to the shell, which
   * minimises rather than ends — ending a majlis is a decision, never a
   * by-product of a gesture.
   */
  useEffect(() => {
    if (!back) return;
    const handler = () => {
      if (detailEntry) { setDetailEntry(null); return true; }
      if (sheet) { setSheet(null); return true; }
      if (searching) { setSearching(false); return true; }
      return false;
    };
    back.current = handler;
    // Cleared only while it is still ours — see the reader.
    return () => { if (back.current === handler) back.current = null; };
  }, [back, detailEntry, sheet, searching]);

  const startedLabel = new Date(session.startedAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  return (
    // `*-safe`: on a phone the window reaches under the status bar and the
    // gesture bar, and the two things this screen pins — the toolbar and the
    // note buttons — are exactly what they would cover. Nothing anywhere else,
    // where the insets are zero.
    <div className={`fixed inset-0 z-[180] flex flex-col pt-safe pb-safe px-safe ${MUSHAF_SURFACE}`} dir={dir} role="region" aria-label={t('recTitle')}>
      <span className="sr-only" aria-live="polite">{announcement}</span>

      {searching && (
        <QuranSearchBox index={index} onGo={goToAnchor} onClose={() => setSearching(false)} />
      )}

      {/* Header — a thin toolbar on a phone, where the page is what matters. */}
      <header className="flex items-center justify-between gap-2 border-b border-emerald-900/10 px-2 py-1.5 dark:border-emerald-100/10 sm:px-4 sm:py-2.5 short:py-1 sm:short:py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-foreground sm:text-base">{session.studentName}</span>
          {/* A paused clock is why the report can show a long span but little
              listening time. It must be impossible to miss. */}
          {!running && (
            <button
              onClick={togglePause}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-2 py-1 text-[10px] font-extrabold text-white transition-colors hover:bg-amber-600 sm:px-2.5 sm:text-[11px]"
            >
              <Play size={12} />
              <span className="hidden sm:inline">{t('recPausedBanner')}</span>
              <span className="sm:hidden">{t('recPause')}</span>
            </button>
          )}
        </div>
        {/* The book is stated on the bar below, beside the position — see
            there. It is not offered anywhere during a majlis: changing it
            mid-recitation would move the page breaks the student has memorised
            the shape of. */}

        {/*
          Seven controls in a row on a phone, each of them a 17px glyph in 6px
          of padding — a 29px target, well under the 44px the rest of the tool
          keeps. They are also the controls pressed while somebody is reciting
          and nobody is looking at the screen properly, which is the worst
          moment to miss one and hit the neighbour: the pause is beside the end.
          `data-a11y-tap` is the project's own answer — see `src/index.css`.
        */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={toggleTheme}
            data-a11y-tap
            aria-label={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
            title={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
            className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <LangToggle iconOnly className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2" />
          <button
            onClick={() => {
              setVeiled(v => {
                if (!v) setRevealedThrough(session.current.anchor.id - 1);
                return !v;
              });
              haptic(8);
            }}
            data-toggle-veil
            data-a11y-tap
            aria-label={veiled ? t('veilShow') : t('veilHide')}
            title={veiled ? t('veilShow') : t('veilHide')}
            aria-pressed={veiled}
            className={`flex items-center justify-center rounded-lg p-1.5 transition-colors sm:p-2 ${
              veiled ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {veiled ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button
            onClick={() => setSearching(true)}
            data-open-search
            data-a11y-tap
            aria-label={t('searchTitle')}
            title={t('searchTitle')}
            className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
          >
            <Search size={17} />
          </button>
          <button
            onClick={() => setKeepAwake(v => !v)}
            data-a11y-tap
            aria-pressed={keepAwake}
            title={t('recKeepAwake')}
            aria-label={t('recKeepAwake')}
            className={`flex items-center justify-center rounded-lg p-1.5 transition-colors sm:p-2 ${keepAwake ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Lightbulb size={17} />
          </button>
          <button onClick={togglePause} data-a11y-tap title={running ? t('recPause') : t('recResume')} aria-label={running ? t('recPause') : t('recResume')}
            className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2">
            {running ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button onClick={onMinimize} data-a11y-tap title={t('recMinimize')} aria-label={t('recMinimize')}
            className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:p-2">
            <Minimize2 size={17} />
          </button>
          <button onClick={onEnd} data-a11y-tap title={t('recEnd')} aria-label={t('recEnd')}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 sm:px-3 sm:py-2">
            <X size={14} />
            <span className="hidden sm:inline">{t('recEnd')}</span>
          </button>
        </div>
      </header>

      {/*
        The report now speaks this book's own numbering, so there is nothing to
        warn about there. What is worth saying is when the marker arrived by
        conversion and the two books divide that page differently: the page is
        right, the verse may be one out, and one tap fixes it for good.
      */}
      {!isCertain(session.current) && (
        <p className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-900 dark:text-amber-200 sm:text-[11px]">
          {t('recPositionCarried')
            .replace('{from}', countingName(AYAH_COUNTING[session.current.anchor.scheme], lang))
            .replace('{to}', countingName(AYAH_COUNTING[activeMushaf.ayahCounting], lang))}
        </p>
      )}

      {/*
        The second bar: where the majlis is, and which book it is in.

        The book used to sit in the toolbar above, between the student's name
        and five icons, where it read as one more control. It belongs beside
        the position — they are one statement: this verse, in this book.

        Below lg the side panel would push the mushaf into a sliver, so the
        figures join this bar and the rest of the panel is one tap away.
      */}
      <div className="flex items-center gap-2 border-b border-emerald-900/10 px-3 py-1.5 dark:border-emerald-100/10">
        <button
          onClick={() => setSheet('panel')}
          className="flex min-w-0 flex-1 items-center gap-2 text-start lg:pointer-events-none"
          aria-expanded={sheet !== null}
        >
          <span className="min-w-0 truncate text-xs font-bold text-foreground">
            {positionLabel(currentPos)}
          </span>
          <MushafPicker locked mushaf={activeMushaf} className="shrink-0" />
          <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400 lg:hidden">{pct}%</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground lg:hidden">{formatClock(activeMs(session))}</span>
          <ChevronUp size={14} className="shrink-0 text-muted-foreground lg:hidden" aria-hidden />
        </button>

        {/*
          Its own control, and the answer to "I recorded that by mistake and
          the undo bar is gone". Deleting an old note was always possible, at
          the bottom of a panel nobody opens mid-recitation; now the counts
          themselves are the way in.
        */}
        <button
          onClick={() => setSheet('notes')}
          data-a11y-tap
          aria-label={`${t('recNotes')} — ${counts.hesitation + counts.memory + counts.tajweed + counts.shakl}`}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-900/10 px-2 py-1 transition-colors hover:border-emerald-600/40 dark:border-emerald-100/10 lg:hidden"
        >
          {(['hesitation', 'memory', 'tajweed', 'shakl'] as NoteKind[]).map(kind => (
            <span key={kind} className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${NOTE_STYLE[kind].dot}`} aria-hidden />
              {counts[kind]}
            </span>
          ))}
          <ListX size={13} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {/*
          The words instead of the plate. Offered only where there is a plate to
          switch away from — elsewhere the words are already what is shown.
          Leaving it lets go of any pinned word, for the reason in `word-pin.ts`.
        */}
        {printedPage !== null && hasPageAsset(activeMushaf, printedPage) && (
          <button
            type="button"
            data-word-view
            data-a11y-tap
            aria-pressed={wordView}
            aria-label={t('recWordView')}
            title={t('recWordView')}
            onClick={() => { setWordView(v => !v); setPin(null); }}
            className={`flex shrink-0 items-center rounded-lg border px-2 py-1 transition-colors ${
              wordView
                ? 'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                : 'border-emerald-900/10 text-muted-foreground hover:border-emerald-600/40 dark:border-emerald-100/10'
            }`}
          >
            <Type size={14} aria-hidden />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Mushaf */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
            The whole page is always visible: the text is scaled to the space
            available rather than scrolled. A teacher following a recitation
            cannot be scrolling.

            Clicking the left or right quarter turns the page — leftwards is
            forwards, as in the book. An ayah tap wins over the turn, so the
            zones never steal a position pin.
          */}
          <div
            className={`group relative min-h-0 flex-1 ${overflows ? 'overflow-y-auto' : 'overflow-hidden'}`}
            onClick={handlePaneClick}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            // Vertical panning stays the browser's, horizontal is ours — so a
            // page turn never fights the scroll of a page too tall to fit.
            // نقرتان متتاليتان على منطقة التقليب كانتا تُظلّلان رقم الصفحة
            // كأنها تحديد نصّ. لا شيء هنا يُنسخ، فلا شيء هنا يُحدَّد.
            style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            {facsimile ? (
              /* The bottom band is the medallion's: the page is fitted above
                 it, so the number never sits on the last line. Keyed by page so
                 React remounts it and the turn animation runs. */
              <div
                key={facsimile.page}
                data-turn={turnDirection}
                className="flex h-full w-full items-center justify-center px-2 pb-7 pt-2"
              >
                <MushafPageViewer
                  mushaf={facsimile.mushaf}
                  page={facsimile.page}
                  selected={selectedAyah}
                  covered={coveredAyahs}
                  onSelectAyah={({ surah, ayah }) => {
                    // A tap names an ayah in the book on screen, and that is
                    // exactly what the session stores — the anchor is derived
                    // from it, never the other way round.
                    if (!book) return;
                    const at = positionInEdition(book, canonical, { surah, ayah });
                    if (at) onChange(moveTo(session, at));
                  }}
                  className="flex h-full max-h-full w-full items-center justify-center [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full"
                />
              </div>
            ) : differentCounting ? (
              /*
                The text renderer below is Hafs — its words, its verse numbers,
                its line breaks. Offering it as a stand-in for a page of another
                riwaya would put the wrong reading in front of the student, so
                a page we do not hold is simply said to be missing.
              */
              <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {t('recPageUnavailableIn').replace('{name}', mushafFullName(activeMushaf, lang))}
              </div>
            ) : (
            <div
              ref={boxRef}
              key={printedPage ?? textPage}
              data-turn={turnDirection}
              className="mx-auto flex h-full w-full max-w-4xl items-center rounded-md px-4 pb-7 pt-2 sm:px-12 short:pb-6 short:pt-1.5 sm:short:px-6"
              // A single hairline rule with a thin inner keyline, the way a
              // printed page is framed — not a heavy double border.
              style={{ border: '1px solid rgba(184,134,11,0.55)', boxShadow: 'inset 0 0 0 1px rgba(184,134,11,0.16)' }}
            >
              {!fontReady ? (
                <div className="w-full text-center text-sm text-muted-foreground">{t('recLoadingMushaf')}</div>
              ) : (
                <div
                  ref={textRef}
                  // The mushaf is right-to-left whatever the interface language.
                  // Inheriting `dir` from an English UI reorders the ayah spans.
                  dir="rtl"
                  className="mx-auto w-full max-w-3xl"
                  style={{
                    fontFamily: 'HafsSmartCanvas, HafsSmart, serif',
                    lineHeight: 2.1,
                    // Both margins flush, like the printed page; the closing
                    // line centres rather than stretching to the edge.
                    textAlign: 'justify',
                    textAlignLast: 'center',
                  }}
                >
                  {wordLines.length > 0 ? wordLines.map((line, li) => (
                    <React.Fragment key={li}>
                      {line[0]?.opensSurah && <SurahBand name={surahNameAr(line[0].surah)} />}
                      {/* Both margins flush, exactly as the line is set in the
                          print — space-between rather than CSS justify so a
                          short closing line does not stretch. */}
                      <div data-line className={`flex items-baseline gap-1 ${tooNarrow ? "flex-wrap justify-center" : "justify-between whitespace-nowrap"}`}>
                        {line.map((w, wi) => {
                          const hidden = coveredKeys.has(`${w.surah}:${w.ayah}`);
                          /*
                           * The word believed to be under way. A live estimate,
                           * so it is a tint and nothing more: a mark that
                           * changed the type would make the page twitch under
                           * somebody who is in the middle of a verse. Never on
                           * a covered word — that would read the line out.
                           */
                          const saying = !hidden
                            && heard.at?.anchorId === w.ayahId
                            && heard.at?.word === w.word;
                          const here = w.ayahId === session.current.anchor.id;
                          // The word the next note will go on, if one is pressed.
                          const pinned = here && pinnedWordAt(pin, session.current.anchor.id) === w.word;
                          // Notes already on this word, as a bar beneath it in the
                          // colour of the first. Never under a covered word: that
                          // would say where the hidden line went wrong.
                          const marks = hidden ? undefined : noted.get(`${w.ayahId}:${w.word}`);
                          return (
                            <span
                              key={wi}
                              data-ayah={w.ayahId}
                              data-word={w.word}
                              data-saying={saying ? '' : undefined}
                              data-pinned={pinned ? '' : undefined}
                              data-noted={marks ? marks.join(' ') : undefined}
                              role="button"
                              tabIndex={-1}
                              onClick={() => {
                                moveToAnchor(w.ayahId);
                                setPin(p => tapWord(p, w.ayahId, w.word));
                              }}
                              aria-label={`${surahName(w.surah)} ${w.ayah}`}
                              aria-pressed={pinned}
                              className={`relative cursor-pointer rounded transition-colors ${
                                pinned
                                  ? 'bg-sky-500/20 ring-2 ring-sky-500'
                                  : saying
                                    ? 'bg-emerald-500/45 ring-1 ring-emerald-700/60'
                                    : here
                                      ? 'bg-emerald-500/20 ring-1 ring-emerald-600/40'
                                      : 'hover:bg-emerald-500/10'
                              }`}
                            >
                              {/* Covered words keep their space, so uncovering one
                                  does not reflow the page under the reader. */}
                              <span className={hidden ? 'invisible' : undefined}>{w.text}</span>
                              {marks && (
                                <span
                                  aria-hidden
                                  className={`pointer-events-none absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full ${NOTE_STYLE[marks[0] as NoteKind].dot}`}
                                />
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </React.Fragment>
                  )) : pageVerses.map(({ verse: v, from, to }, i) => {
                    const prev = pageVerses[i - 1]?.verse;
                    const isCurrent = v.id === session.current.anchor.id;
                    // A fragment shows only its slice; the surah band belongs
                    // to the ayah that actually opens the surah, not to a tail
                    // carried over from the page before.
                    const tokens = v.aya_text.trim().split(/\s+/);
                    const shown = tokens.slice(from, to < 0 ? undefined : to).join(' ');
                    const opensSurah = (!prev || prev.sura_no !== v.sura_no) && v.aya_no === 1 && from === 0;
                    return (
                      <React.Fragment key={`${v.id}-${from}`}>
                        {opensSurah && <SurahBand name={surahNameAr(v.sura_no)} />}
                        <span
                          data-ayah={v.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => moveToAnchor(v.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); moveToAnchor(v.id); } }}
                          aria-label={`${surahName(v.sura_no)} ${v.aya_no}`}
                          aria-current={isCurrent ? 'true' : undefined}
                          // A ring around every word of the ayah reads as a
                          // grid of boxes, not as one marked verse — and this
                          // renderer is no longer only a fallback: it is how
                          // ash-Shamarly is read. Tint alone, no outlines.
                          className={`cursor-pointer rounded px-0.5 transition-colors ${
                            isCurrent ? 'bg-emerald-500/25' : 'hover:bg-emerald-500/10'
                          }`}
                        >
                          {shown}{' '}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/*
              Uncovering the marker's verse by hand.
              
              The listening does this on its own where a device can listen, and
              this is what a device that cannot is left with — and what anybody
              reciting without it uses. A plain tap: saying the verse and then
              looking at it is the exercise, not a lapse, so it does not have to
              cost a held thumb the way glancing under the old sheet did.
            */}
            {veiled && (
              <button
                type="button"
                data-reveal-ayah
                /*
                  The same move the listening makes, by hand: uncover the verse
                  the marker is on and step past it. Without the step it would
                  uncover the same verse however many times it was pressed — the
                  listening moves the marker itself, and by hand nothing does.
                */
                onClick={() => followedTo(session.current.anchor.id)}
                className="absolute bottom-1 end-2 rounded-full border border-emerald-600/40 bg-emerald-600/10 px-3 py-1 text-[11px] font-bold text-emerald-800 backdrop-blur hover:bg-emerald-600/20 dark:text-emerald-200"
              >
                {t('veilRevealAyah')}
              </button>
            )}

            {/* The printed page carries its number in a medallion on the
                bottom rule. It sits wholly inside the page now that no strip
                runs under it — half of it hanging past the edge was half of it
                clipped away. */}
            {fontReady && (
              <div
                aria-hidden
                className={`absolute bottom-1 left-1/2 flex h-6 w-12 -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${MUSHAF_SURFACE}`}
                style={{ border: '1px solid #b8860b', color: '#7a5c0a' }}
              >
                {printedPage === null ? '' : toArabicIndic(printedPage)}
              </div>
            )}

            {/*
              The one thing the majlis can be asked to do here, and it floats:
              the page is the screen, so a permanent bar under it would cost a
              line of the muṣḥaf for a button that is wanted once. It sits just
              above the note buttons and off to the side, leaving the page's own
              number medallion in view. It appears the moment the surah's closing
              page opens and goes when the teacher turns back — or when the
              surah has been confirmed and the majlis has moved on.
            */}
            {finishSurahReady && (
              <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-10 flex justify-start px-3">
                <button
                  onClick={finishSurah}
                  /*
                    The label is one word; the surah's name is left to the
                    reader's own eyes. It sits on the page that closes that
                    surah, with the name printed above it — repeating it made
                    the button wide enough to cover the page it belongs to.
                    A screen reader still hears the whole thing.
                  */
                  aria-label={`${t('recFinishedSurah')} ${surahName(closingSurah ?? session.sessionSurah)}`}
                  className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-700 active:scale-[0.99]"
                >
                  <CheckCheck size={17} />
                  {t('recComplete')}
                </button>
              </div>
            )}

            {/* Page-turn hints. Decorative — a swipe, the outer quarter of the
                page and the arrow keys all turn it. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center justify-center text-emerald-900/25 opacity-0 transition-opacity group-hover:opacity-100 dark:text-emerald-100/25">
              {printedPage !== null && printedPage < lastPage && <ChevronLeft size={26} />}
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-14 items-center justify-center text-emerald-900/25 opacity-0 transition-opacity group-hover:opacity-100 dark:text-emerald-100/25">
              {printedPage !== null && printedPage > firstPage && <ChevronRight size={26} />}
            </div>
          </div>

          {/* The three buttons */}
          <div className="border-t border-emerald-900/10 px-1.5 py-1 dark:border-emerald-100/10 sm:px-4 sm:py-2.5 short:py-1">
            {/*
              The spoken correction, fixed at the verse the marker is already
              on. Offered only in a majlis: reciting alone there is nobody
              whose correction it would be.
            */}
            {sessionMode(session) === 'majlis' && (
              <div className="mb-1 flex justify-center short:hidden">
                <CorrectionRecorder
                  sessionId={session.id}
                  position={session.current}
                  disabled={!running}
                  onRecorded={(c: SessionCorrection) => onChange(addCorrection(session, c))}
                />
              </div>
            )}
            {/*
              The mirror of the block above, for a majlis of one: no shaykh to
              record, so the most that can be offered is a machine asking
              whether something it noticed was a slip. It draws nothing at all
              where the recogniser cannot run — see `SoloListenPanel`.
            */}
            {sessionMode(session) === 'solo' && (
              <div className="mb-1 short:hidden">
                <SoloListenPanel
                  onAt={setHeard}
                  index={index}
                  book={book}
                  canonical={canonical}
                  anchorNow={() => session.current.anchor.id}
                  disabled={!running}
                  /*
                    Two different numbers, and they must not be confused.

                    The follower reports the verse **finished**. That is the
                    reveal boundary: it is uncovered, and nothing after it is.

                    The **marker** goes to the verse after it, because that is
                    where the reciter now is — they finished one, so they are
                    saying the next. Leaving the marker on the finished verse
                    would keep it a line behind the reciting for the whole
                    sitting, which is what it was asked not to do.
                  */
                  onFollow={followedTo}
                  onAccept={(position, detail) => onChange({
                    ...session,
                    // A note, exactly like one the reciter pressed themselves —
                    // because that is what it is: they were asked, and said yes.
                    notes: [...session.notes, { ...makeNote(ACCEPTED_KIND, position), detail }],
                  })}
                />
              </div>
            )}
            <NoteButtons
              counts={counts}
              slots={slots}
              onNote={s => addSlot(s, false)}
              onLongNote={s => addSlot(s, true)}
              disabled={!running}
            />
            {/* The hint costs a line a short screen cannot spare. */}
            {/* Worth its line everywhere except a screen too short to spare one:
                nothing else tells you a long press adds the detail. */}
            <div className="mt-1 text-center text-[10px] text-muted-foreground sm:text-[11px] short:hidden">{t('recNoteHint')}</div>
          </div>
        </div>

        {/* Progress panel — desktop only; the strip above replaces it below lg. */}
        <aside className="hidden shrink-0 border-emerald-900/10 px-5 py-4 dark:border-emerald-100/10 lg:block lg:w-[300px] lg:border-s">
          <dl className="space-y-2.5 text-sm">
            <Row label={t('recGoal')} value={goalLabel(session.goal.kind, t)} />
            <Row label={t('recStartedAt')} value={startedLabel} />
            <Row label={t('recStartPos')} value={positionLabel(startPos)} />
            <Row label={t('recCurrentPos')} value={positionLabel(currentPos)} strong />
            <Row label={t('recDone')} value={`${pct}%`} strong />
            <Row label={t('recDuration')} value={formatClock(activeMs(session))} strong />
          </dl>

          <div className="my-4 h-2 overflow-hidden rounded-full bg-emerald-900/10 dark:bg-emerald-100/10">
            <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>

          <dl className="space-y-1.5 text-sm">
            {slots.map(slot => {
              const shown = onlyKind === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  data-tally={slot}
                  data-open={shown || undefined}
                  onClick={() => setOnlyKind(shown ? null : slot)}
                  aria-pressed={shown}
                  disabled={!counts[slot]}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-start transition-colors enabled:hover:bg-emerald-900/[0.05] disabled:opacity-50 dark:enabled:hover:bg-emerald-100/[0.05] ${
                    shown ? 'bg-emerald-900/[0.06] dark:bg-emerald-100/[0.06]' : ''
                  }`}
                >
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${NOTE_STYLE[slot].dot}`} aria-hidden />
                    {t(NOTE_LABEL_KEY[slot])}
                  </dt>
                  <dd className="font-bold tabular-nums text-foreground">{counts[slot] ?? 0}</dd>
                </button>
              );
            })}
          </dl>

          <NoteList
            entries={onlyKind ? entries.filter(e => e.slot === onlyKind) : entries}
            mushafId={session.mushafId}
            onRemove={removeEntry}
            onGo={goToEntry}
            t={t}
            heading={onlyKind ? t(NOTE_LABEL_KEY[onlyKind]) : undefined}
          />
        </aside>
      </div>

      {/* Juz' strip — thirty cells need room, so below lg it lives in the sheet. */}
      <div className="hidden border-t border-emerald-900/10 px-4 py-1.5 dark:border-emerald-100/10 lg:block">
        <JuzStrip juz={juz} t={t} />
      </div>

      {/* Mobile sheet: the full panel and the juz' strip, on demand. */}
      {sheet && (
        <div className="fixed inset-0 z-[183] flex items-end bg-black/40 lg:hidden" onClick={() => setSheet(null)}>
          <div
            className={`max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border-t border-emerald-900/15 p-4 shadow-2xl dark:border-emerald-100/15 ${MUSHAF_SURFACE}`}
            onClick={e => e.stopPropagation()}
            dir={dir}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">{session.studentName}</span>
              <button
                onClick={() => setSheet(null)}
                data-a11y-tap
                aria-label={t('close')}
                title={t('close')}
                className="-me-1 flex items-center justify-center rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Notes first when the notes were what was asked for. */}
            {sheet === 'notes' && (
              <NoteList entries={entries} mushafId={session.mushafId} onRemove={removeEntry} onGo={goToEntry} t={t} lead />
            )}

            <dl className="space-y-2.5 text-sm">
              <Row label={t('recGoal')} value={goalLabel(session.goal.kind, t)} />
              <Row label={t('recStartedAt')} value={startedLabel} />
              <Row label={t('recStartPos')} value={positionLabel(startPos)} />
              <Row label={t('recCurrentPos')} value={positionLabel(currentPos)} strong />
              <Row label={t('recDone')} value={`${pct}%`} strong />
              <Row label={t('recDuration')} value={formatClock(activeMs(session))} strong />
            </dl>

            <div className="my-4 h-2 overflow-hidden rounded-full bg-emerald-900/10 dark:bg-emerald-100/10">
              <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>

            {sheet !== 'notes' && (
              <NoteList entries={entries} mushafId={session.mushafId} onRemove={removeEntry} onGo={goToEntry} t={t} />
            )}

            <div className="mb-2 mt-4 text-xs font-bold text-muted-foreground">{t('recJuzStrip')}</div>
            <JuzStrip juz={juz} t={t} />
          </div>
        </div>
      )}

      {/* Undo chip */}
      {lastEntry && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[181] flex justify-center px-4 motion-safe:animate-in motion-safe:fade-in">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg ${NOTE_STYLE[lastEntry.slot].soft}`}>
            <span className={`text-xs font-bold ${NOTE_STYLE[lastEntry.slot].text}`}>
              {t(NOTE_LABEL_KEY[lastEntry.slot])} · {noteLabel(lastEntry, session.mushafId)}{lastEntry.word !== undefined && ` · ${t('recWordN').replace('{n}', String(lastEntry.word + 1))}`}
            </span>
            <button onClick={undoLast} className="flex items-center gap-1 text-xs font-bold text-foreground underline-offset-2 hover:underline">
              <Undo2 size={13} />
              {t('recUndo')}
            </button>
          </div>
        </div>
      )}

      {/* Long-press detail */}
      {detailEntry && (
        <div className="fixed inset-0 z-[182] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setDetailEntry(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="mb-3 text-sm font-bold text-foreground">
              {t(NOTE_LABEL_KEY[detailEntry.slot])} · {noteLabel(detailEntry, session.mushafId)}
            </div>
            {/*
              Labels that outlive the majlis, put on here because this is the
              moment the teacher knows what the place is — «متشابهات» among
              them, which is what makes the look-alikes appear in the report.
            */}
            <div className="mb-3">
              <PlaceTagRow
                anchorId={detailEntry.position.anchor.id}
                tags={tagsAt(detailEntry.position.anchor.id, tagsMap)}
                onChange={() => setTagsVersion(v => v + 1)}
              />
            </div>

            {detailEntry.slot === 'tajweed' && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {TAJWEED_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setDetailTag(v => (v === tag ? '' : tag))}
                    aria-pressed={detailTag === tag}
                    className={`rounded-full border-2 px-2.5 py-1 text-xs font-bold transition-all ${
                      detailTag === tag
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-border bg-background text-foreground hover:border-indigo-600/40'
                    }`}
                  >
                    {t(TAJWEED_TAG_KEY[tag])}
                  </button>
                ))}
              </div>
            )}
            <input
              autoFocus
              value={detailText}
              onChange={e => setDetailText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveDetail(); }}
              placeholder={t('recDetailPlaceholder')}
              className="w-full rounded-lg border-2 border-primary/20 bg-background px-3 py-2 text-sm text-foreground outline-none ring-primary/20 focus:border-primary focus:ring-2"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => removeEntry(detailEntry)}
                aria-label={t('recDeleteNote')}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 size={15} />
                {t('recDelete')}
              </button>
              <button onClick={saveDetail} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                {t('recSave')}
              </button>
              <button onClick={() => setDetailEntry(null)} className="rounded-lg bg-muted px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/70">
                {t('recCancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * The ornamented band a printed mushaf puts a surah's name in. Drawn rather
 * than imaged so it scales with the auto-fitted type and follows the theme.
 */

/**
 * Every note of the majlis, newest first, each with a way out.
 *
 * Kept short and scrollable: it belongs beside the page, not instead of it.
 */
/**
 * Every note of the majlis, newest first, each with its own delete.
 *
 * The five-second undo chip covers the note just taken. This covers the one
 * taken ten minutes ago and noticed now — a wrong tap, or a slip the student
 * corrected himself. So the control says «حذف» with a bin, not an ✕ that reads
 * as "close", and it is a full-sized target rather than a hairline glyph.
 */
const NoteList: React.FC<{
  entries: Entry[];
  mushafId: string;
  onRemove: (entry: Entry) => void;
  /** Takes the reader to the place — see `goToEntry`. */
  onGo?: (entry: Entry) => void;
  t: Translate;
  /** Opened *for* the notes: leads the sheet, and says so when there are none. */
  lead?: boolean;
  /** Names the filter when one is on, so the count below is not a mystery. */
  heading?: string;
}> = ({ entries, mushafId, onRemove, onGo, t, lead, heading }) => {
  if (!entries.length && !lead) return null;
  return (
    <div className={lead ? 'mb-5' : 'mt-4'}>
      <div className="mb-1.5 text-xs font-bold text-muted-foreground">
        {heading ?? t('recNotes')}{entries.length ? ` · ${entries.length}` : ''}
      </div>
      {lead && (
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('recDeleteNoteHint')}
        </p>
      )}
      {!entries.length ? (
        <p className="rounded-lg border border-dashed border-emerald-900/15 px-3 py-5 text-center text-[11px] text-muted-foreground dark:border-emerald-100/15">
          {t('recNoNotesYet')}
        </p>
      ) : (
        <ul className={`${lead ? 'max-h-[45dvh]' : 'max-h-56'} space-y-1 overflow-y-auto pe-0.5`}>
          {[...entries].reverse().map(n => (
            <li
              key={n.id}
              className="flex items-center gap-2 rounded-lg border border-emerald-900/10 bg-white/50 px-2 py-1 text-xs dark:border-emerald-100/10 dark:bg-white/[0.04]"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${NOTE_STYLE[n.slot].dot}`} aria-hidden />
              <button
                type="button"
                data-go
                onClick={() => onGo?.(n)}
                disabled={!onGo}
                aria-label={`${t(NOTE_LABEL_KEY[n.slot])} — ${noteLabel(n, mushafId)}`}
                className="min-w-0 flex-1 truncate text-start enabled:hover:underline"
              >
                <span className="font-bold">{t(NOTE_LABEL_KEY[n.slot])}</span>
                <span className="text-muted-foreground"> · {noteLabel(n, mushafId)}</span>
                {n.word !== undefined && (
                  <span className="text-muted-foreground"> · {t('recWordN').replace('{n}', String(n.word + 1))}</span>
                )}
                {n.detail && <span className="text-muted-foreground"> · {n.detail}</span>}
              </button>
              <button
                onClick={() => onRemove(n)}
                data-a11y-tap
                title={`${t('recDelete')} — ${t(NOTE_LABEL_KEY[n.slot])} ${noteLabel(n, mushafId)}`}
                aria-label={`${t('recDelete')} — ${t(NOTE_LABEL_KEY[n.slot])} ${noteLabel(n, mushafId)}`}
                className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const JuzStrip: React.FC<{ juz: ReturnType<typeof juzStates>; t: Translate }> = ({ juz, t }) => (
  <div className="flex items-center gap-[3px]" role="list" aria-label={t('recJuzStrip')}>
    {juz.map((state, i) => (
      <div
        key={i}
        role="listitem"
        title={`${t('recJuzWord')} ${i + 1}`}
        aria-label={`${t('recJuzWord')} ${i + 1}: ${t(juzStateKey(state))}`}
        className={`flex h-5 flex-1 items-center justify-center rounded text-[10px] font-bold tabular-nums transition-colors ${
          state === 'done' ? 'bg-emerald-600 text-white'
            : state === 'active' ? 'bg-emerald-600/20 text-emerald-800 ring-2 ring-emerald-600/60 dark:text-emerald-300'
            : state === 'pending' ? 'bg-emerald-900/10 text-muted-foreground dark:bg-emerald-100/10'
            : 'bg-transparent text-muted-foreground/30'
        }`}
      >
        {state === 'done' ? '✓' : i + 1}
      </div>
    ))}
  </div>
);

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className={`truncate text-end tabular-nums ${strong ? 'text-base font-bold text-foreground' : 'font-medium text-foreground'}`}>
      {value}
    </dd>
  </div>
);

type Translate = (key: Parameters<ReturnType<typeof useI18n>['t']>[0]) => string;

export function goalLabel(kind: RecitationSession['goal']['kind'], t: Translate): string {
  switch (kind) {
    case 'juz1': return t('recGoalJuz1');
    case 'juz5': return t('recGoalJuz5');
    case 'juz10': return t('recGoalJuz10');
    case 'juz15': return t('recGoalJuz15');
    case 'full': return t('recGoalFull');
    default: return t('recGoalCustom');
  }
}

function juzStateKey(state: ReturnType<typeof juzStates>[number]) {
  switch (state) {
    case 'done': return 'recJuzDone' as const;
    case 'active': return 'recJuzActive' as const;
    case 'pending': return 'recJuzPending' as const;
    default: return 'recJuzOut' as const;
  }
}

export default RecitationOverlay;
