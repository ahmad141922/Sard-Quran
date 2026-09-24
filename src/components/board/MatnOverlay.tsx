/**
 * A session of reciting a matn, from first line to report.
 *
 * The Qur'an overlay and this one share their shape because the act is the
 * same act — someone recites from memory, someone listens without cutting in,
 * three buttons record what passed. What differs is everything underneath:
 * the reader flows instead of holding a page still, the bāb replaces the page
 * as the unit finished on purpose, and the third button names what a poem can
 * be got wrong in rather than what a recitation can.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, CheckCheck, Eye, EyeOff, List, ListX, Mic, MicOff, Minimize2, Moon, Pause, Play, Sun, Trash2, Undo2, X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/lib/theme';
import { useKeepAwake } from '@/lib/use-keep-awake';
import type { Matn } from '@/lib/matn/load';
import type { Shatr } from '@/lib/matn/registry';
import { matnEdition, matnName } from '@/lib/matn/registry';
import {
  atEndOfBab, completeBab, coverAbyat, matnProgressPct, matnVolume, moveToBayt,
  type MatnSession,
} from '@/lib/matn/session';
import {
  activeMs, addCorrection, addMark, closeSegment, formatClock, makeNote, sessionMarks, sessionMode,
  startSegment, type MatnNoteKind, type SessionCorrection,
} from '@/lib/recitation-session';
import {
  MATN_MAJLIS_SLOTS, MUSHAF_SURFACE, NOTE_LABEL_KEY, NOTE_STYLE, NoteButtons, SOLO_SLOTS, haptic,
  type MatnSlot,
} from './recitation-shared';
import LangToggle from './LangToggle';
import MatnReader from './MatnReader';
import MatnIndexSheet from './MatnIndexSheet';
import { useMatnFollow } from '@/lib/matn/use-matn-follow';
import { alertStray } from '@/lib/asr/alert-tone';
import AsrSuggestions from './AsrSuggestions';
import { candidateDetail } from '@/lib/asr/review';
import CorrectionRecorder from './CorrectionRecorder';

const UNDO_MS = 5000;

/**
 * The kind of note an accepted candidate becomes here.
 *
 * The same claim `ACCEPTED_KIND` makes for the muṣḥaf — a memory slip, never a
 * ḍabṭ one, because the model cannot hear tafkhīm or madd length and so is in
 * no position to say a rule was broken. Named again rather than borrowed only
 * because a matn's kinds are a narrower set than a muṣḥaf's; that the two stay
 * the same claim is asserted in `matn-review.test.tsx`.
 */
const ACCEPTED_MATN_KIND: MatnNoteKind = 'memory';

/** A bayt's words, in order — for pointing at the one that went wrong. */
function wordsOfBayt(matn: Matn, bayt: number): string[] | null {
  const line = matn.bayt(bayt);
  if (!line) return null;
  return `${line.sadr} ${line.ajz}`.split(/\s+/).filter(Boolean);
}

/**
 * Which half of the line a word falls in.
 *
 * A note pins to a shaṭr, and the recogniser reports a word — so the two have
 * to be reconciled somewhere, and counting the ṣadr's words is the whole of it.
 * A candidate with no word at all is put on the ṣadr, where the line starts.
 */
function shatrOfWord(matn: Matn, bayt: number, word: number | null): Shatr {
  const line = matn.bayt(bayt);
  if (!line || word === null) return 'sadr';
  const inSadr = line.sadr.split(/\s+/).filter(Boolean).length;
  return word < inSadr ? 'sadr' : 'ajz';
}

/** The word the recogniser thinks is being said, for showing under the toolbar. */
function wordAt(matn: Matn, bayt: number, word: number | null): string {
  if (word === null) return '';
  const line = matn.bayt(bayt);
  if (!line) return '';
  return `${line.sadr} ${line.ajz}`.split(/\s+/).filter(Boolean)[word] ?? '';
}

interface Props {
  session: MatnSession;
  matn: Matn;
  onChange: (next: MatnSession) => void;
  onMinimize?: () => void;
  onEnd: () => void;
  /**
   * Where this screen says what Android's back button should close.
   *
   * The shell can see that a matn session is open; it cannot see the chapter
   * index or the detail dialog raised over it, and would answer a press meant
   * for one of those by putting the whole app in the background. Optional —
   * the board embeds this too, and a browser has no such button.
   */
  back?: React.MutableRefObject<(() => boolean) | null>;
}

/**
 * A note or a mark, reduced to what this screen does with either.
 *
 * They live in separate lists on the session — a mark is not an error — but
 * the undo chip, the list and the detail sheet treat them alike, so they are
 * carried here as one shape with the slot saying which list to write back to.
 */
type Entry = {
  slot: MatnSlot; id: string; at: number; bayt: number; shatr: Shatr; detail?: string;
};

const MatnOverlay: React.FC<Props> = ({ session, matn, onChange, onMinimize, onEnd, back }) => {
  const { t, lang, dir } = useI18n();
  const [last, setLast] = useState<Entry | null>(null);
  const [detailFor, setDetailFor] = useState<Entry | null>(null);
  const [detailText, setDetailText] = useState('');
  const [listOpen, setListOpen] = useState(false);
  /** Read by a screen reader the instant something is recorded. */
  const [announcement, setAnnouncement] = useState('');
  const running = session.status === 'active';
  const [theme, toggleTheme] = useTheme();

  // A majlis outlasts the screen timeout, whatever is being recited.
  useKeepAwake(running);

  /*
   * The clock's heartbeat. The majlis overlay has always had one; this screen
   * never did, because its clock showed minutes and a minute passes between
   * enough other re-renders to look live anyway. With seconds on it, a clock
   * that only moved when somebody pressed a button would visibly freeze.
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const slots = sessionMode(session) === 'solo' ? SOLO_SLOTS : MATN_MAJLIS_SLOTS;

  const counts = useMemo(() => {
    const c: Partial<Record<MatnSlot, number>> = { mark: sessionMarks(session).length };
    for (const n of session.notes) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [session]);

  /**
   * Everything recorded this session, in the order it happened.
   *
   * Two lists in the model because only one of them is evidence of a mistake;
   * one running record on screen, because that is how the person who made
   * them remembers them.
   */
  const entries: Entry[] = useMemo(() => [
    ...session.notes.map(n => ({
      slot: n.kind as MatnSlot, id: n.id, at: n.at,
      bayt: n.position.bayt, shatr: n.position.shatr, detail: n.detail,
    })),
    ...sessionMarks(session).map(m => ({
      slot: 'mark' as MatnSlot, id: m.id, at: m.at,
      bayt: m.position.bayt, shatr: m.position.shatr, detail: m.detail,
    })),
  ].sort((a, b) => a.at - b.at), [session]);

  const bab = matn.babOf(session.current.bayt);
  const volume = matnVolume(session, matn.abwab);
  const pct = matnProgressPct(session);

  const record = useCallback((slot: MatnSlot, openDetail = false) => {
    const { bayt, shatr } = session.current;
    let id: string;
    if (slot === 'mark') {
      const next = addMark(session, session.current);
      const marks = sessionMarks(next);
      id = marks[marks.length - 1].id;
      onChange(next);
    } else {
      const note = makeNote(slot, session.current);
      id = note.id;
      onChange({ ...session, notes: [...session.notes, note] });
    }
    const entry: Entry = { slot, id, at: Date.now(), bayt, shatr };
    haptic();
    setLast(entry);
    setAnnouncement(`${t(NOTE_LABEL_KEY[slot])} — ${t('recBayt')} ${bayt}`);
    if (openDetail) { setDetailFor(entry); setDetailText(''); }
  }, [session, onChange, t]);

  /**
   * Drops whatever was recorded, from whichever list holds it.
   *
   * A note is a claim about a student, so taking it back must never be harder
   * than making it — the same rule the muṣḥaf overlay follows.
   */
  const removeEntry = useCallback(({ slot, id }: Entry) => {
    onChange(slot === 'mark'
      ? { ...session, marks: sessionMarks(session).filter(m => m.id !== id) }
      : { ...session, notes: session.notes.filter(n => n.id !== id) });
    setLast(current => (current?.id === id ? null : current));
    setDetailFor(current => (current?.id === id ? null : current));
    haptic(8);
  }, [session, onChange]);

  const undoLast = useCallback(() => {
    if (last) removeEntry(last);
  }, [last, removeEntry]);

  const saveDetail = useCallback(() => {
    if (!detailFor) return;
    const detail = detailText.trim() || undefined;
    onChange(detailFor.slot === 'mark'
      ? { ...session, marks: sessionMarks(session).map(m => m.id === detailFor.id ? { ...m, detail } : m) }
      : { ...session, notes: session.notes.map(n => n.id === detailFor.id ? { ...n, detail } : n) });
    setDetailFor(null);
  }, [detailFor, detailText, session, onChange]);

  useEffect(() => {
    if (!last) return;
    const timer = setTimeout(() => setLast(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [last]);

  /**
   * A tap pins the position and credits nothing.
   *
   * The same separation the muṣḥaf keeps: following the reciter has to be
   * free, and "this much was recited" is a claim made on purpose — below, by
   * finishing a bāb.
   */
  const pick = useCallback((bayt: number, shatr: Shatr) => {
    onChange(moveToBayt(session, bayt, shatr));
  }, [session, onChange]);

  /*
   * Jumping to a chapter. It moves the marker and nothing else — the goal this
   * majlis was started with is left alone, so looking something up cannot
   * quietly rewrite what the sitting set out to recite.
   */
  const [indexing, setIndexing] = useState(false);
  const goToBab = useCallback((bayt: number) => {
    onChange(moveToBayt(session, bayt, 'sadr'));
    setIndexing(false);
    haptic(8);
  }, [session, onChange]);

  /*
   * Reciting the matn from memory.
   *
   * The muṣḥaf covers the whole page and lets you press and hold to glance
   * under it. That is wrong here for two reasons.
   *
   * **A matn is recited line by line, and checked line by line.** The exercise
   * is: say the bayt from memory, then look at it. So revealing is the second
   * half of the exercise, not a lapse — a plain tap, not a held one.
   *
   * **Nothing else moves the marker.** The muṣḥaf turns pages by swipe and by
   * arrow key, so a reciter under its veil can still get on; a matn moves only
   * by tapping a line. Covering the reader outright would strand them at the
   * bayt they started on. So the cover hides the **text** and leaves the row,
   * its number and its tap targets alone.
   *
   * `revealedThrough` is the last line uncovered, so everything already recited
   * stays readable and everything ahead does not. It only ever goes forward
   * while the cover is on; switching the cover off and on again resets it to
   * the marker, which is the one deliberate way back.
   */
  const [veiled, setVeiled] = useState(false);
  const [revealedThrough, setRevealedThrough] = useState(0);

  const toggleVeil = useCallback(() => {
    setVeiled(on => {
      if (!on) setRevealedThrough(session.current.bayt - 1);
      return !on;
    });
    haptic(8);
  }, [session]);

  const revealCurrent = useCallback(() => {
    setRevealedThrough(n => Math.max(n, session.current.bayt));
    haptic(8);
  }, [session]);

  /*
   * The cover lifting itself, as the reciter says the line.
   *
   * This is the same following the muṣḥaf does, pointed at abyāt: the recogniser
   * says which bayt has been **finished**, the marker moves there, and the line
   * just recited uncovers behind it. Saying the bayt is what reveals it, which
   * is the exercise the cover exists for, done without a hand.
   *
   * It never runs ahead. The bayt in progress stays covered until it is
   * finished, so the cover cannot show a reciter the line they are still trying
   * to remember.
   *
   * «Reveal this bayt» stays where it is: this needs a device that can listen,
   * and reciting from memory has to work on one that cannot.
   */
  const followed = useCallback((bayt: number) => {
    onChange(moveToBayt(session, Math.min(bayt + 1, matn.abyat.length), 'sadr'));
    setRevealedThrough(n => Math.max(n, bayt));
    haptic(8);
  }, [session, onChange, matn]);

  /*
   * Listening is offered whenever the device can; **following** only while the
   * cover is on, because moving a marker nobody asked to have moved is a
   * surprise. So the questions afterwards are available either way.
   */
  /**
   * Being told, as it happens, that the reciting has left the text.
   *
   * Off unless it is switched on. It is the one thing here that interrupts
   * somebody mid-line, and the machine is wrong sometimes — so it has to be a
   * choice, and it stays a soft cue rather than a verdict: a short tone and a
   * tap, no words, nothing written down. What was actually noticed is put as a
   * question afterwards, where it can be answered properly.
   */
  const [alerting, setAlerting] = useState(false);
  const [strayAt, setStrayAt] = useState(0);

  const strayed = useCallback(() => {
    alertStray();
    haptic(18);
    setStrayAt(Date.now());
  }, []);

  const listener = useMatnFollow(
    matn,
    () => session.current.bayt,
    veiled ? followed : undefined,
    alerting ? strayed : undefined,
  );

  // The pulse is a moment, not a state: it clears itself.
  useEffect(() => {
    if (!strayAt) return;
    const timer = setTimeout(() => setStrayAt(0), 900);
    return () => clearTimeout(timer);
  }, [strayAt]);

  const finishBab = useCallback(() => {
    if (!bab) return;
    onChange(completeBab(session, bab));
    haptic(18);
  }, [bab, session, onChange]);

  const togglePause = useCallback(() => {
    onChange(running
      ? { ...session, status: 'paused', segments: closeSegment(session) }
      : { ...session, status: 'active', segments: startSegment(session) });
  }, [running, session, onChange]);

  // Keyed by position in the row, so 3 records whatever the third slot is in
  // this mode rather than a kind that may not be on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undoLast(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0) { e.preventDefault(); record(slots[i]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, slots, undoLast]);

  /**
   * Back unwinds this screen's own layers, innermost first, and stops there:
   * ending a session is a decision, never what a stray press does.
   */
  useEffect(() => {
    if (!back) return;
    const handler = () => {
      if (detailFor) { setDetailFor(null); return true; }
      if (listOpen) { setListOpen(false); return true; }
      if (indexing) { setIndexing(false); return true; }
      return false;
    };
    back.current = handler;
    // Cleared only while it is still ours — see the reader.
    return () => { if (back.current === handler) back.current = null; };
  }, [back, detailFor, listOpen, indexing]);

  const edition = matnEdition(session.matnId, lang);

  return (
    <div dir={dir} className={`fixed inset-0 z-[180] flex flex-col pt-safe pb-safe px-safe ${MUSHAF_SURFACE}`}>
      <header className="flex items-center gap-1 border-b border-emerald-900/10 px-2 py-2 dark:border-emerald-100/10 sm:gap-2 sm:px-3">
        {/*
          Ending, and saying so.

          This was a bare ✕ at the head of the bar, which everywhere else in
          this tool — and everywhere else on a phone — means «close this
          panel». Here it closes the session and writes the report, and a matn
          session cannot be reopened the way a majlis of Qur'an can. So it is
          marked the way the muṣḥaf's own end button is: filled, worded where
          there is room, and never mistaken for a dismissal.
        */}
        <button onClick={onEnd} aria-label={t('recEnd')} title={t('recEnd')} data-end data-a11y-tap
          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 sm:px-3">
          <X size={14} />
          <span className="hidden sm:inline">{t('recEnd')}</span>
        </button>
        <button onClick={togglePause} aria-label={t(running ? 'recPause' : 'recResume')} title={t(running ? 'recPause' : 'recResume')} data-pause data-a11y-tap
          className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-xs font-bold text-foreground">
            {matnName(session.matnId, lang)}
          </div>
          {/*
            The print, named on screen for the whole session. The edition owns
            the line numbers, so the teacher is always told which numbering
            they are following.
          */}
          {edition && (
            <div className="truncate text-[10px] text-muted-foreground">{edition}</div>
          )}
        </div>

        <div className="text-[11px] tabular-nums text-muted-foreground" data-clock>
          {formatClock(activeMs(session))}
        </div>
        {/* A session after ʿIshāʾ wants the same dark page the muṣḥaf gets. */}
        <button onClick={toggleTheme} data-theme-toggle data-a11y-tap
          aria-label={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
          className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <LangToggle />
        {/*
          The chapters, by name. A matn is one long scroll — nineteen chapters
          in al-Jazariyya, and a thousand abyāt in Ṭayyibat an-Nashr — and
          finding «bāb al-madd» by dragging past everything before it is the
          fussing this tool exists to remove.
        */}
        {/*
          Listening, so the cover lifts as the line is said.

          Drawn wherever the device can listen at all, which the hook answers
          with `unavailable`. The cover is a separate switch: with it on the
          line uncovers as it is said, with it off this is simply a recording
          that asks its questions at the end.
        */}
        {listener.phase !== 'unavailable' && (
          <button
            onClick={() => (listener.phase === 'listening' ? listener.stop() : listener.start())}
            data-matn-listen
            data-a11y-tap
            aria-pressed={listener.phase === 'listening'}
            aria-label={listener.phase === 'listening' ? t('matnFollowStop') : t('matnFollowStart')}
            title={listener.phase === 'listening' ? t('matnFollowStop') : t('matnFollowStart')}
            className={`flex items-center justify-center rounded-lg p-1.5 ${
              listener.phase === 'listening'
                ? 'text-emerald-500'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {listener.phase === 'listening' ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
        )}

        {/*
          Whether to be told mid-recitation. Offered only where the marker can
          be followed at all, since that is what notices the departure.
        */}
        {listener.canFollow && listener.phase !== 'unavailable' && (
          <button
            onClick={() => { setAlerting(v => !v); haptic(8); }}
            data-alert-toggle
            data-a11y-tap
            aria-pressed={alerting}
            aria-label={alerting ? t('matnAlertOff') : t('matnAlertOn')}
            title={alerting ? t('matnAlertOff') : t('matnAlertOn')}
            className={`flex items-center justify-center rounded-lg p-1.5 ${
              alerting ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {alerting ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
        )}

        {/* Reciting from memory — see `toggleVeil`. */}
        <button
          onClick={toggleVeil}
          data-toggle-veil
          data-a11y-tap
          aria-label={veiled ? t('matnVeilShow') : t('matnVeilHide')}
          title={veiled ? t('matnVeilShow') : t('matnVeilHide')}
          aria-pressed={veiled}
          className={`flex items-center justify-center rounded-lg p-1.5 ${
            veiled ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {veiled ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          onClick={() => setIndexing(true)}
          data-open-index
          data-a11y-tap
          aria-label={t('matnIndex')}
          title={t('matnIndex')}
          className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => setListOpen(true)}
          data-open-list
          data-a11y-tap
          aria-label={`${t('recNotes')} — ${entries.length}`}
          className="flex items-center justify-center rounded-lg px-2 py-1.5 text-[11px] font-bold tabular-nums text-muted-foreground hover:text-foreground"
        >
          {entries.length}
        </button>
        {onMinimize && (
          <button onClick={onMinimize} aria-label={t('recMinimize')} title={t('recMinimize')} data-a11y-tap
            className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <Minimize2 size={16} />
          </button>
        )}
      </header>

      {/*
        The cue, seen as well as heard.

        A tone alone is no use to somebody reciting in a quiet room with the
        sound off, or to anyone who cannot hear it — and it is gone the instant
        it plays, so a reciter who half-noticed has nothing to look at. A brief
        band across the top says the same thing and takes no room from the
        matn. It carries no words: what was actually noticed is a question for
        afterwards, not a label to slap on a line mid-recitation.
      */}
      {strayAt > 0 && (
        <div
          data-stray-cue
          role="status"
          aria-label={t('matnAlertHint')}
          className="h-1 w-full shrink-0 animate-pulse bg-amber-500/70"
        />
      )}

      <div className="min-h-0 flex-1">
        <MatnReader
          matn={matn}
          current={session.current}
          onPick={pick}
          hideFrom={veiled ? revealedThrough + 1 : null}
          onReveal={revealCurrent}
          dir={dir as 'rtl' | 'ltr'}
        />
      </div>

      {/*
        What the recording noticed, put as questions.

        The same component the muṣḥaf uses, because it was written to take the
        numbering from its caller — «which bayt» here where it is «which āyah»
        there. Accepting one writes a خطأ حفظ at that half-line, which is what
        the machine is in a position to claim: not that a rule was broken, but
        that the sounds were not the sounds of the text.
      */}
      {listener.phase === 'review' && listener.review && (
        <div data-matn-review className="max-h-[45vh] overflow-y-auto border-t border-emerald-900/10 px-3 py-2 dark:border-emerald-100/10">
          <AsrSuggestions
            review={listener.review}
            label={bayt => `${t('recBayt')} ${bayt}`}
            textOf={bayt => { const b = matn.bayt(bayt); return b ? `${b.sadr} ${b.ajz}` : null; }}
            textFont="Amiri, serif"
            wordsOf={bayt => wordsOfBayt(matn, bayt)}
            onAccept={c => {
              const at = { bayt: c.anchorId, shatr: shatrOfWord(matn, c.anchorId, c.word) };
              onChange({
                ...session,
                notes: [...session.notes, {
                  ...makeNote<typeof session.current, MatnNoteKind>(
                    ACCEPTED_MATN_KIND, { ...session.current, ...at },
                  ),
                  detail: candidateDetail(c, t),
                }],
              });
              listener.say(c.id, 'accepted');
            }}
            onDismiss={c => listener.say(c.id, 'dismissed')}
            onDismissRest={listener.sayRestFine}
            onPlay={listener.canPlay ? listener.play : undefined}
          />
          <button
            type="button"
            data-review-close
            onClick={listener.clear}
            className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {t('close')}
          </button>
        </div>
      )}

      {/*
        Said once, under the toolbar, and only while the cover is on: a reciter
        who has just switched it on needs to know the line is hidden on purpose
        and how to see it, and after that the covered rows say it themselves.
      */}
      {veiled && listener.phase !== 'review' && (
        <p data-veil-hint className="border-t border-emerald-900/10 px-4 py-1.5 text-center text-[11px] text-muted-foreground dark:border-emerald-100/10">
          {alerting && listener.phase === 'idle'
            ? t('matnAlertHint')
            : listener.phase === 'preparing'
            ? `${t('matnFollowPreparing')}${listener.progress === null ? '' : ` ${Math.round(listener.progress * 100)}%`}`
            : listener.phase === 'listening'
              ? <>
                  {t('matnFollowListening')}
                  {/*
                    The word it thinks is being said now — an estimate, drawn as
                    one, and never the thing that uncovers a line. What uncovers
                    a line is the bayt being finished.
                  */}
                  {listener.at?.word !== null && listener.at !== null && (
                    <span data-at-word className="ms-2 font-[Amiri,serif] text-[13px] text-emerald-700 dark:text-emerald-300">
                      {wordAt(matn, listener.at.anchorId, listener.at.word)}
                    </span>
                  )}
                </>
              : t('matnVeilHint')}
        </p>
      )}

      {/*
        The finish button appears only at the last line of the bāb — the matn's
        counterpart of opening a surah's last page. It must never arrive ahead
        of the student.
      */}
      {indexing && (
        <MatnIndexSheet
          matn={matn}
          current={session.current.bayt}
          onGo={goToBab}
          onClose={() => setIndexing(false)}
        />
      )}

      {atEndOfBab(session, bab) && (
        <div className="border-t border-emerald-900/10 px-3 py-2 dark:border-emerald-100/10">
          <button onClick={finishBab} data-finish-bab
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            <CheckCheck size={16} />
            {`${t('recFinishedBab')} — ${dir === 'rtl' ? bab!.titleAr : bab!.titleEn}`}
          </button>
        </div>
      )}

      <div className="border-t border-emerald-900/10 px-1.5 py-1 dark:border-emerald-100/10 sm:px-4 sm:py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span data-progress>{pct}%</span>
          {/*
            The correction is fixed where the marker already is — the teacher
            has just tapped the line they are talking about, so there is no
            second thing to aim at.
          */}
          {sessionMode(session) === 'majlis' && (
            <CorrectionRecorder
              sessionId={session.id}
              position={session.current}
              disabled={!running}
              onRecorded={(c: SessionCorrection<typeof session.current>) =>
                onChange(addCorrection(session, c))}
            />
          )}
          <span data-volume>{volume.abyat} · {volume.abwabDone}</span>
        </div>
        <NoteButtons
          slots={slots}
          counts={counts}
          onNote={record}
          onLongNote={slot => record(slot, true)}
          disabled={!running}
        />
      </div>

      {/*
        What was recorded, so it can be read back and taken out.

        Without this the only way to undo something is the five-second chip,
        which catches the slip you notice at once and nothing else.
      */}
      {listOpen && (
        <div className="fixed inset-0 z-[182] flex items-end bg-black/40" onClick={() => setListOpen(false)}>
          <div dir={dir} onClick={e => e.stopPropagation()}
            className={`max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl border-t border-emerald-900/15 p-4 dark:border-emerald-100/15 ${MUSHAF_SURFACE}`}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                {t('recNotes')}{entries.length ? ` · ${entries.length}` : ''}
              </span>
              <button
                onClick={() => setListOpen(false)}
                data-a11y-tap
                aria-label={t('close')}
                title={t('close')}
                className="-me-1 flex items-center justify-center rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            {entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-emerald-900/15 px-3 py-6 text-center text-[11px] text-muted-foreground dark:border-emerald-100/15">
                <ListX size={16} className="mx-auto mb-1.5 opacity-50" />
                {t('recNoNotesYet')}
              </p>
            ) : (
              <ul className="space-y-1">
                {[...entries].reverse().map(e => (
                  <li key={e.id} data-entry={e.id}
                    className="flex items-center gap-2 rounded-lg border border-emerald-900/10 bg-white/50 px-2 py-1 text-xs dark:border-emerald-100/10 dark:bg-white/[0.04]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${NOTE_STYLE[e.slot].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-bold">{t(NOTE_LABEL_KEY[e.slot])}</span>
                      <span className="text-muted-foreground">
                        {' · '}{t('recBayt')} {e.bayt} ({e.shatr === 'sadr' ? t('recSadr') : t('recAjz')})
                      </span>
                      {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
                    </span>
                    <button onClick={() => removeEntry(e)} data-remove data-a11y-tap
                      aria-label={t('recDelete')} title={t('recDelete')}
                      className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Long press adds a word about what happened — as in the muṣḥaf. */}
      {detailFor && (
        <div className="fixed inset-0 z-[183] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setDetailFor(null)}>
          <div dir={dir} onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <div className="mb-3 text-sm font-bold text-foreground">
              {t(NOTE_LABEL_KEY[detailFor.slot])} · {t('recBayt')} {detailFor.bayt}
            </div>
            <input
              data-detail
              autoFocus
              value={detailText}
              onChange={ev => setDetailText(ev.target.value)}
              onKeyDown={ev => { if (ev.key === 'Enter') saveDetail(); }}
              className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <div className="flex gap-2">
              <button onClick={() => removeEntry(detailFor)}
                className="rounded-lg px-3 py-2 text-sm font-bold text-destructive hover:bg-destructive/10">
                {t('recDelete')}
              </button>
              <button onClick={saveDetail} data-save-detail
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                {t('recSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announced, not drawn: the teacher's eyes stay on the page. */}
      <div aria-live="polite" className="sr-only">{announcement}</div>

      {last && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[181] flex justify-center px-4">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg ${NOTE_STYLE[last.slot].soft}`}>
            <span className={`text-xs font-bold ${NOTE_STYLE[last.slot].text}`}>
              {t(NOTE_LABEL_KEY[last.slot])}
            </span>
            <button onClick={undoLast} data-undo
              className="flex items-center gap-1 text-xs font-bold text-foreground hover:underline">
              <Undo2 size={13} />
              {t('recUndo')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatnOverlay;
export { coverAbyat };
