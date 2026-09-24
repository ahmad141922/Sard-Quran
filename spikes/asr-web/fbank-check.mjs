// Compares the port's fbank features with kaldi-native-fbank's, number by
// number. The symbol comparison in compare.mjs cannot see small feature
// errors through the stand-in model; this can.
//
//   python3 fbank_ref.py recording.wav models/ref.f32
//   node fbank-check.mjs recording.wav models/ref.f32

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { Fbank } from './web-asr.js';

const sherpa = createRequire(import.meta.url)('sherpa-onnx');
const [wavPath, refPath] = process.argv.slice(2);

const wave = sherpa.readWave(wavPath);
const refBuf = readFileSync(refPath);
const ref = new Float32Array(refBuf.buffer, refBuf.byteOffset, refBuf.byteLength / 4);

const fb = new Fbank();
for (let i = 0; i < wave.samples.length; i += 1600) fb.acceptWaveform(wave.samples.subarray(i, i + 1600));
fb.inputFinished();

const frames = ref.length / 80;
// Two bars. Where there is sound, the port must agree closely. In near-silent
// bins (log energy below -10) kaldi's float32 FFT rounds at the noise floor
// and this port computes in doubles, so they drift apart by a few thousandths
// of a log unit there: precision, not a different computation.
const LOUD_TOL = 1e-3;
const QUIET_TOL = 1e-2;
let loud = 0;
let quiet = 0;
for (let f = 0; f < frames; f++) {
  for (let b = 0; b < 80; b++) {
    const r = ref[f * 80 + b];
    const d = Math.abs(fb.frames[f][b] - r);
    if (r > -10) loud = Math.max(loud, d);
    else quiet = Math.max(quiet, d);
  }
}
console.log(`frames           kaldi ${frames}, web ${fb.frames.length}`);
console.log(`max |difference| ${loud.toExponential(2)} where there is sound (bar ${LOUD_TOL}), ${quiet.toExponential(2)} near silence (bar ${QUIET_TOL})`);
const ok = frames === fb.frames.length && loud < LOUD_TOL && quiet < QUIET_TOL;
console.log(ok ? 'MATCH' : 'MISMATCH');
process.exit(ok ? 0 : 1);
