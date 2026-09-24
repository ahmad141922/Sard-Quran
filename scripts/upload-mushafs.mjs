/**
 * Uploads the muṣḥaf packages to an R2 bucket.
 *
 *   npm run mushaf:upload -- --dry-run     # يطبع الخطّة ولا يرفع شيئًا
 *   npm run mushaf:upload
 *
 * 3038 vector pages are not a job for `wrangler r2 object put`, which uploads
 * one object per process, nor for dragging a folder into a dashboard. R2
 * speaks the S3 API, so this walks the packages once and puts them with a
 * handful of parallel requests.
 *
 * Credentials come from the environment and are never written anywhere:
 *
 *   R2_ACCOUNT_ID          من عنوان لوحة Cloudflare
 *   R2_ACCESS_KEY_ID       من R2 → Manage API tokens
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET              (اختياري، الافتراضي sard)
 *
 * The keys mirror the folder exactly — `hafs-kfqc/pages/001.svg` — because
 * that is what `VITE_MUSHAF_BASE_URL` + the edition id resolve to at runtime.
 * Change one and the other stops matching.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'sard', 'public', 'mushafs');

const dryRun = process.argv.includes('--dry-run');
const only = (() => {
  const i = process.argv.indexOf('--edition');
  return i > -1 ? process.argv[i + 1] : null;
})();

const TYPES = {
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const files = [];
let bytes = 0;
for await (const file of walk(SOURCE)) {
  const key = relative(SOURCE, file).split(/[\\/]/).join('/');
  if (only && !key.startsWith(`${only}/`)) continue;
  files.push({ file, key });
  bytes += (await stat(file)).size;
}

const editions = [...new Set(files.map(f => f.key.split('/')[0]))];
console.log(`الطبعات: ${editions.join(' · ')}`);
console.log(`الملفّات: ${files.length}، الحجم: ${(bytes / 1024 / 1024).toFixed(0)} م.ب`);
console.log(`أمثلة على المفاتيح:\n  ${files.slice(0, 2).map(f => f.key).join('\n  ')}`);
console.log(`  …\n  ${files[files.length - 1]?.key}`);

if (dryRun) {
  console.log('\n(تجربة جافّة — لم يُرفع شيء)');
  process.exit(0);
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const bucket = process.env.R2_BUCKET ?? 'sard';
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('\n✗ ينقص أحد المتغيّرات: R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// The pages never change once published, so they are cached for a year. The
// manifest and the page index are small and might be re-indexed, so an hour.
const cacheFor = key => (key.includes('/pages/')
  ? 'public, max-age=31536000, immutable'
  : 'public, max-age=3600');

let done = 0, failed = 0;
const CONCURRENCY = 12;
const queue = [...files];

async function worker() {
  for (;;) {
    const next = queue.shift();
    if (!next) return;
    const ext = next.key.slice(next.key.lastIndexOf('.'));
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: next.key,
        Body: await readFile(next.file),
        ContentType: TYPES[ext] ?? 'application/octet-stream',
        CacheControl: cacheFor(next.key),
      }));
      done++;
      if (done % 100 === 0) process.stdout.write(`  ${done}/${files.length}\n`);
    } catch (err) {
      failed++;
      if (failed < 6) console.error(`  ✗ ${next.key}: ${err.message}`);
    }
  }
}

console.log(`\nالرفع إلى ${bucket} …`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nتمّ: ${done}/${files.length}${failed ? `، فشل ${failed}` : ''}`);
if (failed) {
  console.error('أعد تشغيل الأمر — الرفع يعيد الكتابة فوق ما رُفع بلا ضرر.');
  process.exit(1);
}
console.log('تحقّق: افتح https://<نطاق الدلو>/hafs-kfqc/manifest.json في المتصفّح.');
