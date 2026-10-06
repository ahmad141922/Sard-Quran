/**
 * Where the words the reciter said instead actually come from.
 *
 * The commonest slip of a memoriser is not a word invented; it is a passage
 * from elsewhere — a near-twin verse (mutashābih) whose wording the tongue
 * took over. When the recording shows that, saying «you said this, and it is
 * the wording of al-Aʿrāf 161» names the cause instead of the symptom, and
 * tells the reciter exactly which two places to revise side by side.
 *
 * ## Evidence, not resemblance
 *
 * `mutashabihat.ts` knows which verses *resemble* each other. This asks a
 * different question of the recording itself: is there one verse in the
 * Qur'an whose sounds match what was heard **better than the verse being
 * recited, and better than every other verse**? Only then is it named.
 *
 * Everything else returns null and the card says nothing extra: a run too
 * short to be distinctive («الكريم» occurs in dozens of places), a match no
 * better than the verse itself (the model misheard; nothing came from
 * anywhere), or two verses tied (it could be either, and guessing is the one
 * thing this must not do).
 *
 * The search is the whole index — about 330,000 sounds — by approximate
 * substring matching. One candidate costs a few tens of milliseconds, once,
 * when the recitation stops.
 */

import type { Candidate, HeardPhoneme } from './align';
import type { QuranPhonemes } from './phonemes';

export interface Source {
  surah: number;
  ayah: number;
  /** 0-based word where the match begins, where word boundaries are known. */
  word: number | null;
  /** 0..1 — the share of the heard sounds that matched there. */
  score: number;
}

/** Shortest search, context included; shorter is never distinctive. */
export const MIN_SOURCE_SOUNDS = 6;
/** How well the run must match the verse it is attributed to. */
export const MIN_SOURCE_SCORE = 0.85;
/** Heard sounds a run must have of its own — about a word. */
export const MIN_RUN_SOUNDS = 4;
/** Sounds of the recitation either side of the run, for context. */
export const SOURCE_CONTEXT = 4;
/** Longest run searched — a mutashābih swap is a phrase, not a page. */
const MAX_QUERY = 64;

interface Corpus {
  ids: Int32Array;
  /** Index into `verses` for each position of `ids`. */
  verseAt: Int32Array;
  wordAt: Int32Array;
  verses: { surah: number; ayah: number }[];
  idOf: Map<string, number>;
}

const corpora = new WeakMap<QuranPhonemes, Corpus>();

function corpusOf(phonemes: QuranPhonemes): Corpus {
  const cached = corpora.get(phonemes);
  if (cached) return cached;

  const idOf = new Map<string, number>();
  const ids: number[] = [];
  const verseAt: number[] = [];
  const wordAt: number[] = [];
  const verses: { surah: number; ayah: number }[] = [];
  for (let surah = 1; surah <= 114; surah++) {
    for (let ayah = 1; phonemes.has(surah, ayah); ayah++) {
      const v = verses.length;
      verses.push({ surah, ayah });
      for (const p of phonemes.expected([{ surah, ayah, anchorId: 0 }])) {
        let id = idOf.get(p.symbol);
        if (id === undefined) { id = idOf.size; idOf.set(p.symbol, id); }
        ids.push(id);
        verseAt.push(v);
        wordAt.push(p.word ?? -1);
      }
    }
  }
  const corpus = {
    ids: Int32Array.from(ids), verseAt: Int32Array.from(verseAt), wordAt: Int32Array.from(wordAt), verses, idOf,
  };
  corpora.set(phonemes, corpus);
  return corpus;
}

/**
 * For every verse, the fewest edits with which `query` occurs inside the
 * Qur'an starting in it (Sellers' approximate substring match: free start and
 * end in the text, every query sound accounted for).
 */
function bestPerVerse(corpus: Corpus, query: number[]): { dist: Int32Array; at: Int32Array } {
  const m = query.length;
  const n = corpus.ids.length;
  const nv = corpus.verses.length;
  const dist = new Int32Array(nv).fill(m + 1);
  const at = new Int32Array(nv).fill(-1);

  // Column by column along the text; each cell remembers where its match began.
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  let prevStart = new Int32Array(m + 1);
  let curStart = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  // A match may begin at the very first sound of the text.
  prevStart.fill(0);

  for (let j = 0; j < n; j++) {
    const c = corpus.ids[j];
    cur[0] = 0;
    curStart[0] = j + 1;
    for (let i = 1; i <= m; i++) {
      const sub = prev[i - 1] + (query[i - 1] === c ? 0 : 1);
      const del = cur[i - 1] + 1;  // a heard sound with no counterpart
      const ins = prev[i] + 1;     // a text sound the reciter did not say
      if (sub <= del && sub <= ins) { cur[i] = sub; curStart[i] = prevStart[i - 1]; }
      else if (ins <= del) { cur[i] = ins; curStart[i] = prevStart[i]; }
      else { cur[i] = del; curStart[i] = curStart[i - 1]; }
    }
    const start = Math.min(curStart[m], n - 1);
    const v = corpus.verseAt[start];
    if (cur[m] < dist[v]) { dist[v] = cur[m]; at[v] = start; }
    [prev, cur] = [cur, prev];
    [prevStart, curStart] = [curStart, prevStart];
  }
  return { dist, at };
}

/**
 * The one verse the heard sounds came from, if the recording says so plainly.
 *
 * `recited` are the verses of the passage being recited: a match there means
 * nothing came from elsewhere.
 */
export function sourceOf(
  phonemes: QuranPhonemes, heard: string[], recited: { surah: number; ayah: number }[],
): Source | null {
  const corpus = corpusOf(phonemes);
  const query = heard.slice(0, MAX_QUERY).map(s => corpus.idOf.get(s) ?? -1);
  if (query.length < MIN_SOURCE_SOUNDS) return null;

  const { dist, at } = bestPerVerse(corpus, query);
  const isRecited = (v: number) =>
    recited.some(r => r.surah === corpus.verses[v].surah && r.ayah === corpus.verses[v].ayah);

  let best = -1;
  let tied = false;
  let recitedBest = query.length + 1;
  for (let v = 0; v < dist.length; v++) {
    if (isRecited(v)) { recitedBest = Math.min(recitedBest, dist[v]); continue; }
    if (best < 0 || dist[v] < dist[best]) { best = v; tied = false; }
    else if (dist[v] === dist[best]) tied = true;
  }
  if (best < 0 || tied) return null;

  const score = 1 - dist[best] / query.length;
  if (score < MIN_SOURCE_SCORE) return null;
  // No better than the verse being recited: the model misheard, nothing came from elsewhere.
  if (dist[best] >= recitedBest) return null;

  const word = corpus.wordAt[at[best]];
  return { ...corpus.verses[best], word: word < 0 ? null : word, score };
}

/**
 * The verse a candidate's words came from, if the recording says so plainly.
 *
 * The run itself must be at least a word's worth of sounds; the search then
 * carries a little of the recitation either side, because the context a
 * mutashābih swap shares with its twin is what makes the twin unique.
 */
export function sourceOfCandidate(
  phonemes: QuranPhonemes, candidate: Candidate, heard: HeardPhoneme[],
  recited: { surah: number; ayah: number }[],
): Source | null {
  if (candidate.kind === 'omission' || candidate.heard.length < MIN_RUN_SOUNDS) return null;
  if (candidate.heardFrom === undefined || candidate.heardTo === undefined) return null;
  const from = Math.max(0, candidate.heardFrom - SOURCE_CONTEXT);
  const to = Math.min(heard.length, candidate.heardTo + SOURCE_CONTEXT);
  return sourceOf(phonemes, heard.slice(from, to).map(h => h.symbol), recited);
}
