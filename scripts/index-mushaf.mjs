/**
 * Derives an edition's page index from its own page assets.
 *
 *   node scripts/index-mushaf.mjs warsh-kfqc
 *
 * Which ayahs sit on which printed page is a physical fact about one print
 * run. It cannot be computed from the text and must never be borrowed from
 * another edition — the King Fahd Complex prints Warsh with a different verse
 * numbering from Hafs, so a page index copied across would be quietly wrong.
 * So it is read back out of the publisher's own polygon layer and written to
 * `page-index.json`, which is what the app navigates by.
 *
 * The run refuses to write an index it cannot vouch for: the polygons must
 * enumerate every ayah of every surah exactly once, in order.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) { console.error('usage: mushaf:index <edition-id>'); process.exit(1); }

const dir = join(ROOT, 'sard', 'public', 'mushafs', id);
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
const files = (await readdir(join(dir, 'pages'))).filter(f => f.endsWith('.svg')).sort();

const problems = [];
const pages = [];
const perSurah = new Map();
let total = 0;
let previous = null;

for (const f of files) {
  const page = Number(f.slice(0, 3));
  const svg = await readFile(join(dir, 'pages', f), 'utf8');
  const seen = [];
  for (const tag of svg.matchAll(/<path[^>]*class="ayahPolygon"[^>]*>/g)) {
    const surah = Number((/surah="(\d+)"/.exec(tag[0]) || [])[1]);
    const ayah = Number((/\bayah="(\d+)"/.exec(tag[0]) || [])[1]);
    if (!surah || !ayah) { problems.push(`page ${page}: an ayahPolygon lacks surah/ayah`); continue; }
    // One ayah may be drawn as several polygons where it wraps; count it once.
    const last = seen[seen.length - 1];
    if (last && last[0] === surah && last[1] === ayah) continue;
    seen.push([surah, ayah]);
  }
  if (!seen.length) { problems.push(`page ${page} carries no ayah polygon`); pages.push([]); continue; }

  // The reading order is the sequence the app maps positions by, so a page
  // whose polygons are out of order would silently mis-locate every ayah on it.
  for (const [surah, ayah] of seen) {
    if (previous) {
      const [ps, pa] = previous;
      const ok = (surah === ps && ayah === pa + 1) || (surah === ps + 1 && ayah === 1);
      if (!ok) problems.push(`page ${page}: ${ps}:${pa} is followed by ${surah}:${ayah}`);
    } else if (surah !== 1 || ayah !== 1) {
      problems.push(`the first polygon is ${surah}:${ayah}, not 1:1`);
    }
    previous = [surah, ayah];
    perSurah.set(surah, Math.max(perSurah.get(surah) ?? 0, ayah));
    total++;
  }

  // Contiguous ayahs collapse to a run; most pages are one or two.
  const runs = [];
  for (const [surah, ayah] of seen) {
    const last = runs[runs.length - 1];
    if (last && last[0] === surah && last[2] === ayah - 1) last[2] = ayah;
    else runs.push([surah, ayah, ayah]);
  }
  pages.push(runs);
}

if (files.length !== manifest.pageCount) {
  problems.push(`${files.length} pages on disk but the manifest says ${manifest.pageCount}`);
}
if (perSurah.size !== 114) problems.push(`${perSurah.size} surahs found, expected 114`);
for (let s = 1; s <= 114; s++) if (!perSurah.has(s)) problems.push(`surah ${s} never appears`);

if (problems.length) {
  console.error(`✗ ${id}: cannot index — ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 20)) console.error('  - ' + p);
  process.exit(1);
}

await writeFile(join(dir, 'page-index.json'), JSON.stringify({
  id,
  firstPageNumber: manifest.firstPageNumber,
  pageCount: files.length,
  /** This edition's own verse count. Warsh does not number as Hafs does. */
  totalAyahs: total,
  /** `[surah, fromAyah, toAyah]` runs, in reading order, one entry per page. */
  pages,
}) + '\n');

console.log(`${id}: ${files.length} pages, ${total} ayahs, ${perSurah.size} surahs`);
console.log(`wrote ${join('sard/public/mushafs', id, 'page-index.json')}`);
