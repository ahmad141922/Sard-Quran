// Runs the official sherpa-onnx (npm, the same C++ the Android plugin links)
// and the web port side by side on one recording, and fails on any difference
// in the recognised symbols or their times.
//
//   node compare.mjs <model.onnx> <tokens.txt> [recording.wav]
//
// With no recording, a synthetic one is written to models/synthetic.wav.
// Run it with the real zipformer_p_arabic_v3.int8.onnx and a real recitation
// before trusting the port with either.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

import * as ort from 'onnxruntime-web';

import { Recognizer } from './web-asr.js';

const require = createRequire(import.meta.url);
const sherpa = require('sherpa-onnx');

const [modelPath, tokensPath, wavArg] = process.argv.slice(2);
if (!modelPath || !tokensPath) {
  console.error('usage: node compare.mjs <model.onnx> <tokens.txt> [recording.wav]');
  process.exit(2);
}

function synthetic(path) {
  // Chirps, noise bursts and silence: enough to move a projection of fbank
  // features around, which is all the stand-in model needs.
  const sr = 16000;
  const seconds = 9.3;
  const out = new Float32Array(Math.round(sr * seconds));
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const seg = Math.floor(t / 0.7) % 4;
    const f = 150 + 2500 * ((t % 0.7) / 0.7);
    phase += (2 * Math.PI * f) / sr;
    if (seg === 0) out[i] = 0.4 * Math.sin(phase);
    else if (seg === 1) out[i] = 0.2 * rand();
    else if (seg === 2) out[i] = 0.3 * Math.sin(phase * 0.5) * Math.sin(2 * Math.PI * 3 * t);
    else out[i] = 0.002 * rand();
  }
  sherpa.writeWave(path, { samples: out, sampleRate: sr });
  return path;
}

const wavPath = wavArg ?? synthetic(new URL('./models/synthetic.wav', import.meta.url).pathname);
const wave = sherpa.readWave(wavPath);
if (wave.sampleRate !== 16000) throw new Error(`recording is ${wave.sampleRate} Hz; this check wants 16000`);
const audioSec = wave.samples.length / 16000;

// Fed in 100 ms pieces, decoding whatever is ready after each, as the plugin's
// microphone loop does - and then inputFinished with no tail padding, as it does.
const PIECE = 1600;

function runSherpa() {
  const recognizer = sherpa.createOnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      zipformer2Ctc: { model: modelPath },
      tokens: tokensPath,
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
    decodingMethod: 'greedy_search',
    enableEndpoint: 0,
  });
  const stream = recognizer.createStream();
  const t0 = performance.now();
  for (let i = 0; i < wave.samples.length; i += PIECE) {
    stream.acceptWaveform(16000, wave.samples.subarray(i, i + PIECE));
    while (recognizer.isReady(stream)) recognizer.decode(stream);
  }
  stream.inputFinished();
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const ms = performance.now() - t0;
  const r = recognizer.getResult(stream);
  stream.free();
  recognizer.free();
  // The plugin's conversion, verbatim: (seconds * 1000).toInt()
  return {
    ms,
    heard: r.tokens.map((symbol, i) => ({ symbol, atMs: Math.trunc(r.timestamps[i] * 1000) })),
  };
}

async function runWeb() {
  ort.env.wasm.numThreads = 1;
  const recognizer = await Recognizer.create(ort, readFileSync(modelPath), readFileSync(tokensPath, 'utf8'));
  const stream = recognizer.createStream();
  const t0 = performance.now();
  for (let i = 0; i < wave.samples.length; i += PIECE) {
    stream.acceptWaveform(wave.samples.subarray(i, i + PIECE));
    await stream.decodeAvailable();
  }
  stream.inputFinished();
  await stream.decodeAvailable();
  return { ms: performance.now() - t0, heard: stream.result(), chunks: stream.chunks };
}

const ref = runSherpa();
const web = await runWeb();
// For browser-check.mjs: what the page must reproduce.
writeFileSync(`${wavPath}.sherpa.json`, JSON.stringify(ref.heard));

let mismatches = 0;
const n = Math.max(ref.heard.length, web.heard.length);
for (let i = 0; i < n; i++) {
  const a = ref.heard[i];
  const b = web.heard[i];
  // 1 ms: the plugin truncates a float32 product, the port rounds.
  const same = a && b && a.symbol === b.symbol && Math.abs(a.atMs - b.atMs) <= 1;
  if (!same) {
    mismatches++;
    if (mismatches <= 10) console.log(`  #${i}: sherpa ${JSON.stringify(a)}  web ${JSON.stringify(b)}`);
  }
}

console.log(`recording        ${audioSec.toFixed(2)} s`);
console.log(`symbols          sherpa ${ref.heard.length}, web ${web.heard.length} (${web.chunks} chunks)`);
console.log(`first symbols    ${web.heard.slice(0, 12).map((h) => h.symbol).join(' ')}`);
console.log(`time (1 thread)  sherpa ${ref.ms.toFixed(0)} ms, web ${web.ms.toFixed(0)} ms`);
console.log(mismatches === 0 ? 'IDENTICAL' : `DIFFERENT in ${mismatches} places`);
process.exit(mismatches === 0 ? 0 : 1);
