/**
 * Builds the tool for production and assembles the deploy folder.
 *
 *   npm run deploy:build
 *
 * One command because the two halves must agree: the app has to be built with
 * `base=/app/` for the landing page to keep the root, and the assembler puts
 * it there. Running `build:sard` by hand and copying afterwards is how a build
 * ends up served from the wrong base with every asset 404.
 *
 * Environment it reads (all optional, all with sane defaults):
 *
 *   VITE_SARD_BASE_PATH    where the app is served      (default `/app/`)
 *   VITE_MUSHAF_BASE_URL   where the plates are served  (default: with the app)
 *
 * The muṣḥaf URL has no default on purpose beyond the local one: shipping a
 * build that silently looks for 1.6 GB of plates under its own origin is the
 * one mistake this file exists to make loud.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * What Vite will see: the .env files it reads for a production build, then the
 * shell on top. Read here too, so this script checks the same values the
 * build uses — and so a setting kept in .env is not overridden by an empty
 * one passed down from here.
 */
const fileEnv = {};
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) fileEnv[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const env = key => process.env[key] || fileEnv[key] || '';

const base = env('VITE_SARD_BASE_PATH') || '/app/';
const mushafs = env('VITE_MUSHAF_BASE_URL');

console.log(`قاعدة الأداة:   ${base}`);
console.log(`أصول المصاحف:  ${mushafs || '— (من أصل الأداة نفسها: لا ترفع هكذا)'}`);
console.log(`قاعدة البيانات: ${env('VITE_SARD_SUPABASE_URL') || '— غير مضبوطة'}\n`);

if (!mushafs) {
  console.log('⚠ VITE_MUSHAF_BASE_URL غير مضبوط. البناء سيطلب المصاحف من');
  console.log('  /app/mushafs/… وهي ليست في حزمة النشر — اضبطه بعنوان دلو R2:');
  console.log('  set VITE_MUSHAF_BASE_URL=https://mushaf.tajweedoo.com\n');
}

/*
 * Without these the build succeeds and the site half-works: reciting is fine,
 * but every screen that talks to the database — the admin page, «طلابي»,
 * uploading a finished majlis, a shared report, checking a certificate — dies
 * the moment it loads. That shipped once, from a fresh download without .env.
 */
const missing = ['VITE_SARD_SUPABASE_URL', 'VITE_SARD_SUPABASE_ANON_KEY'].filter(k => !env(k));
if (missing.length) {
  console.error(`✗ ناقص: ${missing.join('، ')}`);
  console.error('  ضعهما في ملفّ .env بجذر المستودع (انظر .env.example)، من لوحة Supabase:');
  console.error('  Project Settings ← API Keys — المفتاح anon/public، لا service_role.');
  console.error('  بدونهما تتعطّل صفحة الإدارة، و«طلابي»، ورفع المجالس، والمشاركة، والتحقّق من الشهادة.');
  process.exit(1);
}

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
  VITE_SARD_BASE_PATH: base,
  ...(mushafs ? { VITE_MUSHAF_BASE_URL: mushafs } : {}),
});
run('node', ['scripts/build-deploy.mjs']);
