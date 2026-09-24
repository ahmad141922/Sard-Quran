/**
 * Checks a muṣḥaf package before it is trusted.
 *
 *   npm run mushaf:validate hafs-kfqc
 *
 * A package that is subtly wrong — a missing page, a truncated file, a polygon
 * naming an ayah that does not exist — fails silently in the reader, which is
 * the worst way for it to fail. So it is checked here instead.
 *
 * Each riwaya is checked against its own verse numbering. Warsh runs to 6214
 * verses where Hafs runs to 6236, so measuring one against the other would
 * condemn a sound package and, worse, pass a package of the wrong riwaya.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * With no argument: every package on disk. Adding an edition and forgetting to
 * check it is exactly the mistake this script exists to prevent, so the plain
 * `npm run mushaf:validate` covers all of them.
 */
const MUSHAF_DIR = join(ROOT, 'sard', 'public', 'mushafs');
const argId = process.argv[2];
const ids = argId
  ? [argId]
  : (await readdir(MUSHAF_DIR, { withFileTypes: true }))
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
if (!ids.length) { console.error('no packages under sard/public/mushafs'); process.exit(1); }

let failed = 0;
for (const id of ids) {
  if (ids.length > 1) console.log(`\n── ${id}`);
  if (!(await validate(id))) failed++;
}
if (failed) {
  console.error(`\n✗ ${failed} of ${ids.length} package(s) unsound`);
  process.exit(1);
}
process.exit(0);

async function validate(id) {

/**
 * Totals of the counting schemes. `kufi` is also the length of our text
 * dataset; `madani-first` is the count the King Fahd Complex prints Warsh
 * with. Kept in step with `AYAH_COUNTING` in the registry by
 * `mushaf-package.test.ts`.
 */
const COUNTING_TOTALS = { kufi: 6236, 'madani-first': 6214, basri: 6218 };

const dir = join(MUSHAF_DIR, id);
const problems = [];
const note = m => problems.push(m);

// Surah -> ayah count in the Kufan numbering, so a Hafs package can be checked
// against text data that came from somewhere else entirely.
const hafs = JSON.parse(await readFile(join(ROOT, 'public', 'hafs_smart_v8.json'), 'utf8'));
const kufiCount = new Map();
for (const v of hafs) kufiCount.set(v.sura_no, Math.max(kufiCount.get(v.sura_no) ?? 0, v.aya_no));

let manifest = null;
try { manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')); }
catch { note('manifest.json missing or unreadable'); }

let pageIndex = null;
try { pageIndex = JSON.parse(await readFile(join(dir, 'page-index.json'), 'utf8')); }
catch { note('page-index.json missing — run `npm run mushaf:index ' + id + '`'); }

try { await stat(join(dir, 'PROVENANCE.md')); }
catch { note('PROVENANCE.md missing — a commercial product must record source and licence'); }

/**
 * An edition may hold its pagination and no page images — ash-Shamarly does,
 * until licensed plates exist. There is nothing to check on disk for those but
 * the index itself, and demanding a `pages/` folder would fail a package that
 * is exactly what it claims to be.
 */
const platesExpected = manifest ? (manifest.pages?.length ?? 0) > 0 || existsSync(join(dir, 'pages')) : false;

if (manifest && !platesExpected) {
  const counting = manifest.ayahCounting;
  if (!counting) note('manifest does not say which verse numbering this pagination is in');
  const declared = COUNTING_TOTALS[counting];
  if (!pageIndex) note('page-index.json missing — nothing to check');
  else {
    if (pageIndex.pageCount !== manifest.pageCount) {
      note(`page-index covers ${pageIndex.pageCount} pages, the manifest says ${manifest.pageCount}`);
    }
    if (declared && pageIndex.totalAyahs !== declared) {
      note(`page-index counts ${pageIndex.totalAyahs} ayahs, ${counting} numbering has ${declared}`);
    }
    const seen = new Set();
    const perSurah = new Map();
    let previous = null;
    for (const runs of pageIndex.pages) {
      for (const [surah, from, to] of runs) {
        for (let ayah = from; ayah <= to; ayah++) {
          if (previous) {
            const [ps, pa] = previous;
            const ok = (surah === ps && ayah === pa + 1) || (surah === ps + 1 && ayah === 1);
            if (!ok) note(`${ps}:${pa} is followed by ${surah}:${ayah}`);
          } else if (surah !== 1 || ayah !== 1) {
            note(`the pagination starts at ${surah}:${ayah}, not 1:1`);
          }
          previous = [surah, ayah];
          seen.add(surah * 1000 + ayah);
          perSurah.set(surah, Math.max(perSurah.get(surah) ?? 0, ayah));
        }
      }
    }
    // Measured against text data that came from somewhere else entirely.
    if (counting === 'kufi') {
      for (const [surah, max] of perSurah) {
        const expected = kufiCount.get(surah);
        if (!expected) note(`surah ${surah} does not exist`);
        else if (max !== expected) note(`surah ${surah} ends at ${max}, the Kufan text has ${expected}`);
      }
    }
    console.log(`pages:            ${pageIndex.pageCount} (from ${pageIndex.firstPageNumber})`);
    console.log(`ayahs numbered:   ${seen.size}${declared ? ` (${counting}: ${declared})` : ''}`);
    console.log(`surahs reachable: ${perSurah.size}/114`);
    console.log('page images:      none — pagination only');
    if (perSurah.size !== 114) note(`only ${perSurah.size} of 114 surahs appear`);
  }
} else if (manifest) {
  const counting = manifest.ayahCounting;
  if (!counting) note('manifest does not say which verse numbering these plates are printed with');
  else if (!(counting in COUNTING_TOTALS)) note(`unknown ayah counting "${counting}"`);

  const files = (await readdir(join(dir, 'pages'))).filter(f => f.endsWith('.svg')).sort();
  const onDisk = new Set(files.map(f => Number(f.slice(0, 3))));

  for (const p of manifest.pages) {
    if (!onDisk.has(p)) note(`manifest lists page ${p} but the file is absent`);
  }
  for (const p of onDisk) {
    if (!manifest.pages.includes(p)) note(`page ${p} is on disk but missing from the manifest`);
  }

  const expected = manifest.pageCount;
  const missing = [];
  for (let p = manifest.firstPageNumber; p < manifest.firstPageNumber + expected; p++) {
    if (!onDisk.has(p)) missing.push(p);
  }
  if (missing.length) {
    note(`incomplete: ${manifest.pages.length}/${expected} pages` +
         ` — first gaps: ${missing.slice(0, 10).join(', ')}`);
  }

  const surahsSeen = new Set();
  const ayahMax = new Map();
  const seenAyahs = new Set();
  let polygons = 0;
  let duplicates = 0;
  let invalid = 0;
  let truncated = 0;

  for (const f of files) {
    const svg = await readFile(join(dir, 'pages', f), 'utf8');
    if (svg.length < 1024) { truncated++; note(`${f} is suspiciously small`); continue; }
    if (!/viewBox="[^"]+"/.test(svg)) note(`${f} has no viewBox — it cannot scale`);
    if (/<script/i.test(svg)) note(`${f} contains a <script> element`);

    // Attribute order is not guaranteed, so read the element then its attributes.
    let previous = null;
    for (const tag of svg.matchAll(/<path[^>]*class="ayahPolygon"[^>]*>/g)) {
      const surah = Number((/surah="(\d+)"/.exec(tag[0]) || [])[1]);
      const ayah = Number((/\bayah="(\d+)"/.exec(tag[0]) || [])[1]);
      if (!surah || !ayah) { invalid++; note(`${f}: an ayahPolygon lacks surah/ayah`); continue; }
      if (surah < 1 || surah > 114) { invalid++; note(`${f}: polygon names surah ${surah}`); continue; }
      polygons++;
      // One ayah may be drawn as several polygons where it wraps a line; that
      // is not a duplicate, the same ayah appearing twice over is.
      const key = surah * 1000 + ayah;
      const adjacent = previous === key;
      previous = key;
      if (!adjacent && seenAyahs.has(key)) { duplicates++; note(`${f}: ${surah}:${ayah} appears more than once`); }
      seenAyahs.add(key);
      surahsSeen.add(surah);
      ayahMax.set(surah, Math.max(ayahMax.get(surah) ?? 0, ayah));

      if (counting === 'kufi') {
        // Independent check: our text data is Kufan, so a Hafs package can be
        // measured against something that is not itself.
        const max = kufiCount.get(surah);
        if (!max) { invalid++; note(`${f}: polygon names surah ${surah}, which does not exist`); }
        else if (ayah > max) { invalid++; note(`${f}: ${surah}:${ayah} is outside that surah (1..${max})`); }
      }
    }
  }

  // Every surah must run 1..max with nothing skipped, whatever the scheme.
  let gaps = 0;
  for (const [surah, max] of ayahMax) {
    for (let a = 1; a <= max; a++) {
      if (!seenAyahs.has(surah * 1000 + a)) { gaps++; if (gaps < 6) note(`${surah}:${a} is never drawn`); }
    }
  }

  const total = seenAyahs.size;
  const declared = COUNTING_TOTALS[counting];
  if (declared && total !== declared) {
    note(`${total} ayahs drawn but ${counting} numbering has ${declared}` +
         ' — either the plates are of another riwaya or the scheme is misdeclared');
  }
  if (pageIndex) {
    if (pageIndex.pageCount !== files.length) {
      note(`page-index covers ${pageIndex.pageCount} pages, ${files.length} on disk — re-run mushaf:index`);
    }
    if (pageIndex.totalAyahs !== total) {
      note(`page-index counts ${pageIndex.totalAyahs} ayahs, the plates draw ${total} — re-run mushaf:index`);
    }
  }

  console.log(`pages on disk:    ${files.length}/${expected}`);
  console.log(`missing pages:    ${missing.length}`);
  console.log(`ayah polygons:    ${polygons}`);
  console.log(`ayahs numbered:   ${total}${declared ? ` (${counting}: ${declared})` : ''}`);
  console.log(`duplicate ayahs:  ${duplicates}`);
  console.log(`gaps in numbering:${gaps}`);
  console.log(`invalid polygons: ${invalid}`);
  console.log(`surahs reachable: ${surahsSeen.size}/114`);
  if (truncated) note(`${truncated} truncated files`);
  if (!missing.length && surahsSeen.size !== 114) {
    note(`only ${surahsSeen.size} of 114 surahs are reachable from the polygon layer`);
  }
}

if (problems.length) {
  console.error(`\n✗ ${id}: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 25)) console.error('  - ' + p);
  return false;
}
console.log(`\n✓ ${id}: package is sound`);
return true;
}
