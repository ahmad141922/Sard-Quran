/**
 * Driving the recogniser through one solo recitation.
 *
 * Holds the little state machine between «press to record» and a list of
 * questions: prepare, listen, read, review. Everything it decides is delegated
 * to the pure modules beside it — this file only sequences them and keeps the
 * screen honest about which step it is on.
 *
 * ## It gives up quietly, everywhere
 *
 * A device without the plugin, a model that will not download, a permission
 * refused, a passage the index does not cover: every one of these ends as
 * `unavailable` or `idle`, never as an error the reciter has to dismiss. The
 * feature is an addition to reciting alone; a majlis that cannot use it should
 * not know it exists. This is the same posture as the matn and the share link.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { asrEngine } from './engine';
import { loadQuranPhonemes, type AyahRef, type QuranPhonemes } from './phonemes';
import { answer, dismissRest, reviewRecitation, type AsrReview } from './review';
import { reached } from './align';
import { sourceOfCandidate } from './source';
import { START, followStep, moved, type Ahead, type At, type FollowState } from './follow';
import type { QuranIndex } from '../quran-index';

export type AsrPhase =
  /** No plugin, no model, or no microphone. The button is not drawn. */
  | 'unavailable'
  | 'idle'
  /** Waiting for the reciter to agree to download the model — see `consent`. */
  | 'consent'
  | 'preparing'
  | 'listening'
  | 'reading'
  | 'review';

export interface AsrController {
  phase: AsrPhase;
  /** 0..1 while the model downloads; null at every other moment. */
  progress: number | null;
  review: AsrReview | null;
  /**
   * Whether the reciter can be played back their own voice at a candidate.
   *
   * False on an engine that keeps no audio, and on a sitting too long to have
   * been kept. The button is then not drawn at all — see `AsrSuggestions`.
   */
  canPlay: boolean;
  play(atMs: number): void;
  /**
   * Whether this engine can report mid-recitation at all.
   *
   * False on the browser and on any build without the plugin, and the switch
   * is then not offered — a control that cannot work is worse than none.
   */
  canFollow: boolean;
  /**
   * Where the recitation is thought to be right now — verse and word.
   *
   * A live estimate, never a record: it changes every poll and is usually
   * mid-word. For showing only; the marker follows the confirmed verse.
   */
  at: At | null;
  /** While `phase` is 'consent': the size of the download being asked about. */
  consentBytes: number | null;
  start(): void;
  /** The reciter agreed to the download: fetch the model and start listening. */
  agree(): void;
  stop(): void;
  cancel(): void;
  say(id: string, verdict: 'accepted' | 'dismissed'): void;
  sayRestFine(): void;
  clear(): void;
}

/**
 * The verses between two anchors, inclusive, as the phoneme index wants them.
 *
 * Anchors are the canonical numbering, which is also the numbering the index
 * was built in, so no conversion happens here — and none should: a numbering
 * guessed at this seam would silently compare a reciter against the wrong
 * verses.
 */
export function passageBetween(index: QuranIndex, from: number, to: number): AyahRef[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out: AyahRef[] = [];
  for (let id = lo; id <= hi; id++) {
    const loc = index.locOf(id);
    if (loc) out.push({ surah: loc.surah, ayah: loc.ayah, anchorId: id });
  }
  return out;
}

/**
 * How much further than the marker the passage is allowed to run.
 *
 * The marker used to have to be exactly where the reciter stopped, because the
 * passage ended at it. Nobody moves a marker perfectly while reciting from
 * memory, and getting it wrong did not say «the marker is behind» — it said
 * «the recording was not clear enough», which blames the room for a
 * bookkeeping mistake.
 *
 * So the passage now runs well past wherever the marker got to, and the
 * alignment decides where the recitation actually stopped (`openEnd` in
 * `align.ts`). This is the slack: the recitation cannot be longer in sounds
 * than it is, so a generous multiple of what was heard always covers it.
 */
export const PASSAGE_SLACK = 1.6;

/**
 * The passage to hold a recitation against.
 *
 * Starts where recording started — that one is known exactly, because it was
 * read the moment the button was pressed. Ends far enough past the marker to
 * cover everything that could have been recited, and no attempt is made to
 * guess more precisely than that: guessing is what the open-ended alignment
 * exists to avoid.
 */
/**
 * The passage cut back to what was actually recited, at a verse boundary.
 *
 * ## Why a boundary, and not wherever the alignment liked
 *
 * Letting the text stop anywhere looked right and was badly wrong. A reciter
 * said «الف لام را» where the muṣḥaf has «الم»; instead of «you read something
 * else at the end», the cheapest reading became «you stopped five sounds in,
 * and the rest was extra» — and the leftover was too short to report, so a real
 * mistake vanished silently. Every slip near the end of a recitation would have
 * gone the same way.
 *
 * A recitation ends where a verse ends. Trimming to that, and then aligning
 * normally, makes a slip at the end a slip again. Stopping genuinely mid-verse
 * is reported as the rest of that verse not being recited — which is true, and
 * which the reciter can dismiss in one press.
 */
export function trimToVerse(
  passage: AyahRef[], phonemes: QuranPhonemes, reachedSounds: number,
): AyahRef[] {
  const out: AyahRef[] = [];
  let symbols = 0;
  for (const ref of passage) {
    out.push(ref);
    symbols += phonemes.sizeOf(ref.surah, ref.ayah);
    if (symbols >= reachedSounds) break;
  }
  // Never nothing: a recitation always happened somewhere.
  return out.length ? out : passage.slice(0, 1);
}

export function passageFor(
  index: QuranIndex, phonemes: QuranPhonemes,
  start: number, marker: number, heardSymbols: number,
): AyahRef[] {
  const need = Math.ceil(heardSymbols * PASSAGE_SLACK);
  const out: AyahRef[] = [];
  let symbols = 0;

  for (let id = Math.min(start, marker); ; id++) {
    const loc = index.locOf(id);
    if (!loc) break;
    out.push({ surah: loc.surah, ayah: loc.ayah, anchorId: id });
    symbols += phonemes.sizeOf(loc.surah, loc.ayah);
    // Never stop before the marker: wherever the reciter got to by hand is at
    // least as far as they read.
    if (id >= Math.max(start, marker) && symbols >= need) break;
  }
  return out;
}

/**
 * How often the marker is asked to catch up while somebody is reciting.
 *
 * Slow enough that a step's work is nothing beside the recogniser's, fast
 * enough that the marker is never more than a verse or so behind — which is
 * where it is meant to be anyway, since it moves to the verse *finished*.
 */
export const FOLLOW_EVERY_MS = 1500;

export function useAsrReview(
  index: QuranIndex | null,
  anchorNow: () => number | null,
  /**
   * Moves the marker to a verse the reciter has finished, while they recite.
   *
   * Absent means no following at all — and it is absent unless the caller asks
   * for it, because a marker that moves on its own is something a reciter
   * should have chosen.
   */
  onFollow?: (anchorId: number) => void,
): AsrController {
  const [phase, setPhase] = useState<AsrPhase>('unavailable');
  const [progress, setProgress] = useState<number | null>(null);
  const [review, setReview] = useState<AsrReview | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [consentBytes, setConsentBytes] = useState<number | null>(null);
  const from = useRef<number | null>(null);
  const follow = useRef<FollowState>(START);
  const [at, setAt] = useState<At | null>(null);
  const following = useRef(onFollow);
  following.current = onFollow;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    asrEngine().available()
      .then(ok => { if (alive.current) setPhase(ok ? 'idle' : 'unavailable'); })
      .catch(() => { if (alive.current) setPhase('unavailable'); });
    return () => {
      alive.current = false;
      // A recitation abandoned by closing the majlis must not leave the
      // microphone open behind it, nor its audio sitting in memory.
      asrEngine().cancel();
      asrEngine().discard?.();
    };
  }, []);

  /** Fetches the model if need be, then opens the microphone. */
  const begin = useCallback(() => {
    setConsentBytes(null);
    setPhase('preparing');
    setProgress(0);

    (async () => {
      const engine = asrEngine();
      const ready = await engine.prepare(f => { if (alive.current) setProgress(f); })
        .catch(() => false);
      if (!alive.current) return;
      setProgress(null);
      if (!ready) { setPhase('idle'); return; }

      const started = await engine.start().catch(() => false);
      if (!alive.current) return;
      setPhase(started ? 'listening' : 'idle');
    })();
  }, []);

  const start = useCallback(() => {
    const at = anchorNow();
    if (at === null) return;
    from.current = at;
    follow.current = START;
    setAt(null);
    setReview(null);

    (async () => {
      /*
       * A download the reciter has not agreed to never starts. The engine says
       * how big it would be; the panel asks; `agree` carries on from here.
       */
      const bytes = await asrEngine().needsDownload?.().catch(() => null) ?? null;
      if (!alive.current) return;
      if (bytes) {
        setConsentBytes(bytes);
        setPhase('consent');
        return;
      }
      begin();
    })();
  }, [anchorNow, begin]);

  /**
   * The marker catching up, while the recitation is still going.
   *
   * Everything that decides anything is in `follow.ts` and is pure; this only
   * fetches what has been heard and hands it over. Nothing here reports a
   * failure: a poll that finds nothing is the ordinary case between two
   * verses, and a timer that has to handle errors is one that will one day
   * handle them badly.
   */
  /*
   * Whether following is wanted — a boolean, and deliberately not the callback.
   *
   * The majlis rebuilds `onFollow` whenever the session changes, and the session
   * changes every time the marker moves. Depending on its identity tore this
   * timer down and rebuilt it on every confirmed verse, so the next poll waited
   * a fresh interval each time and the marker fell steadily further behind the
   * reciter. `use-matn-follow.ts` had the same shape and there it was fatal —
   * one line uncovered and the listening stopped. What the effect cares about is
   * whether anybody wants following, which does not change when a marker moves.
   */
  const wanted = !!onFollow;

  useEffect(() => {
    if (phase !== 'listening' || !wanted || !index) return;
    const engine = asrEngine();
    if (!engine.partial) return;

    let alive2 = true;
    const timer = setInterval(() => {
      void (async () => {
        const heard = await engine.partial?.().catch(() => null);
        if (!alive2 || !heard || !heard.length || from.current === null) return;

        const phonemes = await loadQuranPhonemes();
        if (!alive2 || !phonemes) return;

        // Only the passage after what is already confirmed, so the work per
        // step does not grow with the recitation — see `WINDOW_SOUNDS`.
        const begin = (follow.current.anchorId ?? from.current - 1) + 1;
        const ahead: Ahead[] = [];
        for (let id = begin; id < begin + 40; id++) {
          const loc = index.locOf(id);
          if (!loc) break;
          const expected = phonemes.expected([{ ...loc, anchorId: id }]);
          if (!expected.length) break;
          ahead.push({ anchorId: id, sounds: expected.length, expected });
        }

        const next = followStep(ahead, heard, follow.current);
        const wasMove = moved(follow.current, next);
        follow.current = next;
        // The estimate is shown on every poll; the marker only on a real move.
        setAt(next.at);
        if (wasMove && next.anchorId !== null) following.current?.(next.anchorId);
      })();
    }, FOLLOW_EVERY_MS);

    return () => { alive2 = false; clearInterval(timer); };
  }, [phase, wanted, index]);

  const stop = useCallback(() => {
    setPhase('reading');
    (async () => {
      const heard = await asrEngine().stop().catch(() => null);
      const at = anchorNow();
      if (!alive.current) return;
      if (!heard || !index || from.current === null || at === null) { setPhase('idle'); return; }

      const phonemes = await loadQuranPhonemes();
      if (!alive.current) return;
      // The index is what makes a comparison possible at all. Without it there
      // is nothing to hold the recitation against, and saying so would only
      // ask the reciter to fix something they cannot.
      if (!phonemes) { setPhase('idle'); return; }

      /*
       * Two passes, and the second is the one that judges.
       *
       * The first holds the recitation against a passage deliberately longer
       * than it, with an open end, only to ask **how far did they get**. The
       * second trims to the verse that answer lands in and aligns normally, so
       * a slip near the end is a slip rather than «they stopped early» — see
       * `trimToVerse`.
       */
      const padded = passageFor(index, phonemes, from.current, at, heard.phonemes.length);
      const got = reached(phonemes.expected(padded), heard.phonemes);
      const recited = trimToVerse(padded, phonemes, got);
      const expected = phonemes.expected(recited);
      const reviewed = reviewRecitation(expected, heard.phonemes, heard.durationMs);
      // Where a slip is another verse's wording, say which — see `source.ts`.
      const next = {
        ...reviewed,
        candidates: reviewed.candidates.map(c => ({
          ...c, source: sourceOfCandidate(phonemes, c, heard.phonemes, recited),
        })),
      };

      setAt(null);
      setReview(next);
      setCanPlay(!!heard.canPlay && !!asrEngine().play);
      setPhase('review');
    })();
  }, [index, anchorNow]);

  const cancel = useCallback(() => {
    asrEngine().cancel();
    setProgress(null);
    setConsentBytes(null);
    setPhase('idle');
  }, []);

  const say = useCallback((id: string, verdict: 'accepted' | 'dismissed') => {
    setReview(current => (current ? answer(current, id, verdict) : current));
  }, []);

  const sayRestFine = useCallback(() => {
    setReview(current => (current ? dismissRest(current) : current));
  }, []);

  const play = useCallback((atMs: number) => {
    asrEngine().play?.(atMs);
  }, []);

  const clear = useCallback(() => {
    // The recitation is kept only while it is being answered.
    asrEngine().discard?.();
    setCanPlay(false);
    setReview(null);
    setPhase('idle');
  }, []);

  return {
    phase, progress, review, canPlay, play,
    canFollow: !!asrEngine().partial,
    at,
    consentBytes,
    start, agree: begin, stop, cancel, say, sayRestFine, clear,
  };
}
