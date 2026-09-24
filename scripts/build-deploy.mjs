/**
 * Assembles what Cloudflare Pages serves at sard.tajweedoo.com.
 *
 *   npm run deploy:build
 *
 * One project, one domain, three things on it:
 *
 *   /            صفحة التعريف  ← landing/, static, no build
 *   /app/        الأداة        ← dist-sard/, built with base=/app/
 *   /cert        الشهادة       ← the app again, via _redirects
 *
 * The muṣḥaf packages are **not** copied here. Five editions are 1.6 GB of
 * vector pages: that is a bucket's job, and `VITE_MUSHAF_BASE_URL` points the
 * app at it. Leaving them out is what makes a deploy seconds rather than an
 * hour, and it is checked below rather than assumed.
 *
 * `_headers` and `_redirects` are read by Pages **only at the deploy root**, so
 * they are written here, once, covering both halves — not copied from either.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-deploy');
const LANDING = join(ROOT, 'landing');
const APP = join(ROOT, 'dist-sard');

if (!existsSync(APP)) {
  console.error('dist-sard is missing — run `npm run build:sard:prod` first.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// ── the landing page at the root ──
await cp(LANDING, OUT, { recursive: true });

// ── the tool under /app, minus the plates ──
await cp(APP, join(OUT, 'app'), {
  recursive: true,
  filter: src => !src.split(/[\\/]/).includes('mushafs'),
});
// Pages reads these two only from the root; a copy under /app would be dead
// weight that also contradicts the real one.
for (const stray of ['_headers', '_redirects']) {
  await rm(join(OUT, 'app', stray), { force: true });
}

// ── /cert: ملفّ حقيقي لا قاعدة إعادة كتابة ──
//
// قشرة الأداة نفسها تُنسخ إلى `cert.html`، وPages يخدمها على `/cert` بلا
// امتداد وبلا تحويلة. جرّبنا `_redirects` أوّلًا
// فحوّلته Pages إلى تحويلة 308 نحو `/app/` — تُبقي الجزء بعد # لكنها تغيّر
// المسار، والصفحة تُعرف بمسارها، فكانت النتيجة شاشة الأداة الرئيسة بدل
// الشهادة. ثم `cert/index.html` فردّت 308 إلى `/cert/`. والملفّ المسطّح يردّ
// ٢٠٠ مباشرة: مراجع القشرة كلّها مطلقة تحت `/app/` فلا يضرّها موضعها.
const shell = await readFile(join(APP, 'index.html'), 'utf8');
await writeFile(join(OUT, 'cert.html'), shell);

await writeFile(join(OUT, '_redirects'), `# ── ما تخدمه Cloudflare Pages على sard.tajweedoo.com ──
#
# الأداة تطبيق صفحة واحدة: أي مسار داخلها يُخدَم بقشرتها.
# و/cert ملفّ حقيقي لا يحتاج قاعدة — انظر scripts/build-deploy.mjs.
/app/*     /app/index.html   200
`);

await writeFile(join(OUT, '_headers'), `# ── ترويسات Cloudflare Pages ──

# مخرجات البناء مبصومة بالمحتوى، فاسمها لا يتكرّر لمحتوى آخر.
/app/assets/*
  Cache-Control: public, max-age=31536000, immutable

# نصّ المصحف والخطّ العثماني كبيران وثابتان، والعامل يراجعهما بنفسه.
/app/hafs_smart_v8.json
  Cache-Control: public, max-age=31536000, immutable
/app/fonts/*
  Cache-Control: public, max-age=31536000, immutable
# الشعار ولوح الشهادة: أسماؤهما ثابتة ومحتواهما يتغيّر — لا بصمة في الاسم
# تُبطل القديم. وكان أسبوعًا، فلمّا استُبدل الشعار بقيت الحافّة تخدم اللوح
# القديم عشرين ساعة بعد النشر وكانت ستبقى سبعة أيّام. فساعةٌ ثم مراجعة:
# الردّ ٣٠٤ في العادة، فالكلفة ترويسة لا صورة.
/app/logos/*
  Cache-Control: public, max-age=3600, must-revalidate
/app/cert/*
  Cache-Control: public, max-age=3600, must-revalidate

# القشرة والعامل لا يُخدَمان قديمَين أبدًا، وإلّا لم يصل التحديث إلى جهاز
# ثبّت التطبيق مرّة.
/app/sw.js
  Cache-Control: no-cache
/app/index.html
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache

# صفحة التعريف: أصولها ثابتة الأسماء لكنّ محتواها يتغيّر تحتها — ورقة
# الشهادة والشعارات أُعيد رسمها أكثر من مرّة. وأسبوعٌ يعني أسبوعًا يرى فيه
# الزائرُ العائد تصميمًا قديمًا، فساعةٌ مع إعادة تحقّق: لا يُنزَّل الملفّ
# ثانيةً إن لم يتغيّر، ويصل فورًا إن تغيّر.
/assets/*
  Cache-Control: public, max-age=3600, must-revalidate

# والتنسيق اسمٌ واحد بلا بصمة، فلا يُخزَّن أصلًا.
/styles.css
  Cache-Control: no-cache

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);

// ── report, and refuse to ship a bundle that would 404 its own pages ──
async function measure(dir) {
  let files = 0, bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await measure(full);
      files += inner.files; bytes += inner.bytes;
    } else {
      files++; bytes += (await stat(full)).size;
    }
  }
  return { files, bytes };
}

const { files, bytes } = await measure(OUT);
const mb = (bytes / 1024 / 1024).toFixed(1);

const html = await readdir(join(OUT, 'app'));
if (!html.includes('index.html')) {
  console.error('\n✗ dist-deploy/app has no index.html');
  process.exit(1);
}

console.log(`dist-deploy: ${files} files, ${mb} MB`);
console.log('  /       صفحة التعريف');
console.log('  /app/   الأداة');
console.log('  /cert   الشهادة (قشرة الأداة نفسها)');
console.log('\nالمصاحف ليست هنا عمدًا — ارفعها إلى R2 وضع عنوانها في');
console.log('VITE_MUSHAF_BASE_URL قبل البناء. التفاصيل في sard/deploy/README.md');
