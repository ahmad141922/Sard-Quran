// Matching what was recited against what should have been, phoneme by phoneme.
//
// No React, no model, no audio. Two sequences of symbols go in and a list of
// places where they parted company comes out, so the whole judgement of this
// feature can be checked against hand-written examples.

/**
 * One recognised sound, and how sure the recogniser was of it.
 *
 * Confidence is not decoration. A model that mishears is the **model's**
 * failure, and reporting it as the reciter's mistake tells a child they erred
 * where they did not. Everything below exists to keep those two apart.
 */
export interface HeardPhoneme {
  symbol: string;
  /**
   * 0..1, or **null** where the decoder cannot say.
   *
   * Null is not zero and not one. sherpa-onnx's CTC path computes the most
   * likely symbol at each frame and discards how likely it was — the number
   * exists inside the model and never leaves the decoder. Treating that
   * silence as "certain" would license every claim; treating it as "unsure"
   * would silence every one. It is its own case, handled in `findCandidates`.
   */
  confidence: number | null;
  /** Milliseconds into the recording, for taking the reciter back to it. */
  atMs: number;
}

/** One expected sound, and the verse it belongs to. */
export interface ExpectedPhoneme {
  symbol: string;
  /** Anchor id of the verse this sound is part of. */
  anchorId: number;
  /**
   * Word index within that verse, or null where the boundaries are not known.
   *
   * Null is a real answer, not a missing one: six āyāt cannot be split into
   * words reliably (see `scripts/build-quran-phonemes.mjs`), and a candidate
   * that points confidently at the wrong word is worse than one that points at
   * the verse.
   */
  word: number | null;
}

export type DivergenceKind = 'substitution' | 'omission' | 'insertion';

/**
 * A stretch where the recitation and the text parted company.
 *
 * Called a **candidate**, never an error: it is what the machine noticed, and
 * whether it was a slip is the reciter's to say. See `asr/engine`.
 */
export interface Candidate {
  kind: DivergenceKind;
  /** Where in the muṣḥaf, by anchor — the scheme the whole model uses. */
  anchorId: number;
  /** Null where the verse's word boundaries are not known — see above. */
  word: number | null;
  /** Milliseconds into the recording, or null for something never uttered. */
  atMs: number | null;
  expected: string[];
  heard: string[];
  /**
   * Lowest confidence among the heard symbols; 1 when nothing was heard, and
   * null when the decoder rated none of them — see `HeardPhoneme`.
   */
  confidence: number | null;
  /**
   * Where the run sits in the heard sequence: `heard.slice(heardFrom, heardTo)`.
   * Empty (from === to) for an omission. For looking at what was said around
   * it — see `source.ts`.
   */
  heardFrom?: number;
  heardTo?: number;
}

/**
 * Below this, a mismatch says more about the recogniser than the reciter.
 *
 * Chosen high on purpose. The cost of a missed slip is that the reciter
 * carries on unaware, which is where they already were; the cost of a false
 * one is a child told they erred when they did not, in a tool whose whole
 * claim is that it records what actually happened.
 */
export const MIN_CONFIDENCE = 0.6;

/**
 * A run of divergences shorter than this is noise — a breath, a pause, the
 * boundary between two words heard as one.
 */
export const MIN_RUN = 2;

/**
 * The run a divergence must span when the decoder rated nothing.
 *
 * Longer, because it is then the only structural filter left: with no
 * per-symbol confidence there is nothing to tell a mishearing from a slip.
 *
 * A run counts both sides, so one sound heard as another is 2 and two-for-two
 * is 4 — both of which are what a word boundary heard slightly wrong looks
 * like. Measured on a real recitation, a word of the Qur'an runs about four
 * sounds, so a whole word misread scores 8. Five admits that and excludes the
 * artefacts.
 *
 * This is a **quality** floor, not the integrity guarantee. That one is
 * elsewhere and is unaffected: nothing here becomes a note until a person is
 * asked and says yes.
 */
export const MIN_RUN_UNRATED = 5;

interface Step { op: 'match' | DivergenceKind; e: number; h: number }

/**
 * How far the two sequences may drift apart before the alignment stops
 * following them.
 *
 * A full Needleman–Wunsch matrix costs `expected × heard` cells. For a verse
 * that is nothing; for a page, a megabyte; for a juzʾ recited in one sitting,
 * **1.4 GB** — which is not slow, it is the end of the app. The reciter reading
 * a whole juzʾ from memory is exactly the person this feature is for, so that
 * is not an acceptable place to fall over.
 *
 * The two sequences are meant to be the *same passage*, so they never wander
 * far from the diagonal: a skipped verse is about 26 symbols of drift. Only a
 * band around it is computed, which makes the cost linear in the passage.
 *
 * 512 is roughly twenty skipped verses. Past that the alignment is no longer
 * exact — but a recitation that has drifted that far from the text scores below
 * `MIN_AGREEMENT`, and nothing is shown for it at all.
 */
export const BAND = 512;

/**
 * How much of the passage is aligned at a time.
 *
 * Banding makes the cost linear in the passage, which is not the same as
 * bounded: a juzʾ still wants 76 MB, ten juzʾ 765 MB, the whole muṣḥaf 1.2 GB.
 * A ḥāfiẓ reviewing at length is exactly who this is for, so «it works up to a
 * juzʾ» is not an answer.
 *
 * So the passage is aligned in windows and the alignment of each picks up where
 * the last one ended. Memory is then fixed at about 8 MB no matter how long the
 * recitation runs, and the time stays linear.
 *
 * Cut large enough that a window is many verses: the seam between two windows
 * is the one place the alignment has less context than it would have had, and
 * rare seams are better than many.
 */
export const WINDOW = 2000;

interface Fitted {
  steps: Step[];
  /** How much of the **second** sequence this pass accounted for. */
  heardUsed: number;
}

/**
 * One banded Needleman–Wunsch pass.
 *
 * Global rather than local alignment because the reciter was reciting a known
 * passage from its start: the two sequences are meant to be the same thing,
 * and the interesting part is exactly where they stop being.
 *
 * `freeHeardEnd` lets the heard side stop early — every window but the last
 * uses it, because the rest of the recitation belongs to the windows that
 * follow rather than being forced to match this one's final symbols.
 *
 * The band is widened to at least the length difference, without which the
 * corner every traceback starts from can fall outside it.
 */
function fit(
  first: string[], second: string[], band: number, freeSecondEnd: boolean,
): Fitted {
  const n = first.length;
  const m = second.length;
  const k = Math.min(Math.max(n, m), Math.max(band, Math.abs(n - m)));
  const width = 2 * k + 1;
  const INF = 0x3fffffff;

  // One flat array rather than a row per symbol: at this size the row objects
  // alone would outweigh the numbers in them.
  const cost = new Int32Array((n + 1) * width).fill(INF);
  const lo = (i: number) => Math.max(0, i - k);
  const put = (i: number, j: number, v: number) => { cost[i * width + (j - lo(i))] = v; };
  const get = (i: number, j: number) => {
    if (i < 0 || j < 0 || i > n || j > m) return INF;
    const off = j - lo(i);
    return off < 0 || off >= width ? INF : cost[i * width + off];
  };

  put(0, 0, 0);
  for (let i = 1; i <= Math.min(n, k); i++) put(i, 0, i);
  for (let j = 1; j <= Math.min(m, k); j++) put(0, j, j);

  for (let i = 1; i <= n; i++) {
    const from = Math.max(1, i - k);
    const to = Math.min(m, i + k);
    for (let j = from; j <= to; j++) {
      const same = first[i - 1] === second[j - 1];
      put(i, j, Math.min(
        get(i - 1, j - 1) + (same ? 0 : 1),
        get(i - 1, j) + 1,
        get(i, j - 1) + 1,
      ));
    }
  }

  // Where this window stops on the heard side.
  let end = m;
  if (freeSecondEnd) {
    let best = INF;
    for (let j = Math.max(0, lo(n)); j <= Math.min(m, n + k); j++) {
      const v = get(n, j);
      if (v < best) { best = v; end = j; }
    }
  }

  const steps: Step[] = [];
  let i = n;
  let j = end;
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && first[i - 1] === second[j - 1];
    if (i > 0 && j > 0 && get(i, j) === get(i - 1, j - 1) + (same ? 0 : 1)) {
      steps.push({ op: same ? 'match' : 'substitution', e: i - 1, h: j - 1 });
      i--; j--;
    } else if (i > 0 && get(i, j) === get(i - 1, j) + 1) {
      // Expected but never heard.
      steps.push({ op: 'omission', e: i - 1, h: j });
      i--;
    } else if (j > 0) {
      // Heard but not in the text.
      steps.push({ op: 'insertion', e: i, h: j - 1 });
      j--;
    } else {
      steps.push({ op: 'omission', e: i - 1, h: j });
      i--;
    }
  }
  steps.reverse();
  return { steps, heardUsed: end };
}

/**
 * The whole passage, a window at a time — see `WINDOW`.
 *
 * A passage that fits in one window takes exactly the path it always did, which
 * is every recitation up to about five pages.
 *
 * ## `openEnd`: letting the recitation say where it stopped
 *
 * Without it the passage has to be exactly what was recited, and the only thing
 * that knows where the reciter stopped is the marker they were moving by hand.
 * Forgetting to move it did not produce a clear complaint — it produced «the
 * recording was not clear enough», which blames the room for a bookkeeping
 * mistake. That is the worst kind of error a tool can make.
 *
 * So the caller may hand over more of the muṣḥaf than was recited and set this.
 * The recitation is then matched against a **prefix** of the passage, and the
 * verses beyond where it stopped are simply not part of the alignment — not
 * omissions, not anything. `expectedUsed` says how far it reached.
 *
 * It is the same free-end-gap the windows already use, with the two sequences
 * exchanged, so the two cases share one implementation and one set of proofs.
 */
function trace(
  expected: ExpectedPhoneme[], heard: HeardPhoneme[], band = BAND, openEnd = false,
): { steps: Step[]; expectedUsed: number } {
  const want = expected.map(p => p.symbol);
  const got = heard.map(p => p.symbol);

  if (openEnd) {
    // Global over what was heard, free at the end of what was expected: every
    // sound the reciter made is accounted for, and the passage may run past it.
    const { steps, heardUsed } = window_(got, want, band, true);
    return { steps: steps.map(flip), expectedUsed: heardUsed };
  }

  const { steps } = window_(want, got, band, false);
  return { steps, expectedUsed: expected.length };
}

/** The second sequence became the first, so the two gap kinds change places. */
function flip(step: Step): Step {
  return {
    op: step.op === 'omission' ? 'insertion' : step.op === 'insertion' ? 'omission' : step.op,
    e: step.h,
    h: step.e,
  };
}

/**
 * `fit` over an arbitrarily long first sequence, a window at a time.
 *
 * Windows in the middle always leave their end free — that is what lets the
 * next one pick up where this one stopped. `freeEndAtLast` says whether the
 * *final* window may also stop short, which is the difference between «the
 * passage is exactly what was recited» and «the passage may run past it».
 * Getting it wrong drops a stretch the reciter added at the very end instead
 * of reporting it.
 */
function window_(
  first: string[], second: string[], band: number, freeEndAtLast: boolean,
): Fitted {
  if (first.length <= WINDOW) return fit(first, second, band, freeEndAtLast);

  const steps: Step[] = [];
  let a0 = 0;
  let b0 = 0;

  while (a0 < first.length) {
    const a1 = Math.min(first.length, a0 + WINDOW);
    const last = a1 >= first.length;
    // The second side gets the window plus room to drift; the last window takes
    // whatever remains, so nothing is left unaccounted for.
    const b1 = last ? second.length : Math.min(second.length, b0 + (a1 - a0) + band);

    const part = fit(first.slice(a0, a1), second.slice(b0, b1), band, !last || freeEndAtLast);
    for (const step of part.steps) steps.push({ op: step.op, e: step.e + a0, h: step.h + b0 });

    a0 = a1;
    // Always move, even where a window accounted for nothing, so this ends.
    b0 += Math.max(part.heardUsed, 0);
  }

  return { steps, heardUsed: b0 };
}

/**
 * Where the recitation left the text, as candidates worth showing.
 *
 * Adjacent divergences are gathered into one candidate: a word said wrongly is
 * one thing that happened, not five, and listing every symbol separately would
 * bury the reciter in a list nobody reads.
 */
export function findCandidates(
  expected: ExpectedPhoneme[], heard: HeardPhoneme[],
  opts: {
    minConfidence?: number; minRun?: number; minRunUnrated?: number;
    /** Widen to make the alignment exhaustive — see `BAND`. Tests use it. */
    band?: number;
    /**
     * Treat the passage as possibly longer than what was recited.
     *
     * The verses past where the reciter stopped are then not part of the
     * alignment at all, rather than a page of omissions they never made.
     */
    openEnd?: boolean;
  } = {},
): Candidate[] {
  const minConfidence = opts.minConfidence ?? MIN_CONFIDENCE;
  const minRun = opts.minRun ?? MIN_RUN;
  const minRunUnrated = opts.minRunUnrated ?? MIN_RUN_UNRATED;
  if (!expected.length) return [];

  const { steps } = trace(expected, heard, opts.band, opts.openEnd);
  const out: Candidate[] = [];

  // Sounds per word, to tell a word left out from part of one — see below.
  const wordKey = (p: ExpectedPhoneme) => (p.word === null ? null : `${p.anchorId}:${p.word}`);
  const wordSize = new Map<string, number>();
  for (const p of expected) {
    const k = wordKey(p);
    if (k !== null) wordSize.set(k, (wordSize.get(k) ?? 0) + 1);
  }
  /** See the idghām note in `flush`. */
  const isUnmergedNun = (steps: Step[], exp: ExpectedPhoneme[], said: HeardPhoneme[]) => {
    if (!exp.length || exp.length > 2 || !said.length || said.length > exp.length + 1) return false;
    const e0 = steps.find(s => s.op !== 'insertion')!.e;
    const before = expected[e0 - 1];
    const startsWord = !before || wordKey(before) === null || wordKey(before) !== wordKey(expected[e0]);
    const nun = (x: { symbol: string }) => x.symbol.startsWith('ن');
    return startsWord && said.some(nun) && !exp.some(nun);
  };

  /** The first word all of whose sounds are among these, if any. */
  const firstWholeWord = (missing: ExpectedPhoneme[]): ExpectedPhoneme | undefined => {
    const count = new Map<string, number>();
    for (const p of missing) {
      const k = wordKey(p);
      if (k !== null) count.set(k, (count.get(k) ?? 0) + 1);
    }
    return missing.find(p => {
      const k = wordKey(p);
      return k !== null && count.get(k) === wordSize.get(k);
    });
  };
  let run: Step[] = [];

  const flush = () => {
    if (!run.length) return;
    const steps = run;
    const first = steps[0];
    const kinds = new Set(run.map(s => s.op));
    const heardSteps = run.filter(s => s.op !== 'omission');
    const heardIn = heardSteps.map(s => heard[s.h]).filter(Boolean);
    const heardFrom = heardSteps.length ? heardSteps[0].h : first.h;
    const heardTo = heardSteps.length ? heardSteps[heardSteps.length - 1].h + 1 : first.h;
    const expectedIn = run.filter(s => s.op !== 'insertion').map(s => expected[s.e]).filter(Boolean);
    run = [];

    /**
     * A mishearing is the model's failure, not the reciter's mistake. The
     * least sure symbol governs: one shaky sound in the run is enough to make
     * the whole claim unsafe.
     *
     * Where the decoder rated nothing there is no such symbol, and no way to
     * tell the two apart. The confidence gate then does not apply — pretending
     * it did, in either direction, would be a claim about a number nobody has.
     * A longer run stands in its place; see `MIN_RUN_UNRATED`.
     */
    const rated = heardIn.every(h => h.confidence !== null);
    const confidence = heardIn.length
      ? (rated ? Math.min(...heardIn.map(h => h.confidence as number)) : null)
      : 1;

    if (expectedIn.length + heardIn.length < (rated ? minRun : minRunUnrated)) return;

    /**
     * A few sounds missing from the middle of a word whose other sounds were
     * heard is the model swallowing an assimilated sound, not a reciter
     * skipping. Seen on a correct al-Fātiḥa (synthesised speech, for now —
     * spikes/asr-web): the model, native and web alike, never emitted the
     * «لّا» of «بسم الله», and nothing else filtered it, because an omission
     * has no heard sound to be unsure about.
     *
     * A memorisation slip leaves out a word; so a short omission must take a
     * whole one with it. A long one (`minRunUnrated` or more) is reported
     * either way — that is not a swallowed sound.
     */
    const whole = firstWholeWord(expectedIn);
    if (!heardIn.length && expectedIn.length < minRunUnrated && !whole) return;

    /*
     * A nūn said aloud at the start of a word, where the text merges the
     * tanwīn or nūn sākina before it into that word (idghām), is how the
     * junction was pronounced — tajwīd, which this tool says plainly it does
     * not judge. Seen: «رَغَدًا وَادْخُلُوا» read as «رغدن وادخلوا» was raised
     * as a slip. Narrow on purpose: the run must start a word, change at most
     * two of its sounds, and differ by the nūn and nothing a word could hide.
     */
    if (isUnmergedNun(steps, expectedIn, heardIn)) return;
    if (rated && heardIn.length && (confidence as number) < minConfidence) return;

    /*
     * An anchor is what the interface needs; the expected side always has one,
     * and for a pure insertion we borrow the place it was inserted at.
     *
     * A run that takes out whole words points at the first of them, not at
     * whatever sound it happens to begin with. Seen with «إياك نعبد و» left
     * out of 1:5: the run began at the madd of «الدين» before it — which the
     * model heard short — and sent the reciter to the wrong verse.
     */
    const at = whole ?? expectedIn[0] ?? expected[Math.min(first.e, expected.length - 1)];
    out.push({
      kind: kinds.size === 1 ? [...kinds][0] as DivergenceKind : 'substitution',
      anchorId: at.anchorId,
      word: at.word,
      atMs: heardIn.length ? heardIn[0].atMs : null,
      expected: expectedIn.map(e => e.symbol),
      heard: heardIn.map(h => h.symbol),
      confidence,
      heardFrom,
      heardTo,
    });
  };

  for (const step of steps) {
    if (step.op === 'match') flush();
    else run.push(step);
  }
  flush();

  return out;
}

/**
 * How much of the passage was recited as written, 0..1.
 *
 * Reported alongside the candidates so a reciter can see whether a clean run
 * meant a clean recitation or a recording the model could barely hear — and
 * so an interface can decline to show candidates at all when it is low.
 */
export function agreement(
  expected: ExpectedPhoneme[], heard: HeardPhoneme[], band?: number, openEnd = false,
): number {
  if (!expected.length) return 0;
  const { steps, expectedUsed } = trace(expected, heard, band, openEnd);
  const matched = steps.filter(s => s.op === 'match').length;
  // Measured against what the reciter actually reached, never against a passage
  // they were never asked to finish — see `openEnd`.
  const over = openEnd ? expectedUsed : expected.length;
  return over > 0 ? matched / over : 0;
}

/**
 * How far into the passage the recitation reached, in sounds.
 *
 * The answer to «where did they stop», which used to be the marker's job and
 * is now the recitation's own.
 */
export function reached(
  expected: ExpectedPhoneme[], heard: HeardPhoneme[], band?: number,
): number {
  if (!expected.length) return 0;
  return trace(expected, heard, band, true).expectedUsed;
}

/**
 * Below this the recording tells us nothing worth acting on — a bad
 * microphone, a noisy room, the wrong passage entirely. The interface says so
 * rather than presenting a page of candidates that are all the model's own.
 */
export const MIN_AGREEMENT = 0.5;
