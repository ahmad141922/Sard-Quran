// Populates sard/public/ for the standalone Recitation tool.
//
// The tool needs a handful of files, not the board's whole public/ (~17 MB of
// tajweed PDFs and video). Listing them explicitly also documents exactly what
// the tool depends on at runtime.
//
// The folder is generated and git-ignored: public/ stays the single source.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'public');
const to = join(root, 'sard', 'public');

const ASSETS = [
  'hafs_smart_v8.json',      // the mushaf text, juz' and Madinah pagination
  'mushaf-shamarly.json',    // the Shamarly page index and mid-ayah breaks
  'fonts/HafsSmart_08.ttf',  // the Uthmani face the mushaf pane renders with
  // The tool's own mark, renamed on the way in. The board keeps its parrot at
  // public/favicon.png; this app is a muṣḥaf, and its icon says so.
  ['logos/sard-icon-192.png', 'pwa-192x192.png'],
  ['logos/sard-icon-512.png', 'pwa-512x512.png'],
  ['logos/sard-icon-maskable.png', 'pwa-maskable.png'],
  ['logos/sard-icon-512.png', 'favicon.png'],
  // The certificate's two marks. They are rasterised into the PNG the teacher
  // hands over, so they must be served from this origin — html2canvas cannot
  // read a cross-origin image back out of the canvas.
  'logos/sard-day.webp',
  'logos/tajweedoo.webp',
  'logos/sard-tool.webp',
  // The printed sheet the certificate is set on — frame, ornament, title,
  // seal and Tajweedoo's mark, all drawn once into one image.
  'cert/template.webp',
];

// Host config that must reach the deploy root, kept in sard/deploy/ because
// sard/public/ is wiped and rebuilt by this script.
const DEPLOY = ['_headers', '_redirects'];

let bytes = 0;
for (const [srcDir, list] of [[from, ASSETS], [join(root, 'sard', 'deploy'), DEPLOY]]) {
  for (const entry of list) {
    // A plain string copies to the same path; a pair renames on the way.
    const [from, rel] = Array.isArray(entry) ? entry : [entry, entry];
    const dest = join(to, rel);
    try {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(join(srcDir, from), dest);
      bytes += (await stat(dest)).size;
    } catch (err) {
      console.error(`[sard-assets] missing or unreadable: ${from}`);
      throw err;
    }
  }
}
console.log(`[sard-assets] ${ASSETS.length + DEPLOY.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB -> sard/public/`);
