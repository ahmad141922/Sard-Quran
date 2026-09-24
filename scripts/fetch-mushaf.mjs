/**
 * Imports a muṣḥaf edition's page assets from a pinned upstream source.
 *
 *   node scripts/fetch-mushaf.mjs hafs-kfqc [--from 1] [--to 604]
 *
 * Writes the pages plus a manifest.json listing exactly which pages are on
 * disk, so the app can tell a part-imported edition from a complete one
 * without any code change. Existing files are skipped, so it resumes.
 */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 8;

/** Upstream, pinned by commit-less path but documented per edition in PROVENANCE.md. */
const SOURCES = {
  'hafs-kfqc': {
    base: 'https://raw.githubusercontent.com/quranpedia/quran-svg/main/mushafs/hafs/kfqc/svg',
    pageCount: 604,
    firstPageNumber: 1,
    ext: 'svg',
    // The riwayat do not number verses alike; the validator refuses a package
    // whose plates disagree with the scheme claimed here.
    ayahCounting: 'kufi',
  },
  'warsh-kfqc': {
    base: 'https://raw.githubusercontent.com/quranpedia/quran-svg/main/mushafs/warsh/kfqc/svg',
    pageCount: 604,
    firstPageNumber: 1,
    ext: 'svg',
    ayahCounting: 'madani-first',
  },
  // Upstream spells the riwaya `qalon`; ours is `qalun`, per the registry's
  // RiwayaId. The id is ours, the path is theirs — never derive one from the
  // other.
  'qalun-kfqc': {
    base: 'https://raw.githubusercontent.com/quranpedia/quran-svg/main/mushafs/qalon/kfqc/svg',
    pageCount: 604,
    firstPageNumber: 1,
    ext: 'svg',
    // Declared only after `mushaf:index` read the total back out of these
    // plates: 6214 verses and a per-surah table identical to the Warsh muṣḥaf's,
    // which is what the Madinan count is. Not inherited from Warsh because both
    // are Nafi' — that would be an assumption, and the validator would not
    // catch it if it were wrong.
    ayahCounting: 'madani-first',
  },
  // Which Duri this is matters: ad-Duri reported from Abu Amr al-Basri and
  // from al-Kisa'i, and the two are not printed alike. The plates settle it —
  // see PROVENANCE.md — and the counting declared here is what `mushaf:index`
  // read back out of them.
  'duri-abu-amr-kfqc': {
    base: 'https://raw.githubusercontent.com/quranpedia/quran-svg/main/mushafs/douri/kfqc/svg',
    pageCount: 604,
    firstPageNumber: 1,
    ext: 'svg',
    ayahCounting: 'basri',
  },
  'shubah-kfqc': {
    base: 'https://raw.githubusercontent.com/quranpedia/quran-svg/main/mushafs/shubah/kfqc/svg',
    pageCount: 604,
    firstPageNumber: 1,
    ext: 'svg',
    ayahCounting: 'kufi',
  },
};

const id = process.argv[2];
const src = SOURCES[id];
if (!src) {
  console.error(`unknown edition "${id}". known: ${Object.keys(SOURCES).join(', ')}`);
  process.exit(1);
}
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const from = arg('--from', src.firstPageNumber);
const to = arg('--to', src.firstPageNumber + src.pageCount - 1);

const outDir = join(ROOT, 'sard', 'public', 'mushafs', id, 'pages');
await mkdir(outDir, { recursive: true });

const pad = n => String(n).padStart(3, '0');
const todo = [];
for (let p = from; p <= to; p++) todo.push(p);

let done = 0, skipped = 0, failed = [];
let bytes = 0;

async function fetchPage(page) {
  const file = join(outDir, `${pad(page)}.${src.ext}`);
  try {
    const s = await stat(file);
    if (s.size > 1024) { skipped++; bytes += s.size; return; }
  } catch { /* not there yet */ }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${src.base}/${pad(page)}.${src.ext}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length < 1024) throw new Error('suspiciously small');
      await writeFile(file, body);
      bytes += body.length;
      done++;
      return;
    } catch (err) {
      if (attempt === 3) { failed.push(page); return; }
      await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }
}

const queue = [...todo];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const page = queue.shift();
    await fetchPage(page);
    const n = done + skipped + failed.length;
    if (n % 50 === 0) process.stdout.write(`  ${n}/${todo.length}\n`);
  }
});
await Promise.all(workers);

// The manifest reflects what is genuinely on disk, not what we intended.
const present = [];
for (let p = src.firstPageNumber; p < src.firstPageNumber + src.pageCount; p++) {
  try {
    const s = await stat(join(outDir, `${pad(p)}.${src.ext}`));
    if (s.size > 1024) present.push(p);
  } catch { /* absent */ }
}
const manifestPath = join(ROOT, 'sard', 'public', 'mushafs', id, 'manifest.json');
let previous = {};
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* first run */ }
await writeFile(manifestPath, JSON.stringify({
  id,
  pageCount: src.pageCount,
  firstPageNumber: src.firstPageNumber,
  ayahCounting: src.ayahCounting,
  pages: present,
  source: src.base,
  importedAt: previous.importedAt ?? new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');

console.log(`\n${id}: downloaded ${done}, already had ${skipped}, failed ${failed.length}`);
if (failed.length) console.log('  failed pages:', failed.slice(0, 20).join(', '));
console.log(`on disk: ${present.length}/${src.pageCount} pages, ${(bytes / 1024 / 1024).toFixed(0)} MB`);
