// Builds `preview/`: the spike page as a folder Cloudflare Pages can publish,
// for trying it on a phone (the microphone and threads both need https).
//
//   node build-preview.mjs
//   npx wrangler pages deploy spikes/asr-web/preview --project-name=sard-tajweedoo --branch=test-asr
//
// A non-production branch gives a preview address and leaves the live site
// alone. The model is not included - Pages refuses files over 25 MiB - so the
// page asks for it from the phone's storage.

import { copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = join(here, 'preview');
const ortDist = join(here, 'node_modules/onnxruntime-web/dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'ort'), { recursive: true });

const files = [
  [join(here, 'index.html'), 'index.html'],
  [join(here, 'app.js'), 'app.js'],
  [join(here, 'web-asr.js'), 'web-asr.js'],
  [join(here, '../../sard/public/asr/tokens.txt'), 'tokens.txt'],
  // The wasm-only bundle, and the one runtime it loads.
  [join(ortDist, 'ort.wasm.min.mjs'), 'ort/ort.wasm.min.mjs'],
  [join(ortDist, 'ort-wasm-simd-threaded.mjs'), 'ort/ort-wasm-simd-threaded.mjs'],
  [join(ortDist, 'ort-wasm-simd-threaded.wasm'), 'ort/ort-wasm-simd-threaded.wasm'],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));

// Cross-origin isolation, for threads: the same two headers serve.mjs sends.
writeFileSync(join(out, '_headers'), `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Robots-Tag: noindex
`);

const LIMIT = 25 * 1024 * 1024;
for (const [, to] of files) {
  const { size } = statSync(join(out, to));
  if (size > LIMIT) throw new Error(`${to} is ${(size / 1e6).toFixed(1)} MB; Pages takes at most 25 MiB`);
  console.log(`${(size / 1e6).toFixed(2).padStart(7)} MB  ${to}`);
}
console.log(`\n${out}`);
