/**
 * Builds an edition's page index from a supplied page list rather than plates.
 *
 *   node scripts/index-mushaf-from-pages.mjs hafs-shamarly public/mushaf-shamarly.json
 *
 * Most editions here carry their own vector pages, and `mushaf:index` reads the
 * boundaries straight off them. Ash-Shamarly is different: we hold its
 * pagination — supplied by the owner from a page database — and no licensed
 * images. The pagination alone is enough to make it a real edition of the
 * engine: its own pages, its own surah endings, its own "finish the surah".
 *
 * The supplied file gives the first ayah of each page. Everything between two
 * starts belongs to the earlier page, so the whole book is covered exactly
 * once — and that is checked here rather than assumed, because a page index
 * that is subtly wrong sends a student to the wrong passage in silence.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [id, source] = process.argv.slice(2);
if (!id || !source) {
  console.error('usage: node scripts/index-mushaf-from-pages.mjs <edition-id> <page-index.json>');
  process.exit(1);
}

const file = JSON.parse(await readFile(join(ROOT, source), 'utf8'));
/** The text the pagination is expressed against — Kufan, like the file. */
const verses = JSON.parse(await readFile(join(ROOT, 'public', 'hafs_smart_v8.json'), 'utf8'));

const problems = [];
const note = m => problems.push(m);

const firstPageNumber = file.firstPageNumber ?? 1;
const starts = file.pageStarts;
if (!Array.isArray(starts) || !starts.length) { console.error('pageStarts missing'); process.exit(1); }
if (starts.length !== file.totalPages) {
  note(`pageStarts has ${starts.length} entries but totalPages is ${file.totalPages}`);
}

// Ordinal of every (surah, ayah) in the text, so page starts can be ordered.
const idOf = new Map();
verses.forEach((v, i) => idOf.set(v.sura_no * 1000 + v.aya_no, i + 1));

const startIds = starts.map(([s, a], i) => {
  const key = idOf.get(s * 1000 + a);
  if (key === undefined) note(`page ${firstPageNumber + i} starts at ${s}:${a}, which is not an ayah`);
  return key ?? -1;
});
if (startIds[0] !== 1) note(`the first page must start at 1:1, got ${starts[0].join(':')}`);
for (let i = 1; i < startIds.length; i++) {
  if (startIds[i] <= startIds[i - 1]) {
    note(`page ${firstPageNumber + i} starts at or before the page before it`);
    break;
  }
}

const pages = [];
let covered = 0;
for (let i = 0; i < startIds.length; i++) {
  const from = startIds[i];
  const to = (startIds[i + 1] ?? verses.length + 1) - 1;
  const runs = [];
  for (let ordinal = from; ordinal <= to; ordinal++) {
    const v = verses[ordinal - 1];
    const last = runs[runs.length - 1];
    if (last && last[0] === v.sura_no && last[2] === v.aya_no - 1) last[2] = v.aya_no;
    else runs.push([v.sura_no, v.aya_no, v.aya_no]);
    covered++;
  }
  if (!runs.length) note(`page ${firstPageNumber + i} carries no ayah`);
  pages.push(runs);
}
if (covered !== verses.length) note(`${covered} ayahs across the pages, the text has ${verses.length}`);

if (problems.length) {
  console.error(`✗ ${id}: cannot index — ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 20)) console.error('  - ' + p);
  process.exit(1);
}

const dir = join(ROOT, 'sard', 'public', 'mushafs', id);
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'page-index.json'), JSON.stringify({
  id,
  firstPageNumber,
  pageCount: pages.length,
  totalAyahs: covered,
  pages,
}) + '\n');

// The manifest says what we hold. Here: a pagination and no plates.
await writeFile(join(dir, 'manifest.json'), JSON.stringify({
  id,
  pageCount: pages.length,
  firstPageNumber,
  ayahCounting: file.ayahCounting ?? 'kufi',
  /** No page images are licensed for this edition yet. */
  pages: [],
  source: file.source ?? source,
  importedAt: new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');

console.log(`${id}: ${pages.length} pages (${firstPageNumber}..${firstPageNumber + pages.length - 1}), ${covered} ayahs`);
console.log(`wrote ${join('sard/public/mushafs', id)}/{page-index,manifest}.json`);
