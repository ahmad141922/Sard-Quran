/**
 * Turns a muṣḥaf PDF into an edition's page assets.
 *
 *   node scripts/pdf-to-mushaf.mjs hafs-shamarly ../shamarly.pdf --first-printed 2 --skip 1
 *   node scripts/pdf-to-mushaf.mjs hafs-shamarly ../shamarly.pdf --probe
 *
 * Some editions publish vector pages we can vendor directly. Others exist only
 * as a printed book and a PDF of it, and ash-Shamarly is one: we hold its
 * pagination and no plates. This is how plates arrive when a licensed PDF does
 * — the pages are rendered once, named by their **printed** number, and the
 * app changes in exactly one place: `pageFormat` in the registry.
 *
 * It refuses to guess. The number of pages the PDF yields must match the page
 * count the registry declares for the edition, or nothing is written: a muṣḥaf
 * off by one page is a muṣḥaf that shows the wrong page for the rest of the
 * book.
 *
 * `--probe` reads the PDF without writing anything and reports its size, page
 * count and whether it carries an extractable text layer — which decides
 * whether an ayah-region layer can be derived or has to be drawn by hand.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [id, pdfArg] = process.argv.slice(2);
if (!id || !pdfArg) {
  console.error('usage: node scripts/pdf-to-mushaf.mjs <edition-id> <file.pdf> [options]');
  console.error('  --probe                 report on the PDF and write nothing');
  console.error('  --skip <n>              leading PDF pages that carry no Qur\'anic text');
  console.error('  --first-printed <n>     printed number of the first page kept (default 1)');
  console.error('  --pages <n>             how many pages to keep (default: to the end)');
  console.error('  --scale <n>             render scale, 1 = the PDF\'s own size (default 2)');
  console.error('  --format webp|png       output format (default webp)');
  console.error('  --quality <0..1>        webp quality (default 0.9)');
  process.exit(1);
}

const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const has = name => process.argv.includes(name);

const probe = has('--probe');
const skip = Number(flag('--skip', 0));
const firstPrinted = Number(flag('--first-printed', 1));
const scale = Number(flag('--scale', 2));
const format = flag('--format', 'webp');
const quality = Number(flag('--quality', 0.9));
const wanted = flag('--pages', null);

const pdfPath = isAbsolute(pdfArg) ? pdfArg : resolve(process.cwd(), pdfArg);

// pdf.js in Node: no worker, no eval, and the fonts it ships with.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = await import('@napi-rs/canvas');

const data = new Uint8Array(await readFile(pdfPath));
const doc = await pdfjs.getDocument({
  data,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
  // pdf.js wants a URL with a trailing slash, not a filesystem path.
  standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
}).promise;

console.log(`${pdfPath}`);
console.log(`pages in file:    ${doc.numPages}`);

if (probe) {
  const sample = Math.min(doc.numPages, 3);
  let textItems = 0;
  for (let n = 1; n <= sample; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    textItems += content.items.length;
    const vp = page.getViewport({ scale: 1 });
    console.log(`  page ${n}: ${Math.round(vp.width)}×${Math.round(vp.height)} pt, ` +
      `${content.items.length} text items`);
  }
  console.log(`\ntext layer:       ${textItems ? 'yes' : 'no — scanned images only'}`);
  console.log(textItems
    ? 'Ayah regions may be derivable from the text layer; check that the ayah\n' +
      'markers carry their numbers before relying on it.'
    : 'Ayah regions cannot be derived from this file; they will have to be drawn.');
  process.exit(0);
}

const total = wanted ? Number(wanted) : doc.numPages - skip;
if (total < 1) { console.error('nothing to render after --skip'); process.exit(1); }

// The registry is the authority on how many pages this edition has.
const registry = await readFile(join(ROOT, 'src', 'lib', 'mushaf', 'registry.ts'), 'utf8');
const entry = new RegExp(`id: '${id}'[\\s\\S]*?pageCount: (\\d+)[\\s\\S]*?firstPageNumber: (\\d+)`)
  .exec(registry);
if (!entry) {
  console.error(`"${id}" is not in MUSHAF_REGISTRY — register the edition first`);
  process.exit(1);
}
const [, declaredPages, declaredFirst] = entry.map(Number);

const problems = [];
if (total !== declaredPages) {
  problems.push(`the PDF yields ${total} pages, the registry declares ${declaredPages}`);
}
if (firstPrinted !== declaredFirst) {
  problems.push(`--first-printed is ${firstPrinted}, the registry declares ${declaredFirst}`);
}
if (problems.length) {
  console.error('\n✗ refusing to write:');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nCheck --skip and --pages against the book itself. A page out of step\n' +
    'shows the wrong page for everything after it.');
  process.exit(1);
}

const outDir = join(ROOT, 'sard', 'public', 'mushafs', id, 'pages');
await mkdir(outDir, { recursive: true });

const pad = n => String(n).padStart(3, '0');
const present = [];
let bytes = 0;

for (let i = 0; i < total; i++) {
  const printed = firstPrinted + i;
  const page = await doc.getPage(skip + i + 1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;

  const buffer = format === 'png'
    ? await canvas.encode('png')
    : await canvas.encode('webp', Math.round(quality * 100));
  const file = join(outDir, `${pad(printed)}.${format}`);
  await writeFile(file, buffer);
  present.push(printed);
  bytes += buffer.length;
  page.cleanup();
  if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${total}\n`);
}

await writeFile(join(ROOT, 'sard', 'public', 'mushafs', id, 'manifest.json'), JSON.stringify({
  id,
  pageCount: total,
  firstPageNumber: firstPrinted,
  ayahCounting: 'kufi',
  pages: present,
  source: pdfArg,
  importedAt: new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');

console.log(`\n${id}: ${present.length} pages, ${(bytes / 1024 / 1024).toFixed(0)} MB`);
console.log(`\nNow set the edition's pageFormat in src/lib/mushaf/registry.ts:`);
console.log(`    pageFormat: '${format}',   // was 'none'`);
console.log(`and record where the file came from in that package's PROVENANCE.md.`);
console.log(`Ayah tapping needs a region layer as well — see docs/add-mushaf.md.`);
