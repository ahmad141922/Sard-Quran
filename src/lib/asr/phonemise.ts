/**
 * Vowelled Arabic in, the sounds it makes out.
 *
 * The recogniser compares what it hears against the sounds a passage *should*
 * make. For the Qur'an those were given to us — 6,236 āyāt already phonemised
 * in `quran-phonemes.json` — and for anything else they have to be derived.
 * That is what this is for: following a reciter through al-Jazariyya, or any
 * other matn, in the same alphabet and by the same conventions.
 *
 * ## Why it can be trusted, and exactly how far
 *
 * The Qur'an's 6,236 are a test set nobody had to build. Running this over
 * them and comparing symbol by symbol gives a number rather than an opinion,
 * and `npm run phonemiser:verify` prints it:
 *
 *   99.85% of sounds, and 95.0% of āyāt exactly, character for character.
 *
 * A rule that helps a matn while breaking the Qur'an is a rule that was wrong,
 * and that check is what catches it.
 *
 * The number is not a claim that the remaining 5% of āyāt are unusable — the
 * aligner is a fuzzy match and a passage one sound out still aligns. It is a
 * claim about how much of the tajwīd this reproduces, which is most of it.
 *
 * ## Where it is weaker than the Qur'an figure suggests
 *
 * **The muṣḥaf is fully marked and a matn is not.** Every letter of the Qur'an
 * carries its ḥaraka; a printed matn vowels what the reader might get wrong and
 * leaves the rest bare. Where a ḥaraka is missing the sound comes out bare too,
 * which costs a vowel rather than a word — measurable, and worst in the
 * Salsabīl, which leaves about a tenth of its words unmarked.
 *
 * **The alphabet is the Qur'an's, not Arabic's.** It holds the 233 sounds the
 * Qur'an makes. A matn occasionally wants one it does not — a doubled dāl
 * echoed at a pause — and `fit` bends those to the nearest sound that exists
 * rather than emitting one nothing can hear. Over all seven matns that is
 * about one sound in two thousand.
 *
 * ## How a sound is written
 *
 * `letter + shadda? + (heavy ^ | ghunna ~)? + (vowel | qalqala ڇ)?`, and a
 * prolongation is a token of its own carrying its count: `ا:2`. The order is
 * the index's own, read off its symbol table rather than chosen.
 *
 * ## The conventions the index follows
 *
 * Read off the data, not assumed:
 *
 * - **A passage is one breath, stopped only at its end.** The waqf marks inside
 *   an āyah are ignored and assimilation runs straight across them.
 * - **The end is a pause**: the last letter loses its vowel, a qalqala letter
 *   there is echoed, a tāʾ marbūṭa is said as a hāʾ, and a madd before it
 *   stretches to four.
 */

const HAMZA_WASL = 'ٱ';
const DAGGER = 'ٰ';
const MADDAH = 'ٓ';
const SHADDA = 'ّ';
const SUKUN = 'ْ';
const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const FATHATAN = 'ً';
const DAMMATAN = 'ٌ';
const KASRATAN = 'ٍ';
const SMALL_WAW = 'ۥ';
const SMALL_YA = 'ۦ';
const SMALL_HIGH_YA = 'ۧ';
const SILENT = '۟';
const SILENT_UPRIGHT = '۠';
const SAKT = 'ۜ';
const IMALA = '۪';
/** The eased hamza of «a-aʿjamiyyun» — one word in the Qur'an has it. */
const TASHIL_MARK = '۬';
const TASHIL = 'ٲ';
const HAMZA_ABOVE = 'ٔ';
const HAMZA_BELOW = 'ٕ';

/** Marks that say «assimilate the nūn into a mīm here» — the iqlāb. */
const IQLAB = new Set(['ۢ', 'ۭ']);

/** Purely editorial: where one *may* stop, where a rubʿ begins, a sajda. */
const EDITORIAL = new Set([
  'ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', 'ۛ', '۞', '۩',
  '۫', 'ۣ', 'ۨ',
]);

const TATWEEL = 'ـ';
const VOWELS = { [FATHA]: 'a', [DAMMA]: 'u', [KASRA]: 'i' };
const TANWIN = { [FATHATAN]: 'an', [DAMMATAN]: 'un', [KASRATAN]: 'in' };

const blank = (c, word, wordFirst) => ({
  c, word, wordFirst,
  vowel: null, shadda: false, sukun: false, madda: false,
  dagger: false, sila: null, silent: false, sakt: false,
  imala: false, tashil: false, iqlab: false, hamzaAbove: false, hamzaBelow: false,
});

/** Letters that can carry marks. */
const isLetter = c => /[ء-غف-يٱٲ]/.test(c);

/**
 * One written letter and everything hanging off it.
 *
 * `vowel` is 'a' | 'u' | 'i' for a ḥaraka, 'an' | 'un' | 'in' for a tanwīn, and
 * null when the letter carries none — which in a fully-marked muṣḥaf means it is
 * either sākin or a letter of prolongation.
 */
function parse(text) {
  const units = [];
  let word = 0, firstOfWord = true;

  let afterTatweel = false;
  for (const ch of text) {
    /*
     * A tāṭwīl is a joiner and never a sound — except that a muṣḥaf writes a
     * hamza sitting on the line by hanging it on one, as in «ٱلْـَْٔاخِرَةِ».
     * So a hamza mark arriving just after one opens a letter rather than
     * attaching to whatever came before.
     */
    if (ch === TATWEEL) { afterTatweel = true; continue; }
    if (afterTatweel && (ch === HAMZA_ABOVE || ch === HAMZA_BELOW)) {
      afterTatweel = false;
      units.push(blank('ء', word, firstOfWord));
      firstOfWord = false;
      continue;
    }
    afterTatweel = false;
    if (EDITORIAL.has(ch)) continue;
    if (ch === ' ' || ch === ' ') { word++; firstOfWord = true; continue; }

    if (isLetter(ch)) {
      units.push(blank(ch, word, firstOfWord));
      firstOfWord = false;
      continue;
    }

    const u = units[units.length - 1];
    if (!u) continue;                          // a stray mark before any letter
    if (VOWELS[ch]) u.vowel = VOWELS[ch];
    else if (TANWIN[ch]) u.vowel = TANWIN[ch];
    else if (ch === SHADDA) u.shadda = true;
    else if (ch === SUKUN) u.sukun = true;
    else if (ch === MADDAH) u.madda = true;
    else if (ch === DAGGER) u.dagger = true;
    else if (ch === SMALL_WAW) u.sila = 'u';
    else if (ch === SMALL_YA || ch === SMALL_HIGH_YA) u.sila = 'i';
    else if (ch === SILENT || ch === SILENT_UPRIGHT) u.silent = true;
    else if (ch === SAKT) u.sakt = true;
    else if (ch === IMALA) u.imala = true;
    else if (ch === TASHIL_MARK) u.tashil = true;
    else if (IQLAB.has(ch)) u.iqlab = true;
    else if (ch === HAMZA_ABOVE) u.hamzaAbove = true;
    else if (ch === HAMZA_BELOW) u.hamzaBelow = true;
  }

  /*
   * Marks written on an alif belong to the letter before it.
   *
   * An alif of prolongation carries nothing of its own, so a ḥaraka or a shadda
   * sitting on one was meant for the letter it lengthens — «لاَ» for «لَا»,
   * «وَصْلاً» for «وَصْلًا». Both orders are current in print and say the
   * same word; the muṣḥaf uses the first, most matn prints the second.
   */
  for (let i = 1; i < units.length; i++) {
    const u = units[i], before = units[i - 1];
    // Plain alif only: an alif maqṣūra is often a real yāʾ and its marks
    // are its own — «ٱلْغَىِّ» carries both a kasra and a shadda.
    if (u.c !== 'ا') continue;
    if (u.wordFirst || u.dagger || u.sila) continue;
    if (u.vowel && !before.vowel) { before.vowel = u.vowel; u.vowel = null; }
    if (u.shadda && !before.shadda) { before.shadda = true; u.shadda = false; }
  }

  // Which units end a word, so a rule can ask whether it reaches across one.
  for (let i = 0; i < units.length; i++) {
    units[i].wordLast = i + 1 === units.length || units[i + 1].word !== units[i].word;
  }
  return units;
}


/* ─── the letters, grouped by what the rules do with them ─────────────────── */

const SUN = new Set('تثدذرزسشصضطظلن');
const QALQALA = new Set('قطبجد');
/** Throat letters: a sākin nūn before one of these is simply pronounced. */
const IZHAR = new Set('ءهعحغخ');
/** Assimilated, keeping the hum — and only wāw and yāʾ are marked for it. */
const IDGHAM_HUM = new Set('ينمو');
const MARKED_HUM = new Set('يو');
/** Assimilated outright. */
const IDGHAM_PLAIN = new Set('لر');
/** Raised letters: they hold a rāʾ heavy. */
const ISTILA = new Set('خصضغطقظ');
const HAMZA = new Set('ءأإآؤئٱٲ');

/** Every spelling of the glottal stop says the same sound; so do tāʾ and tāʾ marbūṭa. */
function norm(c) {
  if (HAMZA.has(c)) return 'ء';
  if (c === 'ة') return 'ت';        // tāʾ marbūṭa is a tāʾ when spoken
  if (c === 'ى') return 'ي';        // alif maqṣūra is a yāʾ when it carries anything
  return c;
}

/* ─── writing a sound down ────────────────────────────────────────────────── */

const MARK = { a: 'َ', u: 'ُ', i: 'ِ' };

function sound({ letter, vowel = null, shadda = false, heavy = false, qalqala = false, hum = false }) {
  return letter
    + (shadda ? 'ّ' : '')
    + (heavy ? '^' : '')
    + (hum ? '~' : '')
    + (qalqala ? 'ڇ' : (vowel ? MARK[vowel] : ''));
}

const madd = (letter, count) => `${letter}:${count}`;

const NATURAL = 2;
const CONNECTED = 4;   // muttaṣil, munfaṣil, and the ṣila before a hamza
const OBLIGATORY = 6;  // lāzim
const AT_A_STOP = 4;   // ʿāriḍ li-s-sukūn

/* ─── the rules ───────────────────────────────────────────────────────────── */

export interface PhonemiseOptions {
  /** Whether the passage is stopped on at its end. True for an āyah or a bayt. */
  pause?: boolean;
  /**
   * The sounds that may be produced. Anything outside it is bent to the nearest
   * one that is in it — see `fit`. Defaults to letting everything through, so a
   * caller that has not loaded the index still gets sensible output.
   */
  alphabet?: Set<string> | null;
}

export function phonemise(text: string, options: PhonemiseOptions = {}): string[] {
  return sounds(text, options).map(s => s.symbol);
}

/** One sound, and which word of the passage it came out of. */
export interface Sound {
  symbol: string;
  /** Index of the word, counting from zero across the whole passage. */
  word: number;
}

/**
 * The same, keeping the word each sound belongs to.
 *
 * What the following needs: «he has reached the fourth word of this bayt» is
 * the estimate shown on screen, and it cannot be recovered from the sounds
 * alone once they are a flat list.
 */
export function sounds(text: string, { pause = true, alphabet = null }: PhonemiseOptions = {}): Sound[] {
  const units = parse(text).filter(u => !u.silent);
  /*
   * Where a word ends, recounted: «لَقُوا۟» writes a silent alif after its
   * wāw, so before dropping it the wāw did not look like the last letter of its
   * word — and whether a madd meets the next word turns on exactly that.
   */
  for (let i = 0; i < units.length; i++) {
    units[i].wordLast = i + 1 === units.length || units[i + 1].word !== units[i].word;
  }
  const out: Sound[] = [];
  /** Set when a nūn was swallowed into the letter now being said. */
  let carriedHum = false;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const push = (symbol: string) => out.push({ symbol, word: u.word });
    const last = lastSpoken(units, i);
    const c = norm(u.c);

    /*
     * An alif that is not lengthening anything is a hamza.
     *
     * A muṣḥaf spells the joining hamza «ٱ» and the cutting one «أ», so it never
     * needs this; an ordinary printed matn writes every one of them as a plain
     * alif and leaves the reader to know which. Carrying a ḥaraka it is the
     * cutting hamza and is said; bare, it is the joining one — said only when
     * the recitation opens on it, and otherwise passed over, which is what makes
     * «بِالْكَسْرِ» come out as «bi-l-kasri» rather than with an alif in the
     * middle of it.
     */
    if (u.c === 'ا' && !u.dagger && !u.sila && !isProlongation(units, i)) {
      if (u.vowel) {
        push(sound({ letter: 'ء', vowel: spokenVowel(u, lastSpoken(units, i), pause) }));
        continue;
      }
      if (i === 0) push(sound({ letter: 'ء', vowel: openingVowel(units, i) }));
      continue;
    }

    /* «آ» is a hamza and the alif after it, written as one letter. */
    if (u.c === 'آ') {
      push(sound({ letter: 'ء', vowel: 'a' }));
      push(madd('ا', lengthAfter(units, i, pause)));
      continue;
    }

    /* The hamza of ٱل and its kin: said when the recitation opens on it, passed
       over otherwise. */
    if (u.c === 'ٱ') {
      if (i === 0) push(sound({ letter: 'ء', vowel: openingVowel(units, i) }));
      continue;
    }

    /*
     * A sākin letter swallowed by the one after it.
     *
     * A muṣḥaf writes a shadda exactly where an assimilation happens — the lām
     * of the article before a sun letter, the dāl of «qad tabayyana», the lām of
     * «bal rāna» — so the shadda on the next letter is the instruction, and no
     * list of which letters assimilate into which is needed.
     */
    const next = units[i + 1];
    if (!u.vowel && !u.shadda && !u.dagger && !u.sila && next && next.shadda
        && !isProlongation(units, i)) continue;

    /*
     * The eased hamza of «a-aʿjamiyyun», and nowhere else in the Qur'an. The
     * muṣḥaf marks it on the alif that would otherwise be a prolongation, so it
     * has to be asked about before that.
     */
    if (u.tashil) { push('ٲ' + MARK.a); continue; }

    /* A letter of prolongation standing on its own. */
    const asMadd = prolongation(units, i, pause);
    if (asMadd !== undefined) { if (asMadd) push(asMadd); continue; }

    if (u.sakt) { push(u.c + 'ۜ'); continue; }
    if (u.imala) { push(u.c + '۪'); push(madd('ـ', NATURAL)); continue; }

    const vowel = spokenVowel(u, last, pause);

    /* A sākin mīm meeting what follows: hidden before a bāʾ, swallowed by
       another mīm, and otherwise simply said. */
    if (c === 'م' && vowel === null && !u.shadda) {
      const after = units[i + 1];
      const a = after ? norm(after.c) : null;
      if (a === 'ب') { push('۾'); continue; }
      if (a === 'م') { continue; }
      push(sound({ letter: 'م' }));
      continue;
    }

    /* A sākin nūn, or the nūn a tanwīn hides, meeting what follows. */
    const nasal = nasalFor(units, i, vowel);
    if (nasal !== undefined) {
      if (nasal) push(nasal);
      carriedHum = nasal === null;
      continue;
    }

    /*
     * A līn letter — a bare wāw or yāʾ after a fatḥa — is held when the pause
     * falls on the consonant right after it: «khawf» stopped on stretches its
     * wāw. Running on, it is not held at all.
     */
    if (vowel === null && !u.shadda && 'وي'.includes(c)
        && units[i - 1]?.vowel?.[0] === 'a' && pause && i + 2 === units.length) {
      push(madd(c, NATURAL));
      continue;
    }

    push(sound({
      // Stopped on, a tāʾ marbūṭa is said as the hāʾ it is written as.
      letter: u.c === 'ة' && vowel === null && last && pause ? 'ه' : c,
      vowel,
      shadda: u.shadda,
      heavy: isHeavy(units, i, vowel),
      qalqala: vowel === null && QALQALA.has(c),
      hum: carriedHum && MARKED_HUM.has(c),
    }));
    carriedHum = false;

    /* An alif nobody writes: the dagger over a letter, and the one inside the
       Name of God, which is spelled without it and said with it. */
    if (u.dagger) push(madd('ا', lengthAfter(units, i, pause)));
    else if (isNameOfGod(units, i)) push(madd('ا', NATURAL));

    /* The ṣila: a hāʾ of the pronoun draws out a wāw or a yāʾ after it. */
    if (u.sila) push(madd(u.sila === 'u' ? 'ۥ' : 'ۦ', lengthAfter(units, i, pause)));

    /* A tanwīn is a nūn nobody writes — every rule for a sākin nūn touches it. */
    const tail = tanwinTail(units, i, last, pause);
    if (tail !== undefined) {
      if (tail) push(tail);
      carriedHum = tail === null;
    }
  }
  return alphabet ? out.map(s => ({ ...s, symbol: fit(s.symbol, alphabet) })) : out;
}

/**
 * Whether this unit is a letter of prolongation rather than a consonant.
 *
 * Asked before the assimilation rule, which must never swallow one: a madd is
 * not a sākin consonant looking for something to melt into.
 */
function isProlongation(units, i) {
  const u = units[i];
  const prev = units[i - 1];
  const before = prev?.vowel?.[0];
  if (u.vowel || u.shadda || u.sukun) return false;
  // The same relaxation `prolongation` makes: an alif inside a word lengthens
  // whatever precedes it, marked or not.
  if ((u.c === 'ا' || u.c === 'ى') && (before === 'a' || (prev && !prev.vowel))) return true;
  if (u.c === 'و' && before === 'u') return true;
  if ((u.c === 'ي' || u.c === 'ى') && before === 'i') return true;
  return false;
}

/**
 * Whether this is the last consonant of the passage.
 *
 * Not simply the last unit: «رَقِيبًا» ends in an alif that is there to carry
 * the fatḥatān, so the bāʾ is what a pause falls on.
 */
function lastSpoken(units, i) {
  if (i === units.length - 1) return true;
  /*
   * The alif written after a fatḥatān belongs to the pause, not to the word, so
   * the letter carrying the tanwīn is what the pause falls on. A real madd is
   * the opposite: «amthāluhā» ends on its alif, and the hāʾ before it keeps
   * its fatḥa.
   */
  const u = units[i];
  const next = units[i + 1];
  return u.vowel === 'an' && i + 2 === units.length
    && 'اى'.includes(next.c) && !next.vowel && !next.shadda;
}


/**
 * The vowel actually said.
 *
 * A pause takes the last vowel away — except a fatḥatān, which does not fall
 * silent but opens out into the alif written after it: «raḳīban» stopped on is
 * «raḳībā».
 */
function spokenVowel(u, last, pause) {
  if (!u.vowel) return null;
  if (last && pause) return u.vowel === 'an' ? 'a' : null;
  return u.vowel[0];
}

/**
 * Whether this unit is a letter of prolongation, and what it comes to.
 *
 * `undefined` means it is not one; `null` means it is one that is not sounded
 * — a madd meeting a sākin is dropped, and the alif propping up a fatḥatān is
 * written only for the pause.
 */
function prolongation(units, i, pause) {
  const u = units[i];
  const prev = units[i - 1];
  if (!prev) return undefined;
  if (u.vowel || u.shadda || u.sukun) return undefined;

  /*
   * «عَلَىٰ»: the yāʾ carries a dagger alif and is not itself said. The
   * carrier is written only to hold the mark up.
   */
  if (u.dagger) {
    return 'اىوي'.includes(u.c) ? madd('ا', lengthAt(units, i, pause)) : undefined;
  }

  const before = prev.vowel?.[0];
  let letter = null;
  /*
   * An alif inside a word is a prolongation whatever precedes it. Asking for a
   * fatḥa in front would be right for a muṣḥaf, where every letter is marked,
   * and wrong for an ordinary printed matn, where «الْكَمالِ» leaves the mīm
   * bare and a reader is trusted to know the word.
   */
  if ((u.c === 'ا' || u.c === 'ى') && (before === 'a' || !prev.vowel)) letter = 'ا';
  else if (u.c === 'و' && before === 'u') letter = 'ۥ';
  else if ((u.c === 'ي' || u.c === 'ى') && before === 'i') letter = 'ۦ';
  if (!letter) return undefined;

  // The alif written after a fatḥatān is the pause's, not the flow's.
  if (prev.vowel === 'an') return pause && i === units.length - 1 ? madd('ا', NATURAL) : null;
  /*
   * Two sākins cannot meet, so the madd gives way to the consonant after it:
   * «hādhā lladhī» is said «hādha-lladhī». Not so where the muṣḥaf has written
   * a maddah — that is the obligatory madd, which is held, not dropped.
   */
  if (!u.madda && meetsASakin(units, i)) return null;

  return madd(letter, lengthAt(units, i, pause));
}

/**
 * Whether what follows a madd opens with a sākin, which shortens it away.
 *
 * A doubled letter counts: the first half of a shadda is a sākin, which is why
 * «hādhā» loses its alif before «al-ladhī». The hamza of the article is
 * stepped over on the way, and so is the article's own lām before a sun letter,
 * because neither is said.
 */
function meetsASakin(units, i) {
  if (!units[i].wordLast) return false;
  let j = i + 1;
  while (j < units.length && units[j].c === 'ٱ') j++;
  const a = units[j];
  if (!a) return false;
  if (norm(a.c) === 'ل' && !a.vowel && !a.shadda && units[j + 1]?.shadda) return true;
  /*
   * A letter with no vowel is sākin whether or not the muṣḥaf troubles to write
   * the sukūn — it does not, after a hamzat waṣl or on an ikhfāʾ nūn — so the
   * mark is not what is asked for. A doubled letter is sākin in its first half.
   */
  return a.shadda || (!a.vowel && !isProlongation(units, j));
}

/** How long a prolongation standing on its own is held. */
function lengthAt(units, i, pause) {
  const u = units[i];
  const next = units[i + 1];
  if (!next) return pause ? NATURAL : NATURAL;
  if (u.madda) return HAMZA.has(next.c) ? CONNECTED : OBLIGATORY;
  if (isSpokenHamza(next) && next.word !== u.word) return CONNECTED;
  if (pause && i + 2 === units.length) return AT_A_STOP;
  return NATURAL;
}

/** A hamza that is actually said — the article's is elided and is not one. */
const isSpokenHamza = u => HAMZA.has(u.c) && u.c !== 'ٱ';

/** The same, for a prolongation hanging off a consonant — a dagger or a ṣila. */
function lengthAfter(units, i, pause) {
  const u = units[i];
  const next = units[i + 1];
  if (!next) return NATURAL;
  if (u.madda) return HAMZA.has(next.c) ? CONNECTED : OBLIGATORY;
  if (isSpokenHamza(next) && next.word !== u.word) return CONNECTED;
  if (pause && i + 2 === units.length) return AT_A_STOP;
  return NATURAL;
}

/** The vowel a recitation opening on a hamzat waṣl begins with. */
function openingVowel(units, i) {
  const next = units[i + 1];
  if (!next) return 'i';
  // The article opens on a fatḥa.
  if (norm(next.c) === 'ل') return 'a';
  /*
   * A verb's opening hamza takes the vowel of the letter that carries the
   * verb's own: «unẓur», not «inẓur», because the ẓāʾ has a ḍamma. Anything
   * else opens on a kasra.
   */
  const third = units[i + 2];
  return third?.vowel?.[0] === 'u' ? 'u' : 'i';
}


/**
 * A sākin nūn meeting what follows.
 *
 * A sound to emit, `null` when the nūn is swallowed by the letter after it, and
 * `undefined` when this is not a bare nūn at all.
 */
function nasalFor(units, i, vowel) {
  const u = units[i];
  if (norm(u.c) !== 'ن' || vowel !== null || u.shadda) return undefined;
  const next = units[i + 1];
  /*
   * Inside one word a nūn before a wāw or a yāʾ is said plainly — «dunyā»,
   * «bunyān», «ṣinwān», «qinwān», and no others. Assimilating there would
   * turn the word into one nobody says.
   */
  if (next && next.word === u.word && 'وي'.includes(norm(next.c))) return sound({ letter: 'ن' });
  return meeting(next, u.iqlab);
}

/** The nūn a tanwīn stands for, once the vowel it rode on has been said. */
function tanwinTail(units, i, last, pause) {
  const u = units[i];
  if (!u.vowel || u.vowel.length !== 2) return undefined;
  if (last && pause) return undefined;   // stopped on: no nūn, see `spokenVowel`
  // The alif propping up a fatḥatān is not a letter the nūn meets, and neither
  // is the article's hamza, nor its lām when a sun letter has swallowed it.
  let j = i + 1;
  if (units[j] && (units[j].c === 'ا' || units[j].c === 'ى') && !units[j].vowel) j++;
  while (units[j] && units[j].c === 'ٱ') j++;
  if (units[j] && norm(units[j].c) === 'ل' && !units[j].vowel && !units[j].shadda
      && units[j + 1]?.shadda) j++;
  const next = units[j];
  /*
   * Two sākins cannot meet, and the tanwīn's nūn is the one that gives way: it
   * takes a kasra instead of falling silent. «khayran al-waṣiyyatu» is said
   * «khayrani l-waṣiyyatu».
   */
  if (next && !next.vowel && !next.shadda && !next.dagger && !next.sila) {
    return sound({ letter: 'ن', vowel: 'i' });
  }
  return meeting(next, u.iqlab);
}

/** What a sākin nūn becomes before `next`. */
function meeting(next, iqlab) {
  if (!next) return sound({ letter: 'ن' });
  const n = norm(next.c);
  if (iqlab || n === 'ب') return '۾';
  if (IZHAR.has(n)) return sound({ letter: 'ن' });
  if (IDGHAM_HUM.has(n) || IDGHAM_PLAIN.has(n)) return null;
  return 'ں';
}

/**
 * Whether a rāʾ — or the lām of the Name — is said heavy.
 *
 * A rāʾ is heavy on a fatḥa or a ḍamma and light on a kasra; sākin, it takes
 * the colour of the vowel before it, unless a raised letter after pulls it back.
 */
function isHeavy(units, i, vowel) {
  const u = units[i];
  const c = norm(u.c);
  if (c === 'ل') return isNameOfGod(units, i) && !afterKasra(units, i);
  if (c !== 'ر') return false;
  if (vowel === 'a' || vowel === 'u') return true;
  if (vowel === 'i') return false;
  const before = colouringVowel(units, i);
  if (before === 'i') {
    const next = units[i + 1];
    return !!(next && ISTILA.has(next.c));
  }
  return true;
}

/**
 * The lām of «Allāh»: doubled, on a fatḥa, between a lām and the hāʾ.
 *
 * The lām in front is what tells the Name from every other word shaped like it.
 * Without it «kullahā» and «fa-azallahumā» are doubled lāms on a fatḥa with a
 * hāʾ behind them too, and each would be given the Name's heavy lām and its
 * unwritten alif.
 */
function isNameOfGod(units, i) {
  const u = units[i];
  if (norm(u.c) !== 'ل' || !u.shadda || u.vowel?.[0] !== 'a') return false;
  if (norm(units[i + 1]?.c ?? '') !== 'ه') return false;
  const before = units[i - 1];
  // …and in the same word: «tastaʿjil lahum» has a lām at the end of the word
  // before, and is not the Name.
  return !!before && norm(before.c) === 'ل' && before.word === u.word;
}

/**
 * The vowel last actually spoken before position `i`.
 *
 * Not simply the unit before: the article's lām is silent before a sun letter
 * and its hamza is elided, so «bismi llāhi» has two written letters between
 * the kasra that lightens the Name's lām and the lām itself.
 */
function spokenVowelBefore(units, i) {
  for (let j = i - 1; j >= 0; j--) {
    const u = units[j];
    if (u.c === 'ٱ' || u.silent) continue;
    if (norm(u.c) === 'ل' && !u.vowel && !u.shadda) continue;
    return u.vowel?.[0] ?? null;
  }
  return null;
}

/**
 * The vowel that colours a sākin rāʾ.
 *
 * A letter of prolongation carries no ḥaraka of its own but is every bit the
 * vowel it lengthens: «qadīr» stopped on has a yāʾ before the rāʾ, and it is
 * that kasra which makes the rāʾ light.
 */
function colouringVowel(units, i) {
  const prev = units[i - 1];
  if (!prev) return null;
  if (!prev.vowel && !prev.shadda && !prev.sukun) {
    if (prev.dagger || prev.c === 'ا' || prev.c === 'ى') return 'a';
    if (prev.c === 'و') return 'u';
    if (prev.c === 'ي') return 'i';
  }
  if (prev.sila) return prev.sila;
  return prev.vowel?.[0] ?? null;
}

const afterKasra = (units, i) => spokenVowelBefore(units, i) === 'i';

/**
 * The nearest sound the alphabet actually has.
 *
 * The 233 symbols are the ones the Qur'an makes, which is not the same as the
 * ones Arabic makes: a doubled dāl echoed at a pause, a ḥāʾ doubled on a ḍamma,
 * a wāw carrying a hum with no vowel of its own — all are sayable and none of
 * them occurs in the Qur'an, so none has a symbol.
 *
 * Rather than emit one nothing can hear, the detail is dropped a piece at a
 * time — the gemination first, then the heaviness or the hum — until something
 * lands. What is left is the same consonant with the same vowel, which is what
 * the alignment is really matching on. Where even that fails the sound is kept
 * as it is, so a gap shows up as a mismatch rather than as silence.
 */
export function fit(token: string, alphabet: Set<string>): string {
  if (alphabet.has(token)) return token;
  for (const simpler of [
    token.replace('ّ', ''),
    token.replace('~', ''),
    token.replace('^', ''),
    token.replace('ّ', '').replace(/[~^]/g, ''),
    token.replace(/[ّ~^]/g, '').replace(/[َُِ]/g, ''),
  ]) {
    if (simpler !== token && alphabet.has(simpler)) return simpler;
  }
  return token;
}
