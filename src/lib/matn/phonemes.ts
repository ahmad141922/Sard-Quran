/**
 * The sounds a matn should make, so a reciter can be followed through it.
 *
 * The muṣḥaf side of this is a lookup: `quran-phonemes.json` was given to us
 * with all 6,236 āyāt already phonemised. A matn has no such file and never
 * will — there are seven of them and there will be more — so its sounds are
 * derived from its text by `asr/phonemise`, which is measured against those
 * same 6,236 and gets 99.85% of their sounds right.
 *
 * ## The bayt stands where the verse stands
 *
 * Everything downstream — the aligner, the follower, the candidates — is
 * written against `ExpectedPhoneme`, which carries an `anchorId` and a word.
 * Nothing in it is about the Qur'an: the id is only «which unit of the text is
 * this sound in». So a bayt's number goes where a verse's anchor goes, and the
 * whole apparatus works unchanged. That is why there is no matn aligner.
 *
 * ## Both halves at once
 *
 * A bayt is phonemised whole, its two hemistichs joined by a space, because
 * that is how it is recited: the tajwīd runs across the caesura, and a nūn at
 * the end of the ṣadr meets the first letter of the ʿajz. Phonemising the
 * halves apart would break every rule that reaches over that join.
 *
 * The line is taken as **stopped on at its end**, which is what a reciter does
 * and what the Qur'an index does for an āyah.
 *
 * ## Two alphabets, and the one that has to come out
 *
 * The phonemiser writes the index's 233 symbols. The **model** was trained on
 * an older, coarser inventory and emits that, so an expected sound has to be
 * put into the model's spelling before it can be compared with a heard one.
 * The Qur'an index does this on its way out and it is easy to miss, because a
 * matn phonemised into the wrong alphabet does not fail — it simply never
 * matches anything, which looks like a reciter who has gone quiet.
 */

import { sounds, fit, type Sound } from '../asr/phonemise';
import type { ExpectedPhoneme } from '../asr/align';
import type { Ahead } from '../asr/follow';
import type { QuranPhonemes } from '../asr/phonemes';
import type { Matn } from './load';

/** The sounds of one bayt, with the word of the line each belongs to. */
export function baytSounds(sadr: string, ajz: string, alphabet?: Set<string> | null): Sound[] {
  return sounds(`${sadr} ${ajz}`, { pause: true, alphabet: alphabet ?? null });
}

/**
 * How the index would have the model say a sound, or null where it cannot.
 *
 * Two steps, and both are needed: bend the sound to one the alphabet has, then
 * put it into the model's spelling. A sound that survives neither is dropped,
 * exactly as the Qur'an index drops one — see `QuranPhonemes.say`.
 */
function spoken(symbol: string, index: QuranPhonemes | null): string | null {
  if (!index) return symbol;
  return index.say(fit(symbol, index.alphabet));
}

/**
 * A matn's sounds, bayt by bayt, ready for the aligner.
 *
 * Built once for a session and kept: the Shāṭibiyya is 1,173 abyāt and about
 * fifty thousand sounds, which is a second of work to derive and nothing to
 * hold, but it is not something to redo on every poll while somebody recites.
 */
export interface MatnPhonemes {
  /** The sounds of the abyāt `from`..`to`, inclusive, in reading order. */
  expected(from: number, to: number): ExpectedPhoneme[];
  /** How many sounds a bayt has — for measuring out how much to listen for. */
  sizeOf(bayt: number): number;
  /**
   * The abyāt from `bayt` onwards, as the follower wants them.
   *
   * Bounded by a count rather than by the end of the matn: the follower looks
   * at a window and the window is all it needs, so handing it a thousand abyāt
   * would cost a thousand abyāt of work per poll for no gain.
   */
  ahead(bayt: number, count?: number): Ahead[];
  /** The words of a bayt, for showing which one is being said. */
  wordsOf(bayt: number): string[];
  size: number;
}

/** How many abyāt the follower is given to look at. See `Ahead`. */
export const AHEAD_ABYAT = 16;

export function matnPhonemes(matn: Matn, index: QuranPhonemes | null = null): MatnPhonemes {
  /*
   * Derived once, for every bayt, when a session starts. The alternative —
   * phonemising on demand — would put a stutter into the poll that runs while
   * somebody is reciting, which is the one place it must not go.
   */
  const byBayt = matn.abyat.map(b => baytSounds(b.sadr, b.ajz, index?.alphabet ?? null));
  const words = matn.abyat.map(b => `${b.sadr} ${b.ajz}`.split(/\s+/).filter(Boolean));

  const at = (bayt: number) => byBayt[bayt - 1] ?? [];

  const asExpected = (bayt: number): ExpectedPhoneme[] => {
    const out: ExpectedPhoneme[] = [];
    for (const s of at(bayt)) {
      const symbol = spoken(s.symbol, index);
      if (symbol == null) continue;
      out.push({ symbol, anchorId: bayt, word: s.word });
    }
    return out;
  };

  return {
    expected(from, to) {
      const out: ExpectedPhoneme[] = [];
      for (let n = Math.max(1, from); n <= Math.min(to, matn.abyat.length); n++) {
        out.push(...asExpected(n));
      }
      return out;
    },
    sizeOf: bayt => asExpected(bayt).length,
    ahead(bayt, count = AHEAD_ABYAT) {
      const out: Ahead[] = [];
      for (let n = Math.max(1, bayt); n <= Math.min(bayt + count - 1, matn.abyat.length); n++) {
        const expected = asExpected(n);
        if (!expected.length) continue;
        out.push({ anchorId: n, sounds: expected.length, expected });
      }
      return out;
    },
    wordsOf: bayt => words[bayt - 1] ?? [],
    size: byBayt.reduce((n, s) => n + s.length, 0),
  };
}
