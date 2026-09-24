/**
 * The sounds a passage *should* produce.
 *
 * The recogniser gives us what was heard; this gives us what to hold it
 * against. Without it the aligner in `align.ts` has nothing to align, which is
 * why it is the one piece the whole feature waited on.
 *
 * ## The alphabet is the model's, not the muṣḥaf's
 *
 * The index ships two spellings per sound: the precise one, and the one the
 * shipped model was trained to emit. They differ in exactly two places, and
 * both matter:
 *
 * - **Tafkhīm and tarqīq collapse.** `ر^` and `ر` are one symbol to the model.
 * - **Madd lengths collapse.** It was trained on a fixed length while a
 *   reciter may lawfully choose two, four or six ḥarakāt.
 *
 * Everything here is expressed in the model's alphabet, so the aligner is
 * structurally incapable of reporting either as a mistake. That is deliberate.
 * The model cannot hear those distinctions, so a disagreement about one says
 * something about the recogniser and nothing about the reciter — and this
 * module exists inside a tool whose claim is that it records what happened.
 * The precise symbol is kept for display and never reaches the comparison.
 *
 * See `scripts/build-quran-phonemes.mjs` for where the index comes from.
 */

import { withBase } from '../asset-url';
import type { ExpectedPhoneme } from './align';

export interface Attribution { name: string; url: string; license?: string }

/** One verse of a passage, with the anchor the rest of the app knows it by. */
export interface AyahRef {
  surah: number;
  ayah: number;
  /** `position.anchor.id` — the numbering every cross-session sum uses. */
  anchorId: number;
}

export interface QuranPhonemes {
  attribution: Attribution[];
  /**
   * The passage's sounds in reading order, ready for `findCandidates`.
   *
   * Verses the index does not know are skipped rather than faked: a gap in the
   * expected side shows up as an omission the reciter never made.
   */
  expected(passage: AyahRef[]): ExpectedPhoneme[];
  /** Whether a verse's sounds are known at all. */
  has(surah: number, ayah: number): boolean;
  /**
   * Whether word boundaries are known for a verse.
   *
   * False for six āyāt — see the builder. Their sounds still align; the
   * candidates simply point at the verse rather than a word in it.
   */
  hasWords(surah: number, ayah: number): boolean;
  /** How many sounds a verse has — for measuring out a passage. */
  sizeOf(surah: number, ayah: number): number;
  size: number;
  /**
   * Every sound the index can name.
   *
   * For phonemising something the index does not cover — a matn — so a derived
   * sound can be bent to one that exists rather than one nothing recognises.
   */
  alphabet: Set<string>;
  /**
   * How the **model** spells a sound, or null where it cannot spell it at all.
   *
   * The two alphabets are not the same. The index names 233 sounds; the model
   * was trained on an older, coarser inventory and can write 220 of them, and
   * what it emits is in that inventory. So an expected sound has to be put into
   * the model's spelling before it can be compared with a heard one — which is
   * what `expected` does, and what anything deriving its own sounds must do too.
   */
  say(symbol: string): string | null;
}

interface RawAyah { t: string; w?: string }
interface RawIndex {
  attribution: Attribution[];
  vocab: string[];
  model: (string | null)[];
  ayahs: Record<string, RawAyah>;
  withoutWordBoundaries: string[];
}

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function phonemesFromFile(raw: RawIndex): QuranPhonemes {
  const key = (surah: number, ayah: number) => `${surah}:${ayah}`;

  const expectedFor = (ref: AyahRef, into: ExpectedPhoneme[]) => {
    const entry = raw.ayahs[key(ref.surah, ref.ayah)];
    if (!entry) return;

    const ids = bytes(entry.t);
    // Word boundaries as run lengths; absent for the six the builder names.
    const runs = entry.w ? bytes(entry.w) : null;
    let word = 0;
    let left = runs?.[0] ?? 0;

    for (let i = 0; i < ids.length; i++) {
      if (runs) {
        while (left === 0 && word + 1 < runs.length) { word++; left = runs[word]; }
        left--;
      }
      const symbol = raw.model[ids[i]];
      // A sound the model has no spelling for cannot be compared against its
      // output at all. None occur in the Qur'an; if one ever did, dropping it
      // is the honest move — see the header.
      if (symbol == null) continue;
      into.push({ symbol, anchorId: ref.anchorId, word: runs ? word : null });
    }
  };

  const spelling = new Map(raw.vocab.map((v, i) => [v, raw.model[i]]));

  return {
    attribution: raw.attribution,
    size: Object.keys(raw.ayahs).length,
    alphabet: new Set(raw.vocab),
    say: symbol => spelling.get(symbol) ?? null,
    has: (surah, ayah) => key(surah, ayah) in raw.ayahs,
    hasWords: (surah, ayah) => {
      const entry = raw.ayahs[key(surah, ayah)];
      return !!entry?.w;
    },
    sizeOf: (surah, ayah) => {
      const entry = raw.ayahs[key(surah, ayah)];
      // base64 carries three bytes per four characters, and one byte is one
      // sound — cheaper than decoding a verse to count it.
      if (!entry) return 0;
      const b64 = entry.t;
      const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
      return (b64.length / 4) * 3 - pad;
    },
    expected(passage) {
      const out: ExpectedPhoneme[] = [];
      for (const ref of passage) expectedFor(ref, out);
      return out;
    },
  };
}

/**
 * Loads the index once per session.
 *
 * A missing file means the feature is absent, exactly as with the matn and the
 * mutashābihāt: it is 657 KB that only an Android build ships, and every
 * caller already has to cope with a device that cannot run the recogniser.
 */
let pending: Promise<QuranPhonemes | null> | null = null;

export function loadQuranPhonemes(): Promise<QuranPhonemes | null> {
  pending ??= (async () => {
    try {
      const res = await fetch(withBase('quran-phonemes.json'));
      if (!res.ok) return null;
      return phonemesFromFile(await res.json() as RawIndex);
    } catch {
      return null;
    }
  })();
  return pending;
}

/** For tests, which must not inherit a cached load from another file. */
export function resetQuranPhonemesCache(): void {
  pending = null;
}
