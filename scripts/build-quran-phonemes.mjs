/**
 * Turns the Quran-Lab phonetics dataset into the index the recogniser compares
 * against.
 *
 *   node scripts/build-quran-phonemes.mjs <dataset-dir>
 *
 * The dataset dir must hold `quran_labels_v1.jsonl` and `bijection_old250.json`
 * from https://huggingface.co/datasets/Quran-Lab/quran-tajweed-phonetics —
 * which is open, unlike the model repository beside it.
 *
 * ## Why this file exists at all
 *
 * The recogniser emits sounds. To say anything about a recitation we need the
 * sounds the passage *should* have produced, in the same alphabet, for all
 * 6,236 āyāt. That is what comes out of here.
 *
 * ## Two alphabets, and which one wins
 *
 * The dataset labels the Qur'an in a 234-symbol lexicon. The shipped model was
 * trained on an older 250-unit inventory, and `bijection_old250.json` maps
 * between them. The mapping is **not** one-to-one: the old inventory cannot
 * write tafkhīm (`ر^` and `ر` collapse) and fixes madd at one length.
 *
 * The comparison therefore happens in the **old** alphabet, because that is
 * the only one the model can speak. Collapsing the expected side down to it is
 * exact — every one of the 311,878 symbols in the Qur'an has an old spelling —
 * and it means the aligner is structurally unable to report a tafkhīm or a
 * madd-length slip. That is correct: the model cannot hear those, so a
 * disagreement there says nothing about the reciter. The precise symbol is
 * kept alongside for display, never for judgement.
 *
 * ## Word boundaries
 *
 * Taken from `quran_phonetics.jsonl`, which numbers every sound by the word of
 * the **written** verse it belongs to. That file is 143 MB and is read only
 * here; what ships is a byte per word.
 *
 * The obvious cheaper source — the spaced transcription in
 * `quran_labels_v1.jsonl` — was tried first and is wrong for this. Its
 * «words» are phonetic groups, not written ones: idghām, ikhfāʾ and a linking
 * tanwīn run words together, so «هدى من ربهم» is one group. Measured against
 * the printed text it agreed **34%** of the time, which would have put a
 * highlight on the wrong word two times in three.
 *
 * The two files are joined by counting consonants. Every token that is not a
 * pure madd carries exactly one consonant, and the phonetics file marks a
 * doubled letter `geminated` rather than repeating it — so the k-th
 * consonant-bearing token is the k-th consonant phone, and takes its word. A
 * madd belongs to the word around it.
 *
 * That derivation reproduces the printed word count for **6,142 of 6,236**
 * āyāt. The rest are shipped with **no** word boundaries rather than guessed
 * ones: most are the muqaṭṭaʿāt, where «الم» is one written word and three
 * spoken ones and neither reading is wrong. A candidate there points at the
 * verse, which is where it pointed before any of this existed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/build-quran-phonemes.mjs <dataset-dir>');
  process.exit(1);
}

const need = ['quran_labels_v1.jsonl', 'bijection_old250.json', 'quran_phonetics.jsonl'];
for (const f of need) {
  if (!existsSync(join(dir, f))) {
    console.error(`missing ${f} in ${dir}`);
    console.error('get it from https://huggingface.co/datasets/Quran-Lab/quran-tajweed-phonetics');
    process.exit(1);
  }
}

const bij = JSON.parse(readFileSync(join(dir, 'bijection_old250.json'), 'utf8'));

/**
 * Symbol table, ordered so an id is an index.
 *
 * Built from the bijection rather than from `tokens.txt`, so that this script
 * needs nothing out of the gated model repository. The ids below are this
 * file's own; nothing outside it depends on their values.
 */
const vocab = Object.keys(bij.map).sort();
const idOf = new Map(vocab.map((s, i) => [s, i]));
if (vocab.length > 255) throw new Error(`vocab ${vocab.length} will not fit a byte`);

/** Parallel to `vocab`: how the model writes the same sound, or null. */
const model = vocab.map(s => bij.map[s].old_unit ?? null);

/**
 * The consonant word indices of every verse, from the phonetics file.
 *
 * Read here and nowhere else: the file is 143 MB and what ships out of it is a
 * byte per word. Only the consonants are kept — see the header for why they
 * are what joins the two files.
 */
function consonantWordsByAyah() {
  const out = new Map();
  const text = readFileSync(join(dir, 'quran_phonetics.jsonl'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const words = [];
    for (const phone of row.phones) {
      if (phone.kind === 'consonant') words.push(phone.word_index);
    }
    out.set(`${row.surah}:${row.ayah}`, words);
  }
  return out;
}

const consonantWords = consonantWordsByAyah();

/**
 * How many words each verse is **printed** with.
 *
 * From the app's own Qur'an text, and emphatically not from the transcription
 * beside the tokens: that one's spaces fall on phonetic groups, so checking a
 * derivation against it would be checking it against the very thing this is
 * meant to replace. Doing exactly that left 4,110 āyāt without boundaries
 * instead of 94.
 */
const printedWordCount = new Map(
  JSON.parse(readFileSync(join('sard', 'public', 'hafs_smart_v8.json'), 'utf8'))
    .map(row => [
      `${row.sura_no}:${row.aya_no}`,
      row.aya_text_emlaey.split(' ').filter(Boolean).length,
    ]),
);

const lines = readFileSync(join(dir, 'quran_labels_v1.jsonl'), 'utf8').split('\n').filter(Boolean);
if (lines.length !== 6236) throw new Error(`expected 6236 āyāt, read ${lines.length}`);

const ayahs = {};
const noWords = [];
let symbols = 0;
let words = 0;

for (const line of lines) {
  const { surah, ayah, tokens, text } = JSON.parse(line);
  const ids = Buffer.alloc(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    const id = idOf.get(tokens[i]);
    if (id === undefined) throw new Error(`${surah}:${ayah} uses ${tokens[i]}, absent from the bijection`);
    ids[i] = id;
  }
  symbols += tokens.length;

  const entry = { t: ids.toString('base64') };
  const runs = wordRuns(
    tokens,
    consonantWords.get(`${surah}:${ayah}`),
    printedWordCount.get(`${surah}:${ayah}`),
  );
  if (runs) {
    entry.w = Buffer.from(runs).toString('base64');
    words += runs.length;
  } else {
    noWords.push(`${surah}:${ayah}`);
  }
  ayahs[`${surah}:${ayah}`] = entry;
}

/** A pure madd carries no consonant of its own: «ا:2», «ۦ:4» and the rest. */
function isMadd(token) {
  return token.includes(':');
}

/**
 * How many sounds each word of the verse takes, or null where the derivation
 * cannot be checked against the printed verse.
 *
 * All-or-nothing on purpose: a walk that drifted mid-verse would put every
 * later sound in the wrong word, and a confident wrong pointer is worse than
 * none.
 */
function wordRuns(tokens, consonantWordIndices, printed) {
  if (!consonantWordIndices) return null;

  const words = [];
  let k = 0;
  for (const token of tokens) {
    if (isMadd(token)) { words.push(null); continue; }
    if (k >= consonantWordIndices.length) return null;
    words.push(consonantWordIndices[k++]);
  }
  // Every consonant must have been claimed. A leftover means the two files
  // disagree about this verse, and its words are then not safe to place.
  if (k !== consonantWordIndices.length) return null;

  // A madd belongs to the word around it — the one before it, else the one after.
  let last = null;
  for (let i = 0; i < words.length; i++) {
    if (words[i] === null) words[i] = last; else last = words[i];
  }
  let next = null;
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i] === null) words[i] = next; else next = words[i];
  }
  if (words.some(w => w === null)) return null;

  // The check that decides whether this verse ships word boundaries at all:
  // the derivation must reproduce the printed verse exactly.
  if (words[0] !== 0 || Math.max(...words) + 1 !== printed) return null;

  const runs = [];
  let current = -1;
  for (const w of words) {
    if (w !== current) { runs.push(0); current = w; }
    runs[runs.length - 1]++;
  }
  if (runs.length !== printed || runs.some(r => r > 255)) return null;
  return runs;
}

const out = {
  attribution: [{
    name: 'Quran-Lab — quran-tajweed-phonetics',
    url: 'https://huggingface.co/datasets/Quran-Lab/quran-tajweed-phonetics',
    license: 'NPL-1.2',
  }],
  vocab,
  model,
  ayahs,
  /** Named, not hidden — see the header. */
  withoutWordBoundaries: noWords,
};

const dest = join('sard', 'public', 'quran-phonemes.json');
writeFileSync(dest, JSON.stringify(out));

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`${dest}: ${kb(JSON.stringify(out).length)}`);
console.log(`  ${lines.length} āyāt · ${symbols} symbols · ${words} words`);
console.log(`  vocab ${vocab.length}, of which ${model.filter(Boolean).length} the model can write`);
console.log(`  without word boundaries: ${noWords.length}${noWords.length ? ` (${noWords.join(', ')})` : ''}`);
