/**
 * Turns the mutashābihāt dataset kit's output into the index the app ships.
 *
 *   node scripts/build-mutashabihat.mjs <dist-dir>
 *
 * The kit produces 8 MB of pairs carrying the full text of both sides. This
 * app needs neither: it already holds the Qur'an, so a pair is two references
 * and what kind of resemblance it is. The index that comes out is a fraction
 * of the size and is fetched once, on demand.
 *
 * ## What is dropped, and why it matters
 *
 * The kit classifies 95% of its pairs as `phrase_overlap`, and those have a
 * **median similarity of 0.30**, a floor of 0.01, and no shared opening or
 * closing at all — «2:15 resembles 2:174» at 0.18 is not something to tell a
 * memoriser. A card that says «you may be confusing this with…» is a claim,
 * and a feature that makes weak claims teaches the student to ignore it.
 *
 * So the loose category is admitted only above `LOOSE_MIN_SIMILARITY`, and
 * every surviving pair carries the tier it came from so the interface can
 * show the strong ones plainly and the rest as possibilities.
 *
 * ## Attribution is not optional
 *
 * The upstream data requires the Quranic Arabic Corpus be named with a link.
 * That requirement travels into the index itself rather than living in a
 * comment somewhere, so whatever ships the data ships the credit with it.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = process.argv[2];
if (!distDir) {
  console.error('usage: node scripts/build-mutashabihat.mjs <kit-dist-dir>');
  process.exit(1);
}

const pairsPath = join(distDir, 'mutashabihat_huffaz_pairs.json');
if (!existsSync(pairsPath)) {
  console.error(`not found: ${pairsPath}\nRun the kit's build_mutashabihat.py first.`);
  process.exit(1);
}

/** Kinds where the resemblance is a real one a memoriser trips on. */
const STRONG = new Set([
  'identical', 'one_word_change', 'few_word_changes', 'close_wording',
  'same_beginning', 'same_ending', 'addition_omission', 'multi_verse_sequence',
]);

/**
 * The bar the machine-inferred category has to clear.
 *
 * 0.65 keeps the tail where two verses genuinely read alike and drops the
 * long middle where they merely share a common word.
 */
const LOOSE_MIN_SIMILARITY = 0.65;

const raw = JSON.parse(readFileSync(pairsPath, 'utf8'));

/** «2:255» → [2, 255]; a multi-verse side keeps only where it begins. */
const firstRef = (refs) => {
  const [first] = String(refs).split(/[,\s]+/);
  const [surah, ayah] = first.split(':').map(Number);
  return Number.isFinite(surah) && Number.isFinite(ayah) ? [surah, ayah] : null;
};

const byAyah = new Map();
let kept = 0;
let dropped = 0;

for (const pair of raw.pairs) {
  const { type, similarity } = pair.analysis;
  const strong = STRONG.has(type);
  if (!strong && similarity < LOOSE_MIN_SIMILARITY) { dropped++; continue; }

  const from = firstRef(pair.source_refs);
  const to = firstRef(pair.match_refs);
  if (!from || !to) { dropped++; continue; }
  // A verse does not resemble itself usefully.
  if (from[0] === to[0] && from[1] === to[1]) { dropped++; continue; }

  kept++;
  // Both directions: the student may stumble at either end of the pair.
  for (const [a, b] of [[from, to], [to, from]]) {
    const key = `${a[0]}:${a[1]}`;
    const list = byAyah.get(key) ?? [];
    if (!list.some(m => m.r === `${b[0]}:${b[1]}`)) {
      list.push({
        r: `${b[0]}:${b[1]}`,
        t: type,
        s: Math.round(similarity * 100),
        ...(strong ? {} : { w: 1 }),   // w: weaker, machine-inferred
      });
    }
    byAyah.set(key, list);
  }
}

// Strongest first, so an interface that shows only one shows the best one.
for (const list of byAyah.values()) list.sort((x, y) => y.s - x.s);

const index = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    pairs: kept,
    ayahs: byAyah.size,
    looseMinSimilarity: LOOSE_MIN_SIMILARITY,
    // Required by the upstream licence — carried in the data, not in a comment.
    attribution: [
      {
        name: 'Quranic Arabic Corpus',
        url: 'https://corpus.quran.com',
        license: 'GNU General Public License',
      },
      { name: 'Quranpedia', url: 'https://quranpedia.net' },
      {
        name: 'Quran_Mutashabihat_Data',
        url: 'https://github.com/Waqar144/Quran_Mutashabihat_Data',
      },
    ],
  },
  byAyah: Object.fromEntries(byAyah),
};

const out = resolve('sard/public/mutashabihat.json');
writeFileSync(out, JSON.stringify(index), 'utf8');

const bytes = readFileSync(out).length;
console.log(`kept ${kept} pairs, dropped ${dropped}`);
console.log(`${byAyah.size} ayahs indexed`);
console.log(`${out} — ${(bytes / 1024).toFixed(0)} KB`);
