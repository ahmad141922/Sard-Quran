/**
 * Following a reciter through a matn, so the line uncovers as they say it.
 *
 * ## Two things, and only one of them interrupts
 *
 * **Following**, while the reciter is going: where in the matn they have got
 * to, so the cover can lift off each line as it is said.
 *
 * **Reviewing**, once they stop: where the sounds and the text parted company,
 * put as questions they answer at their leisure. Nothing is written into the
 * majlis unless they say yes — the rule `asr/engine.ts` states, kept here as it
 * is kept for the muṣḥaf.
 *
 * Neither says anything mid-recitation. A machine that cut in to correct a
 * reciter would be wrong often enough to be worse than useless, and it would be
 * wrong at the one moment they most need not to be interrupted.
 *
 * ## Why it needs no aligner of its own
 *
 * `follow.ts` takes a numeric id and a list of sounds and knows nothing about
 * what either means. A bayt's number goes where a verse's anchor goes, and its
 * sounds come from `matn/phonemes`, which derives them from the text. So this
 * file is a poll loop and a bit of state — the thinking is all borrowed.
 *
 * ## It gives up quietly
 *
 * A device with no plugin, an engine that cannot report mid-recitation, a model
 * that will not download: every one of them leaves `canFollow` false and the
 * control undrawn. Reciting a matn from memory has to work without any of this.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { asrEngine } from '../asr/engine';
import { START, followStep, moved, type At, type FollowState } from '../asr/follow';
import { agreement } from '../asr/align';
import { answer, dismissRest, reviewRecitation, type AsrReview } from '../asr/review';
import type { Matn } from './load';
import { matnPhonemes, type MatnPhonemes } from './phonemes';
import { loadQuranPhonemes } from '../asr/phonemes';

/** How often the recitation so far is asked for. The muṣḥaf uses the same. */
export const FOLLOW_EVERY_MS = 1500;

/**
 * How far the recitation must drift before it is worth saying anything.
 *
 * The bar to *follow* is 0.7; the bar to interrupt somebody mid-recitation is
 * deliberately far lower than that, because the two mistakes are not equal.
 * Failing to notice a slip costs a slip. Calling one that did not happen stops
 * a reciter who was right, in the middle of a line, and teaches them to
 * distrust the thing — so the alert stays quiet unless the sounds and the text
 * have plainly parted company.
 */
export const STRAY_BELOW = 0.45;

/**
 * How much unplaceable recitation to hear first — roughly two seconds of it.
 *
 * Short of this the reciter has merely paused, cleared their throat, or been
 * misheard for a moment, and none of those is a mistake.
 */
export const STRAY_AFTER_SOUNDS = 26;

export type MatnFollowPhase = 'unavailable' | 'idle' | 'preparing' | 'listening' | 'reading' | 'review';

export interface MatnFollower {
  phase: MatnFollowPhase;
  /** 0..1 while the model downloads; null at every other moment. */
  progress: number | null;
  /**
   * Where the reciter is thought to be right now — bayt and word.
   *
   * A live estimate, and drawn as one. The marker follows the bayt they have
   * **finished**, which is a different and slower thing.
   */
  at: At | null;
  /** What the recitation and the text disagreed about, or null. */
  review: AsrReview | null;
  /** Whether the reciter can be played back their own voice at a moment. */
  canPlay: boolean;
  /** Whether the marker can be made to follow along — see the hook. */
  canFollow: boolean;
  play(atMs: number): void;
  start(): void;
  stop(): void;
  say(id: string, verdict: 'accepted' | 'dismissed'): void;
  sayRestFine(): void;
  clear(): void;
}

/**
 * How much more of the matn to hold a recitation against than was heard.
 *
 * The same slack the muṣḥaf uses: the passage has to reach past whatever was
 * recited, and the open-ended alignment — not a cleverer guess — is what stops
 * the surplus being read as lines the reciter skipped.
 */
export const PASSAGE_SLACK = 1.6;

export function useMatnFollow(
  matn: Matn | null,
  /** The bayt the marker is on when the recitation starts. */
  startAt: () => number,
  /**
   * Called with a bayt the reciter is confirmed to have finished.
   *
   * Absent means no following at all, and it is absent unless the caller asks:
   * a marker that moves on its own is something a reciter should have chosen.
   */
  onFollow?: (bayt: number) => void,
  /**
   * Called once when the reciting has plainly left the text.
   *
   * A cue, not a verdict: it says «that did not sound like the line», and the
   * reciter decides. Absent means no alerting, and it is absent unless the
   * caller asks — being interrupted is something somebody should have chosen.
   */
  onStray?: () => void,
): MatnFollower {
  const [phase, setPhase] = useState<MatnFollowPhase>('unavailable');
  const [progress, setProgress] = useState<number | null>(null);
  const [at, setAt] = useState<At | null>(null);
  const [review, setReview] = useState<AsrReview | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const follow = useRef<FollowState>(START);
  const from = useRef<number>(1);
  const sounds = useRef<MatnPhonemes | null>(null);
  const following = useRef(onFollow);
  following.current = onFollow;
  const straying = useRef(onStray);
  straying.current = onStray;
  /** Whether the alert has already been given for the current departure. */
  const strayed = useRef(false);
  const alive = useRef(true);

  /*
   * Whether following is wanted — a boolean, deliberately, and not the callback
   * itself.
   *
   * The caller rebuilds that callback whenever the session changes, and the
   * session changes every time the marker moves. Depending on its identity made
   * the effect below re-run on the first confirmed bayt and set the phase back
   * to `idle`, which tore down the poll: the cover lifted off exactly one line
   * and then the listening stopped. What the effect cares about is whether
   * anybody wants following, which does not change when a marker moves.
   */
  const wanted = !!onFollow;

  /**
   * Whether the marker can be made to follow along.
   *
   * A narrower thing than being able to listen at all: following needs the
   * engine to say what it has heard **so far**, and reviewing only needs it to
   * say so at the end. So a build that can record but not report mid-stream
   * still gets the questions, and simply is not offered the following.
   */
  const canFollow = typeof asrEngine().partial === 'function';

  useEffect(() => {
    alive.current = true;
    const engine = asrEngine();
    if (!matn) { setPhase('unavailable'); return; }
    engine.available()
      .then(ok => { if (alive.current) setPhase(phase => (phase === 'idle' || phase === 'unavailable') ? (ok ? 'idle' : 'unavailable') : phase); })
      .catch(() => { if (alive.current) setPhase('unavailable'); });
    return () => { alive.current = false; };
  }, [matn]);

  /*
   * The matn's sounds are derived once, when a session has one, rather than
   * inside the poll: the Shāṭibiyya is fifty thousand sounds, and a stutter
   * belongs anywhere but in the loop that runs while somebody is reciting.
   */
  useEffect(() => {
    if (!matn) { sounds.current = null; return; }
    let live = true;
    void loadQuranPhonemes().then(index => {
      if (!live) return;
      // The index is read for its two alphabets: what sounds exist, and how the
      // model spells them. Without the second the matn would be phonemised into
      // an alphabet the recogniser never emits, and would match nothing.
      sounds.current = matnPhonemes(matn, index);
    });
    return () => { live = false; };
  }, [matn]);

  const start = useCallback(() => {
    const engine = asrEngine();
    setPhase('preparing');
    setProgress(0);
    void engine.prepare(f => { if (alive.current) setProgress(f); })
      .then(ready => {
        if (!alive.current) return;
        setProgress(null);
        if (!ready) { setPhase('idle'); return; }
        return engine.start().then(started => {
          if (!alive.current) return;
          if (!started) { setPhase('idle'); return; }
          follow.current = START;
          strayed.current = false;
          from.current = startAt();
          setAt(null);
          setPhase('listening');
        });
      })
      .catch(() => { if (alive.current) { setProgress(null); setPhase('idle'); } });
  }, [startAt]);

  /**
   * Ends the recitation and asks what it heard.
   *
   * The passage held against it starts where recording started — that one is
   * known exactly — and runs far enough past it to cover anything that could
   * have been said. `openEnd` then measures how far the reciter reached rather
   * than accusing them of skipping the rest.
   */
  const stop = useCallback(() => {
    const engine = asrEngine();
    setPhase('reading');
    setAt(null);
    void engine.stop()
      .then(result => {
        if (!alive.current) return;
        follow.current = START;
        const index = sounds.current;
        if (!result || !index) { setPhase('idle'); return; }

        const need = Math.ceil(result.phonemes.length * PASSAGE_SLACK);
        let last = from.current;
        for (let n = from.current, got = 0; got < need; n++) {
          const size = index.sizeOf(n);
          if (!size) break;
          got += size;
          last = n;
        }

        setCanPlay(typeof engine.play === 'function' && result.phonemes.length > 0);
        setReview(reviewRecitation(
          index.expected(from.current, last), result.phonemes, result.durationMs, { openEnd: true },
        ));
        setPhase('review');
      })
      .catch(() => { if (alive.current) { setPhase('idle'); follow.current = START; } });
  }, []);

  /** Drops the questions and whatever audio was kept for them. */
  const clear = useCallback(() => {
    asrEngine().discard?.();
    setReview(null);
    setCanPlay(false);
    setPhase('idle');
  }, []);

  const say = useCallback((id: string, verdict: 'accepted' | 'dismissed') => {
    setReview(r => (r ? answer(r, id, verdict) : r));
  }, []);

  const sayRestFine = useCallback(() => {
    setReview(r => (r ? dismissRest(r) : r));
  }, []);

  const play = useCallback((atMs: number) => { asrEngine().play?.(atMs); }, []);

  useEffect(() => {
    // Nothing to poll for where nobody is following, or where the engine cannot
    // say what it has heard until the end.
    if (phase !== 'listening' || !wanted) return;
    const engine = asrEngine();
    if (!engine.partial) return;
    let live = true;

    const timer = setInterval(() => {
      void (async () => {
        const heard = await engine.partial?.().catch(() => null);
        const index = sounds.current;
        if (!live || !heard || !heard.length || !index) return;

        // Only what comes after the bayt already confirmed: the sounds already
        // accounted for are not offered again.
        const begin = (follow.current.anchorId ?? from.current - 1) + 1;
        const ahead = index.ahead(begin);
        const next = followStep(ahead, heard, follow.current);
        const wasMove = moved(follow.current, next);

        /*
         * Whether the reciting has plainly left the text.
         *
         * Measured on the stretch since the last line that was placed: if a
         * good deal has been said and none of it fits what should come next,
         * the reciter is somewhere the matn is not. Said **once** per
         * departure — a bell that keeps ringing while somebody is trying to
         * remember is worse than no bell — and armed again only once they are
         * back on the text, which is what confirming a line means.
         */
        if (wasMove) {
          strayed.current = false;
        } else if (!strayed.current) {
          const tail = heard.slice(follow.current.heardUsed);
          const window = ahead.flatMap(a => a.expected);
          if (tail.length >= STRAY_AFTER_SOUNDS && window.length
              && agreement(window, tail, undefined, true) < STRAY_BELOW) {
            strayed.current = true;
            straying.current?.();
          }
        }

        follow.current = next;
        // The estimate is shown every poll; the marker moves only on a real one.
        setAt(next.at);
        if (wasMove && next.anchorId !== null) following.current?.(next.anchorId);
      })();
    }, FOLLOW_EVERY_MS);

    return () => { live = false; clearInterval(timer); };
  }, [phase, wanted]);

  useEffect(() => () => { asrEngine().cancel(); }, []);

  return { phase, progress, at, review, canPlay, canFollow, play, start, stop, say, sayRestFine, clear };
}
