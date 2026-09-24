/**
 * Finding a verse from a phrase somebody half-remembers.
 *
 * The one thing a memoriser does constantly and the tool could not do at all:
 * «where is the verse that goes …?». Everything it needs is already on the
 * device — the muṣḥaf text ships with the app — so this adds no download and
 * works with no network.
 *
 * ## Why the text has to be folded first
 *
 * Nobody types hamza the way the muṣḥaf prints it. Someone looking for
 * «إياك نعبد» types «اياك نعبد»; someone looking for «الصلاة» types «الصلاه».
 * A literal match finds neither, and a search that fails on the obvious query
 * is one people stop using.
 *
 * The imlāʾī text is already free of vowel marks, which leaves three things to
 * fold — the hamza carriers, tāʾ marbūṭa, and alif maqṣūra — plus a directional
 * mark that is present in the data, invisible, and would silently break any
 * match that spanned it.
 *
 * ## Folding without losing the place
 *
 * Folding changes lengths: a dropped mark shifts everything after it. So it
 * returns a map back to the original string, and every hit carries offsets into
 * the **printed** verse. Highlighting the wrong span of a verse of the Qurʾān
 * is not a cosmetic error.
 */

import type { QuranIndex } from './quran-index';

/** Hamza carriers, tāʾ marbūṭa and alif maqṣūra, folded to their bare letters. */
const FOLD: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ؤ': 'و',
  'ئ': 'ي', 'ى': 'ي',
  'ة': 'ه',
};

/**
 * Dropped entirely: a bare hamza, which people type inconsistently or not at
 * all, and the directional marks that sit invisibly inside the shipped text.
 */
const DROP = new Set(['ء', '‎', '‏', 'ـ']);

/** Every Arabic combining mark: vowels, shadda, and the Qurʾānic annotations. */
const MARK = /[ً-ٟۖ-ۭ]/;

/**
 * The dagger alif, which has no single right answer.
 *
 * It writes a long *ā* that the muṣḥaf leaves out of the line. Sometimes the
 * imlāʾī spelling puts the alif back — «ٱلْعَٰلَمِينَ» is «العالمين» — and
 * sometimes it does not: «ٱلرَّحْمَٰنِ» is «الرحمن». Dropping it and turning it
 * into an alif are each correct half the time.
 *
 * So both readings are tried. It costs one more pass over an array already in
 * memory, and it means a phrase pasted from a muṣḥaf app is found whichever
 * way its orthography falls.
 */
const DAGGER = 'ٰ';

export interface Folded {
  text: string;
  /** `map[i]` is where `text[i]` came from in the original. */
  map: number[];
}

export function fold(original: string, daggerAsAlif = false): Folded {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (DROP.has(ch)) continue;
    if (ch === DAGGER) {
      // See `DAGGER`: the caller decides, and by default asks for both.
      if (daggerAsAlif) { text += 'ا'; map.push(i); }
      continue;
    }
    // Vowels and the rest of the marks fold away, so a phrase pasted with its
    // tashkīl still matches text written without.
    if (MARK.test(ch)) continue;
    text += FOLD[ch] ?? ch;
    map.push(i);
  }
  return { text, map };
}

/** The query, folded and with its whitespace tidied. */
export function foldQuery(query: string, daggerAsAlif = false): string {
  return fold(query.replace(/\s+/g, ' ').trim(), daggerAsAlif).text;
}

/**
 * Every reading of the query worth trying — one, or two where a dagger alif
 * makes the answer ambiguous. See `DAGGER`.
 */
export function foldQueries(query: string): string[] {
  const plain = foldQuery(query);
  const asAlif = foldQuery(query, true);
  return plain === asAlif ? [plain] : [plain, asAlif];
}

export interface SearchHit {
  surah: number;
  ayah: number;
  /** `position.anchor.id` — what the rest of the app navigates by. */
  anchorId: number;
  /** The verse as printed, not as folded. */
  text: string;
  /** Where the phrase sits in `text`, for highlighting. */
  from: number;
  to: number;
}

export interface QuranSearch {
  find(query: string, limit?: number): SearchHit[];
  /** How many verses are searchable — for a count nobody has to guess at. */
  size: number;
}

/** The shortest query worth running: one letter matches thousands of verses. */
export const MIN_QUERY = 2;

/** How many hits are returned unless the caller asks for more. */
export const DEFAULT_LIMIT = 40;

/**
 * Builds the folded index once.
 *
 * 6,236 verses folded on every keystroke would be wasted work on a phone; done
 * once it is a few milliseconds and a couple of megabytes that the muṣḥaf text
 * already dwarfs.
 */
export function quranSearch(index: QuranIndex): QuranSearch {
  const rows = index.verses.map(verse => {
    const original = (verse as { aya_text_emlaey?: string }).aya_text_emlaey ?? '';
    return { verse, original, folded: fold(original) };
  });

  return {
    size: rows.length,
    find(query, limit = DEFAULT_LIMIT) {
      const needles = foldQueries(query).filter(n => n.length >= MIN_QUERY);
      if (!needles.length) return [];

      const out: SearchHit[] = [];
      for (const row of rows) {
        let at = -1;
        let needle = '';
        for (const candidate of needles) {
          at = row.folded.text.indexOf(candidate);
          if (at >= 0) { needle = candidate; break; }
        }
        if (at < 0) continue;

        const loc = index.locOf(row.verse.id);
        if (!loc) continue;
        // Offsets travel back through the map, so the highlight lands on the
        // printed letters rather than the folded ones.
        const from = row.folded.map[at] ?? 0;
        const last = row.folded.map[at + needle.length - 1];
        out.push({
          surah: loc.surah,
          ayah: loc.ayah,
          anchorId: row.verse.id,
          text: row.original,
          from,
          to: (last ?? from) + 1,
        });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}
