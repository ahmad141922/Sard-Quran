// Drives the spike page in headless Chromium:
//   1. the stand-in model on the synthetic recording must reproduce, symbol
//      for symbol, what official sherpa-onnx produced (compare.mjs saves it);
//   2. the ~65M int8 weight proxy is timed per 320 ms chunk, unthrottled and
//      with the CPU slowed 4x as a rough stand-in for a mid-range phone.
//
//   node compare.mjs models/fake-zipformer2-ctc.onnx ../../sard/public/asr/tokens.txt
//   node browser-check.mjs
//
// Playwright is not a dependency of the spike; set PLAYWRIGHT_MODULE to its
// path if it is not installed globally.

import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_MODULE ?? join(execSync('npm root -g').toString().trim(), 'playwright'));

const PORT = 8097;
const server = spawn(process.execPath, ['serve.mjs', String(PORT)], { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));

const browser = await pw.chromium.launch();
let failed = false;
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text()); });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.spike);
  const env = await page.evaluate(() => ({ threads: window.spike.threads, isolated: window.spike.isolated, ua: navigator.userAgent }));
  console.log(`browser          ${env.ua.match(/(Headless)?Chrome\/[\d.]+/)[0]}, ${env.threads} threads, isolated=${env.isolated}, host cores=${cpus().length}`);

  // 1. Same symbols as sherpa-onnx. Model and recording are paths under this
  //    directory; compare.mjs must have been run on the same pair first.
  const [modelArg = 'models/fake-zipformer2-ctc.onnx', wavArg = 'models/synthetic.wav'] = process.argv.slice(2);
  const expected = JSON.parse(readFileSync(new URL(`./${wavArg}.sherpa.json`, import.meta.url)));
  const r = await page.evaluate(([m, w]) => window.spike.transcribeUrl(`/${m}`, `/${w}`), [modelArg, wavArg]);
  let diff = 0;
  for (let i = 0; i < Math.max(expected.length, r.heard.length); i++) {
    const a = expected[i];
    const b = r.heard[i];
    if (!(a && b && a.symbol === b.symbol && Math.abs(a.atMs - b.atMs) <= 1)) diff++;
  }
  console.log(`${modelArg}: ${r.heard.length}/${expected.length} symbols, ${diff === 0 ? 'IDENTICAL to sherpa-onnx' : `DIFFERENT in ${diff}`}`);
  console.log(`  ${(r.audioMs / 1000).toFixed(1)} s of audio: fetch ${r.loadMs.toFixed(0)} ms, session ${r.sessionMs.toFixed(0)} ms, recognition ${r.totalMs.toFixed(0)} ms (RTF ${r.rtf.toFixed(3)})`);
  failed ||= diff !== 0;

  // 1b. The same recognition, slowed: every thread, then one.
  if (process.argv[2]) {
    const cdp = await page.context().newCDPSession(page);
    for (const query of ['', '?threads=1']) {
      await page.goto(`http://localhost:${PORT}/${query}`);
      await page.waitForFunction(() => window.spike);
      for (const slow of [1, 4]) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
        const t = await page.evaluate(([m, w]) => window.spike.transcribeUrl(`/${m}`, `/${w}`), [modelArg, wavArg]);
        console.log(`  ${query ? '1 thread ' : 'threads  '} cpu/${slow}: recognition ${t.totalMs.toFixed(0)} ms (RTF ${t.rtf.toFixed(3)}), session ${t.sessionMs.toFixed(0)} ms`);
      }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => window.spike);
  }

  // 2. Cost of the weight: every thread, then one (a site without COOP/COEP)
  for (const query of ['', '?threads=1']) {
    if (query) {
      await page.goto(`http://localhost:${PORT}/${query}`);
      await page.waitForFunction(() => window.spike);
      console.log('--- one thread');
    }
    const cdp = await page.context().newCDPSession(page);
    for (const slow of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
      for (const frames of [8, 16]) {
        const b = await page.evaluate(([f]) => window.spike.benchProxy('/models/proxy-65m-int8.onnx', f, 10), [frames]);
        console.log(`proxy cpu/${slow} ${String(frames).padStart(2)} fr  load ${b.loadMs.toFixed(0)} ms, session ${b.sessionMs.toFixed(0)} ms, ${b.perChunkMs.toFixed(1)} ms per 320 ms chunk -> RTF ${b.rtf.toFixed(3)}`);
      }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
