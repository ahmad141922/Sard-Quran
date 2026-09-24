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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const base = process.env.VITE_SARD_BASE_PATH ?? '/app/';
const mushafs = process.env.VITE_MUSHAF_BASE_URL ?? '';

console.log(`قاعدة الأداة:   ${base}`);
console.log(`أصول المصاحف:  ${mushafs || '— (من أصل الأداة نفسها: لا ترفع هكذا)'}\n`);

if (!mushafs) {
  console.log('⚠ VITE_MUSHAF_BASE_URL غير مضبوط. البناء سيطلب المصاحف من');
  console.log('  /app/mushafs/… وهي ليست في حزمة النشر — اضبطه بعنوان دلو R2:');
  console.log('  set VITE_MUSHAF_BASE_URL=https://mushaf.tajweedoo.com\n');
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
  VITE_MUSHAF_BASE_URL: mushafs,
});
run('node', ['scripts/build-deploy.mjs']);
