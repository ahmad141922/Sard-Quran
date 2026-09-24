import { SURAHS, localeDigits, surahName, surahNameVariants } from '@/lib/quran-data';
import { arabicCount } from '@/lib/recitation-session';
import type { QuranIndex } from '@/lib/quran-index';
import { displayLang, isArabic, type DisplayLang } from '@/lib/display-lang';

/**
 * One search box for the whole muṣḥaf.
 *
 * A reader looking for a place says it in whichever way is shortest to them:
 * «البقرة ٢٥٥», «2:255», «kahf», «جزء ٣», «صفحة ٦٠٤», or a phrase they half
 * remember — «الحمد لله رب». All of those are the same question, so they go
 * into the same box and this decides what was meant.
 *
 * Order matters: a reference is answered before a name, and a name before the
 * text, because someone who typed «2:255» knows exactly where they are going
 * and should not have to scroll past verses containing "255".
 */

export type ReaderJump =
  | { kind: 'page'; page: number }
  | { kind: 'ayah'; surah: number; ayah: number }
  | { kind: 'surah'; surah: number }
  | { kind: 'juz'; juz: number };

export interface ReaderHit {
  jump: ReaderJump;
  /** The row's heading, in the reader's language. */
  title: string;
  /** The line under it — a verse's words, a surah's length. */
  detail?: string;
}

/** Arabic-Indic and Persian digits read as the Latin ones they stand for. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, ch => {
    const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(ch);
    if (arabic > -1) return String(arabic);
    return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch));
  });
}

/**
 * Arabic as it is typed, not as it is printed.
 *
 * Nobody searching for «الرحمن» types its dagger alif, and few type any
 * diacritic at all. Marks go, the alif family flattens, ة reads as ه, ى as ي,
 * and the Uthmani text's small marks — the ones with no keyboard key — go with
 * them. What is left is the skeleton both the typed and the printed word share.
 */
export function foldQuranText(text: string): string {
  return text
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱٲٳٵ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىیئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[^؀-ۿ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Latin for a name in any of the spellings: case, punctuation and accents are
 * not part of it.
 *
 * The accents matter twice over. Dropping them outright - which is what
 * removing every non-a-z character did - turned "Al-Fatiha" into "al-ftiha",
 * so the French name stopped matching even itself. And nobody searching types
 * them anyway.
 */
function foldLatin(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function surahTitle(n: number, lang: DisplayLang): string {
  return `${localeDigits(n, lang)}. ${surahName(n, lang)}`;
}

/**
 * A surah's name reduced to the part that identifies it.
 *
 * The article goes: «الكهف» and «كهف» are the same request, and a reader who
 * types «ال» and nothing else has not named a surah at all — leaving it in
 * would make those two letters match ninety-six of them.
 */
function foldName(text: string): string {
  return foldQuranText(text).replace(/^ال/, '');
}

/** Every surah whose name — in either script — contains what was typed. */
function surahsMatching(query: string): number[] {
  const folded = foldName(query);
  const latin = foldLatin(query).replace(/^al[- ]?/, '');
  const out: number[] = [];
  for (let n = 1; n <= 114; n++) {
    const ar = foldName(SURAHS[n - 1].name);
    // Every language's spelling, not just the one on screen. Someone taught
    // "Ach-Chams" should find it on an English board, and "Ash-Shams" on a
    // French one — what you call a surah does not change with a menu setting.
    const spellings = surahNameVariants(n).map(name => foldLatin(name).replace(/^al[- ]?/, '').replace(/[- ]/g, ''));
    // «نساء» finds An-Nisa, and so does "nisa" — but a one-letter query would
    // match half the muṣḥaf, so both sides ask for two.
    const byArabic = folded.length >= 2 && ar.includes(folded);
    const byLatin = latin.length >= 2 && spellings.some(name => name.includes(latin.replace(/[- ]/g, '')));
    if (byArabic || byLatin) out.push(n);
  }
  return out;
}

/**
 * The whole Book, folded once.
 *
 * Folding six thousand verses on every keystroke is a tenth of a second the
 * typist can feel. The result depends only on the index, so it is computed the
 * first time a search runs and kept for as long as that index lives.
 */
const foldedCorpus = new WeakMap<QuranIndex, string[]>();
function foldedVerses(index: QuranIndex): string[] {
  const kept = foldedCorpus.get(index);
  if (kept) return kept;
  const made = index.verses.map(v => foldQuranText(v.aya_text_emlaey));
  foldedCorpus.set(index, made);
  return made;
}

/** The words around the match, so a hit shows why it is a hit. */
function snippet(text: string, foldedNeedle: string, width = 70): string {
  const words = text.split(/\s+/);
  const foldedWords = words.map(foldQuranText);
  let at = 0;
  for (let i = 0; i < foldedWords.length; i++) {
    if (foldedWords.slice(i).join(' ').startsWith(foldedNeedle)) { at = i; break; }
  }
  const from = Math.max(0, at - 3);
  let out = words.slice(from, from + 12).join(' ');
  if (out.length > width) out = out.slice(0, width).trim() + '…';
  return (from > 0 ? '… ' : '') + out;
}

const PAGE_WORD = /^(?:page|p|صفحة|ص)\s*(\d+)$/i;
const JUZ_WORD = /^(?:juz|juzz|جزء|الجزء|ج)['’]?\s*(\d+)$/i;
const REFERENCE = /^(\d+)\s*[:：\-/،,]\s*(\d+)$/;
const NAME_AND_NUMBER = /^(.*?)[\s:：\-/،,]+(\d+)$/;

/**
 * What the query means, best answer first.
 *
 * `limit` caps the verse hits only: references and surah names are few by
 * nature, and cutting them would be cutting the answer rather than the tail.
 */
export function searchMushaf(
  query: string,
  index: QuranIndex,
  lang: DisplayLang = displayLang(),
  limit = 20,
): ReaderHit[] {
  const raw = normalizeDigits(query).trim();
  if (!raw) return [];

  const hits: ReaderHit[] = [];
  const ar = isArabic(lang);
  const digits = (n: number) => localeDigits(n, lang);
  const pageLabel = (p: number) => (ar ? `صفحة ${digits(p)}` : `Page ${p}`);
  const juzLabel = (j: number) => (ar ? `جزء ${digits(j)}` : `Juz' ${j}`);
  const ayahWord = (n: number) => (ar ? `آية ${digits(n)}` : `ayah ${n}`);
  // Arabic counts three ways between one verse and eleven; English adds an s.
  const ayahCount = (n: number) => (ar
    ? arabicCount(n, 'آية واحدة', 'آيتان', 'آيات', 'آية').replace(/\d+/, m => digits(Number(m)))
    : `${n} ${n === 1 ? 'ayah' : 'ayahs'}`);

  const pushAyah = (surah: number, ayah: number) => {
    const id = index.idOf(surah, ayah);
    if (id === undefined) return false;
    const loc = index.locOf(id);
    hits.push({
      jump: { kind: 'ayah', surah, ayah },
      title: `${surahTitle(surah, lang)} · ${ayahWord(ayah)}`,
      detail: loc ? `${pageLabel(index.pageLabel(loc.page))} · ${juzLabel(loc.juz)}` : undefined,
    });
    return true;
  };

  // ── a page, said as one ──
  const asPage = PAGE_WORD.exec(raw);
  if (asPage) {
    const page = Number(asPage[1]);
    if (page >= 1 && page <= index.totalPages) {
      hits.push({ jump: { kind: 'page', page }, title: pageLabel(page) });
      return hits;
    }
  }

  // ── a juz' ──
  const asJuz = JUZ_WORD.exec(raw);
  if (asJuz) {
    const juz = Number(asJuz[1]);
    if (juz >= 1 && juz <= 30) {
      hits.push({ jump: { kind: 'juz', juz }, title: juzLabel(juz) });
      return hits;
    }
  }

  // ── «2:255» ──
  const asRef = REFERENCE.exec(raw);
  if (asRef && pushAyah(Number(asRef[1]), Number(asRef[2]))) return hits;

  // ── «البقرة ٢٥٥» / «baqarah 255» ──
  const asNamed = NAME_AND_NUMBER.exec(raw);
  if (asNamed) {
    const matches = surahsMatching(asNamed[1]);
    const ayah = Number(asNamed[2]);
    for (const surah of matches.slice(0, 5)) pushAyah(surah, ayah);
    if (hits.length) return hits;
  }

  // ── a bare number is two questions at once ──
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= 114) {
      hits.push({
        jump: { kind: 'surah', surah: n },
        title: surahTitle(n, lang),
        detail: ayahCount(SURAHS[n - 1].ayahs),
      });
    }
    if (n >= 1 && n <= index.totalPages) hits.push({ jump: { kind: 'page', page: n }, title: pageLabel(n) });
    if (n >= 1 && n <= 30) hits.push({ jump: { kind: 'juz', juz: n }, title: juzLabel(n) });
    return hits;
  }

  // ── a name ──
  for (const surah of surahsMatching(raw)) {
    hits.push({
      jump: { kind: 'surah', surah },
      title: surahTitle(surah, lang),
      detail: ayahCount(SURAHS[surah - 1].ayahs),
    });
  }

  // ── and finally the text itself ──
  const needle = foldQuranText(raw);
  if (needle.length >= 3) {
    let found = 0;
    // The plain imlaa'i text is what a keyboard can produce; the Uthmani
    // spelling carries marks no reader would type.
    const folded = foldedVerses(index);
    for (let i = 0; i < index.verses.length; i++) {
      if (found >= limit) break;
      if (!folded[i].includes(needle)) continue;
      const v = index.verses[i];
      found++;
      hits.push({
        jump: { kind: 'ayah', surah: v.sura_no, ayah: v.aya_no },
        title: `${surahTitle(v.sura_no, lang)} · ${ayahWord(v.aya_no)}`,
        detail: snippet(v.aya_text_emlaey, needle),
      });
    }
  }

  return hits;
}
