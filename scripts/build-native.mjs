/**
 * Builds the tool for a native shell and syncs it into `android/` or `ios/`.
 *
 *   npm run android:build      ==  node scripts/build-native.mjs android
 *   npm run ios:build          ==  node scripts/build-native.mjs ios
 *
 * One script and one output folder for both platforms, because there is one
 * build: nothing below is a decision about Android or about iOS, it is the
 * shape the tool takes whenever it is served from inside a device rather than
 * from sard.tajweedoo.com. Three settings have to agree, which is why this is
 * a script rather than a chain of flags someone runs by hand:
 *
 *   base `/`               the shell serves the app from the root of its own
 *                          WebView. `/app/` is a fact about the landing page
 *                          owning sard.tajweedoo.com, and means nothing here.
 *   VITE_MUSHAF_BASE_URL   a bundle cannot carry 1.5 GB of plates, so the
 *                          bucket is not optional on a device — with the app's
 *                          own origin serving no `/mushafs/`, every page 404s.
 *   VITE_SARD_NATIVE=1     drops the service worker. Capacitor already serves
 *                          the bundle from local storage; a worker cached on
 *                          top of it only adds a second opinion about when an
 *                          update appears.
 *
 * Then `dist-sard/` is copied to `dist-native/` without the plates — the same
 * cut `scripts/build-deploy.mjs` makes for Pages — and `cap sync` carries it
 * into the native project.
 *
 * On Windows the iOS half of `cap sync` copies the bundle and writes the
 * config, then says it is skipping `pod install` because CocoaPods is not
 * there. That is expected and not a failure: the pods are a Mac step, and
 * `docs/ios.md` says where the rest of them are.
 */
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'dist-sard');
const OUT = join(ROOT, 'dist-native');
// The one folder that must not travel: 1.5 GB of muṣḥaf plates, whose place is
// the R2 bucket. See the header, and `docs/android.md`.
const PLATES = 'mushafs';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  console.error('استعمل: node scripts/build-native.mjs <android|ios>');
  process.exit(1);
}

// The live bucket is the default rather than an error: unlike the web build,
// there is no arrangement in which the plates ship with the app, so there is
// nothing to choose. Override it to test against another bucket.
const mushafs = process.env.VITE_MUSHAF_BASE_URL || 'https://mushaf.tajweedoo.com';

console.log(`المنصّة:        ${platform}`);
console.log(`أصول المصاحف:  ${mushafs}`);
console.log('قاعدة الأداة:   /  (جذر العارض في التطبيق)\n');

const run = (cmd, args, env) => {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npm', ['run', 'build:sard'], {
  VITE_SARD_BASE_PATH: '/',
  VITE_MUSHAF_BASE_URL: mushafs,
  VITE_SARD_NATIVE: '1',
});

if (!existsSync(APP)) {
  console.error('dist-sard غير موجود بعد البناء — توقّف.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// Entry by entry, skipping the plates — and **not** by handing `cp` a filter,
// which is how this was written and is no longer enough: on Node 24 a filter
// that returns false for a directory no longer prunes it, the walk goes on
// into the children, and the whole 1.5 GB lands in the output. It did here.
// So nothing under `mushafs/` is ever named as a source, and the only cost is
// that the skip is top-level — which is where Vite puts the folder, because it
// copies `sard/public/` verbatim.
for (const entry of await readdir(APP)) {
  if (entry === PLATES) continue;
  await cp(join(APP, entry), join(OUT, entry), { recursive: true });
}
// Pages reads these at its own root; inside a bundle they are dead weight.
for (const stray of ['_headers', '_redirects']) {
  await rm(join(OUT, stray), { force: true });
}

// The check the docs ask for, made by the script instead of by eye: a bundle
// with the plates in it is 1.5 GB, which no store takes and no phone wants.
if (existsSync(join(OUT, PLATES))) {
  console.error('المصاحف داخل dist-native — الترشيح فشل. لا تُبنَ حزمة قبل إصلاحه.');
  process.exit(1);
}

// `sync` rather than `copy`: it also installs the plugins each `npm i` may have
// added or dropped, so the native project never drifts from package.json.
run('npx', ['cap', 'sync', platform]);

const opener = platform === 'android' ? 'npm run android:open' : 'npm run ios:open';
console.log(`\n✓ dist-native جاهز ومزامَن مع ${platform}. افتح المشروع بـ ${opener}`);
