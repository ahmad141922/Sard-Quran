// Pieces shared by the full-screen recitation overlay and the floating console.

import React from 'react';
import { useI18n, type TranslationKey } from '@/hooks/useI18n';
import {
  sessionMarks, sessionMode,
  type MatnNoteKind, type NoteKind, type RecitationSession, type SessionNote,
} from '@/lib/recitation-session';
import { isCertain, type AyahPosition } from '@/lib/mushaf/position';
import { riwayaName } from '@/lib/mushaf/registry';
import { surahName } from '@/lib/quran-data';

/**
 * Categories a teacher actually flags mid-recitation. Kept separate from
 * TAJWEED_RULES (which indexes book pages, including front matter) because
 * these are fault types, not chapters.
 */
export const TAJWEED_TAGS = ['madd', 'ghunnah', 'qalqalah', 'tafkhim', 'noonMeem', 'makhraj'] as const;
export type TajweedTag = typeof TAJWEED_TAGS[number];

export const TAJWEED_TAG_KEY: Record<TajweedTag, TranslationKey> = {
  madd: 'recTagMadd',
  ghunnah: 'recTagGhunnah',
  qalqalah: 'recTagQalqalah',
  tafkhim: 'recTagTafkhim',
  noonMeem: 'recTagNoonMeem',
  makhraj: 'recTagMakhraj',
};

/**
 * What one of the three buttons records.
 *
 * The first two slots are always notes, and are the same in every mode — that
 * is what keeps sessions comparable. The third is the one that moves: a
 * tajweed note in a majlis of Qur'an, a ḍabṭ error in a majlis of matn, and a
 * mark whenever nobody is listening.
 *
 * A union rather than a widened `NoteKind`, because a mark is not an error and
 * must stay out of the error arithmetic. Here it only means the row has one
 * more thing it can draw.
 */
export type NoteSlot = NoteKind | MatnNoteKind | 'mark';

/** What a majlis of Qur'an can draw. */
export type QuranSlot = NoteKind | 'mark';
/** What a majlis of matn can draw. */
export type MatnSlot = MatnNoteKind | 'mark';

export const NOTE_LABEL_KEY: Record<NoteSlot, TranslationKey> = {
  hesitation: 'recHesitation',
  memory: 'recMemory',
  tajweed: 'recTajweed',
  shakl: 'recShakl',
  dabt: 'recDabt',
  mark: 'recMark',
};

/** Muted enough for a calm screen, separated enough to hit without looking. */
export const NOTE_STYLE: Record<NoteSlot, { solid: string; soft: string; text: string; dot: string }> = {
  hesitation: {
    solid: 'bg-amber-600 hover:bg-amber-700 text-white',
    soft: 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  memory: {
    solid: 'bg-rose-600 hover:bg-rose-700 text-white',
    soft: 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  tajweed: {
    solid: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    soft: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-400',
    dot: 'bg-indigo-500',
  },
  // Sky, not a fourth warning hue beside amber, rose and indigo: it has to be
  // told from the tajweed button at a glance while sitting next to it, and the
  // position does most of that work — the colour only has to not contradict it.
  shakl: {
    solid: 'bg-sky-600 hover:bg-sky-700 text-white',
    soft: 'bg-sky-50 dark:bg-sky-950/30 border-sky-300 dark:border-sky-800',
    text: 'text-sky-700 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
  // The ḍabṭ error shares the tajweed hue: it is the same slot doing the same
  // job — the thing a second person catches — with the name the text calls for.
  dabt: {
    solid: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    soft: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-400',
    dot: 'bg-indigo-500',
  },
  // Teal, away from the three warning hues on purpose: a mark is a place to
  // come back to, not something that went wrong, and the colour should not
  // tell the reciter otherwise at a glance.
  mark: {
    solid: 'bg-teal-600 hover:bg-teal-700 text-white',
    soft: 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-800',
    text: 'text-teal-700 dark:text-teal-400',
    dot: 'bg-teal-500',
  },
};

/**
 * Tap fires on click (so keyboard activation works); a 450 ms hold fires the
 * long-press instead and swallows the click that follows it.
 */
export function useLongPress(onTap: () => void, onLong: () => void, ms = 450) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressed = React.useRef(false);

  const clear = React.useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  React.useEffect(() => clear, [clear]);

  return {
    onPointerDown: () => {
      suppressed.current = false;
      clear();
      timer.current = setTimeout(() => { suppressed.current = true; onLong(); }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: () => {
      clear();
      if (suppressed.current) { suppressed.current = false; return; }
      onTap();
    },
  };
}

export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

// `as const` so each row keeps its own literal type. That is what lets the
// buttons below be generic in the slot, and what makes handing a matn row to
// the Qur'an overlay a compile error rather than a runtime surprise — the
// project builds with `strict: false`, so a widened parameter would otherwise
// be accepted in silence.

/** The majlis of Qur'an row. */
export const MAJLIS_SLOTS = ['hesitation', 'memory', 'tajweed', 'shakl'] as const;

/** The matn majlis row — the third names what a poem can be got wrong in. */
export const MATN_MAJLIS_SLOTS = ['hesitation', 'memory', 'dabt'] as const;

/** Two notes and a mark — what a session with nobody listening records, of
 *  either text: the mark belongs to both. */
export const SOLO_SLOTS = ['hesitation', 'memory', 'mark'] as const;

/**
 * The rows a report lists for a session, in the order the buttons sit in.
 *
 * One place, because the report has two renderings — the sheet that is
 * exported as an image and the modal around it — and a mark that appeared in
 * only one of them would be a mark the reciter could not send to themselves.
 */
export function reportRows(session: RecitationSession): {
  slot: NoteSlot;
  count: number;
  /** The notes themselves, so a word put on one travels to the report. */
  entries: { position: AyahPosition; word?: number }[];
}[] {
  const slots = sessionMode(session) === 'solo' ? SOLO_SLOTS : MAJLIS_SLOTS;
  return slots.map(slot => {
    const entries: { position: AyahPosition; word?: number }[] = slot === 'mark'
      ? sessionMarks(session)
      : session.notes.filter(n => n.kind === slot);
    return { slot, count: entries.length, entries };
  });
}

interface NoteButtonsProps<S extends NoteSlot> {
  onNote: (slot: S) => void;
  onLongNote: (slot: S) => void;
  counts?: Partial<Record<S, number>>;
  /**
   * Which buttons the row draws. Passed in rather than decided here, because
   * what belongs in the row is a fact about the session, and this file has no
   * session — the caller does. Three for a solo session or a matn, four for a
   * majlis of Qur'an since the wrong-vowel note was added.
   */
  slots: readonly S[];
  /** Tall buttons for the overlay, compact ones for the floating console. */
  size?: 'lg' | 'sm';
  disabled?: boolean;
}

export function NoteButtons<S extends NoteSlot>({
  onNote, onLongNote, counts, slots, size = 'lg', disabled,
}: NoteButtonsProps<S>) {
  const { t } = useI18n();
  return (
    <div className={`grid ${slots.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} ${size === 'lg' ? 'gap-1.5 sm:gap-3' : 'gap-1.5'}`}>
      {slots.map((slot, i) => (
        <NoteButton
          key={slot}
          kind={slot}
          index={i + 1}
          label={t(NOTE_LABEL_KEY[slot])}
          count={counts?.[slot]}
          size={size}
          disabled={disabled}
          onTap={() => onNote(slot)}
          onLong={() => onLongNote(slot)}
        />
      ))}
    </div>
  );
}

const NoteButton: React.FC<{
  kind: NoteSlot;
  index: number;
  label: string;
  count?: number;
  size: 'lg' | 'sm';
  disabled?: boolean;
  onTap: () => void;
  onLong: () => void;
}> = ({ kind, index, label, count, size, disabled, onTap, onLong }) => {
  const handlers = useLongPress(onTap, onLong);
  const style = NOTE_STYLE[kind];
  return (
    <button
      type="button"
      disabled={disabled}
      {...handlers}
      // The count is part of the label so a screen reader hears the running
      // total; the shortcut goes in aria-keyshortcuts rather than a bare
      // "(1)" that reads like a count.
      aria-label={count ? `${label}: ${count}` : label}
      aria-keyshortcuts={String(index)}
      className={`relative flex flex-row items-center justify-center gap-1.5 rounded-2xl font-bold
        shadow-sm transition-all duration-100 active:scale-[0.97] active:shadow-none disabled:opacity-40
        ${style.solid} touch-none select-none
        ${size === 'lg'
          // Wide enough to hit without looking even when short: on a phone the
          // buttons keep the full width and lose only height, which costs far
          // less accuracy than narrowing them would. The tally sits beside the
          // word rather than under it, which is a whole line of the muṣḥaf back.
          ? 'min-h-[38px] text-xs sm:min-h-[46px] sm:text-base short:min-h-[34px]'
          : 'min-h-[34px] text-xs'}`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`rounded-full bg-black/15 px-1.5 font-extrabold tabular-nums
          ${size === 'lg' ? 'text-[11px] sm:text-sm' : 'text-[10px]'}`}>
          {count}
        </span>
      )}
    </button>
  );
};

/** Cream page ground shared with the inserted verse card. */
export const MUSHAF_SURFACE = 'bg-[#fdf8ef] dark:bg-[#171512]';

/**
 * How a position is written for a teacher.
 *
 * The numbers come from the edition the position was recorded in — never
 * converted for display. A position that had to be carried across two
 * numberings and could not be pinned to the verse is marked `≈`, so an
 * approximation is never read as a citation.
 */
export function positionLabel(p: AyahPosition | null | undefined): string {
  if (!p) return '—';
  const label = `${surahName(p.surah)} ${p.ayah}`;
  return isCertain(p) ? label : `≈ ${label}`;
}

/**
 * The same, plus the riwaya when the note was taken in a different book from
 * the one the reader is looking at now — otherwise two numberings would sit
 * side by side in one list with nothing to tell them apart.
 */
export function positionLabelIn(p: AyahPosition, currentMushafId?: string): string {
  const label = positionLabel(p);
  if (!currentMushafId || p.mushafId === currentMushafId) return label;
  return `${label} · ${riwayaName(p.riwayaId)}`;
}

/**
 * Where an entry sits, named for the reader.
 *
 * Takes anything carrying a position rather than a `SessionNote`, because that
 * is all it ever reads — and marks need the same label as notes.
 */
export function noteLabel(n: { position: AyahPosition }, currentMushafId?: string): string {
  return positionLabelIn(n.position, currentMushafId);
}

/**
 * The ornamented band a printed muṣḥaf puts a surah's name in.
 *
 * Drawn rather than imaged so it scales with the auto-fitted type and follows
 * the theme. Its word stays Arabic in every interface language: it is part of
 * the page, not part of the interface, and «سُورَةُ Al-Kahf» would be neither.
 */
export const SurahBand: React.FC<{ name: string }> = ({ name }) => (
  <div dir="rtl" className="my-3 flex items-center justify-center gap-2 px-2" style={{ fontSize: '0.52em' }}>
    <Flourish />
    <div
      className="relative flex-1 rounded-md px-3 py-1.5 text-center font-bold leading-normal"
      style={{
        color: '#7a5c0a',
        background: 'linear-gradient(180deg, rgba(184,134,11,0.14), rgba(184,134,11,0.05))',
        border: '1px solid rgba(184,134,11,0.55)',
        boxShadow: 'inset 0 0 0 2px rgba(184,134,11,0.18)',
      }}
    >
      {`سُورَةُ ${name}`}
    </div>
    <Flourish mirrored />
  </div>
);

const Flourish: React.FC<{ mirrored?: boolean }> = ({ mirrored }) => (
  <svg
    aria-hidden
    width="26"
    height="14"
    viewBox="0 0 26 14"
    fill="none"
    style={{ flexShrink: 0, transform: mirrored ? 'scaleX(-1)' : undefined, opacity: 0.75 }}
  >
    <path d="M25 7H9" stroke="#b8860b" strokeWidth="1" strokeLinecap="round" />
    <path d="M9 7c0-3 -3-5 -5-5S0 4 0 7s2 5 4 5 5-2 5-5Z" stroke="#b8860b" strokeWidth="1" />
    <circle cx="4.5" cy="7" r="1.4" fill="#b8860b" />
  </svg>
);
