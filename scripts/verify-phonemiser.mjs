/**
 * Measures the phonemiser against the whole Qur'an.
 *
 *   npm run phonemiser:verify
 *   npm run phonemiser:verify -- --top=20     # more of the error classes
 *   npm run phonemiser:verify -- --matn       # what it does to the seven matns
 *
 * ## Why this can exist at all
 *
 * `sard/public/quran-phonemes.json` holds the sounds of all 6,236 āyāt, given
 * to us already made. So the phonemiser has a test set of 311,878 sounds that
 * nobody had to build, in exactly the alphabet and conventions it has to
 * reproduce. Running it over them turns «does this work» into a number.
 *
 * The Uthmani text is fetched once from quran.com and cached under `.cache/`;
 * the repo's own Qur'an file cannot stand in for it, because its `aya_text` is
 * a private-use glyph encoding and its `aya_text_emlaey` carries no ḥarakāt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { phonemise, fit } from '../src/lib/asr/phonemise.ts';

const CACHE = join('.cache', 'uthmani.json');
const SOURCE = 'https://api.quran.com/api/v4/quran/verses/uthmani';

async function uthmani() {
  if (!existsSync(CACHE)) {
    mkdirSync(join('.cache'), { recursive: true });
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`could not fetch the Uthmani text: ${res.status}`);
    writeFileSync(CACHE, await res.text());
  }
  return JSON.parse(readFileSync(CACHE, 'utf8')).verses;
}

/** Levenshtein, with the edit list, so the errors can be grouped by kind. */
function compare(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
      );
    }
  }
  const edits = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) edits.push(`${a[i - 1]} → ${b[j - 1]}`);
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { edits.push(`${a[--i]} → (nothing)`); }
    else { edits.push(`(nothing) → ${b[--j]}`); }
  }
  return { distance: d[n][m], edits };
}

const index = JSON.parse(readFileSync(join('sard', 'public', 'quran-phonemes.json'), 'utf8'));
const alphabet = new Set(index.vocab);
const writable = new Map(index.vocab.map((s, i) => [s, index.model[i]]));

async function quran(top) {
  const verses = await uthmani();
  let exact = 0, sounds = 0, wrong = 0;
  const classes = new Map();

  for (const v of verses) {
    const entry = index.ayahs[v.verse_key];
    const want = [...Buffer.from(entry.t, 'base64')].map(i => index.vocab[i]);
    const got = phonemise(v.text_uthmani, { alphabet });
    sounds += want.length;
    if (got.join(' ') === want.join(' ')) { exact++; continue; }
    const { distance, edits } = compare(want, got);
    wrong += distance;
    for (const e of edits) classes.set(e, (classes.get(e) || 0) + 1);
  }

  console.log(`the Qur'an, all ${verses.length} āyāt`);
  console.log(`  āyāt exactly right : ${exact} (${(exact / verses.length * 100).toFixed(1)}%)`);
  console.log(`  sounds right       : ${(100 * (1 - wrong / sounds)).toFixed(2)}%   (${wrong} wrong of ${sounds})`);
  if (top) {
    console.log('\n  the commonest disagreements, worst first:');
    for (const [k, n] of [...classes].sort((a, b) => b[1] - a[1]).slice(0, top)) {
      console.log(`  ${String(n).padStart(6)}  ${k}`);
    }
  }
}

/**
 * What the phonemiser does to the matns, which have no answer key.
 *
 * Two things can still be checked, and both matter: that every sound it makes
 * is one the recogniser knows, and that the model can actually write it. A
 * sound outside the alphabet would break an alignment silently rather than
 * loudly, which is the failure worth ruling out.
 */
function matns() {
  const known = [
    'tuhfa', 'jazariyya', 'salsabil', 'laali', 'durra', 'shatibiyya', 'tayyiba',
  ].filter(id => existsSync(join('sard', 'public', `matn-${id}.json`)));

  console.log('\nthe matns, which have no answer key');
  console.log('  matn         abyāt   sounds   per bayt   bent to fit   the model cannot write');
  for (const id of known) {
    const file = JSON.parse(readFileSync(join('sard', 'public', `matn-${id}.json`), 'utf8'));
    let sounds = 0, bent = 0, mute = 0;
    for (const b of file.abyat) {
      for (const half of [b.sadr, b.ajz]) {
        const raw = phonemise(half);
        sounds += raw.length;
        for (const t of raw) {
          const f = fit(t, alphabet);
          if (f !== t) bent++;
          if (!alphabet.has(f)) bent++;
          else if (!writable.get(f)) mute++;
        }
      }
    }
    const pc = n => `${((n / sounds) * 100).toFixed(2)}%`;
    console.log(
      `  ${id.padEnd(12)} ${String(file.abyat.length).padStart(5)} ${String(sounds).padStart(8)}` +
      `   ${(sounds / file.abyat.length).toFixed(1).padStart(7)}   ${pc(bent).padStart(9)}   ${pc(mute).padStart(9)}`,
    );
  }
}

const args = process.argv.slice(2);
const top = Number(args.find(a => a.startsWith('--top='))?.split('=')[1] ?? 0);
await quran(top);
if (args.includes('--matn')) matns();
