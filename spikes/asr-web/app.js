// The spike page: load a model, feed it a recording or the microphone, and
// report what was heard and what it cost. `window.spike` is what
// browser-check.mjs drives; the buttons are the same calls by hand.

import * as ort from '/ort/ort.wasm.min.mjs';

import { Recognizer } from './web-asr.js';

ort.env.wasm.wasmPaths = '/ort/';
const asked = Number(new URLSearchParams(location.search).get('threads'));
const THREADS = self.crossOriginIsolated ? asked || Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.wasm.numThreads = THREADS;

const $ = (id) => document.getElementById(id);
const log = (line) => {
  $('log').textContent += `${line}\n`;
};

let tokensText = null;
async function tokens() {
  tokensText ??= await (await fetch('/tokens.txt')).text();
  return tokensText;
}

/**
 * Model bytes from a URL, through the Cache API so the 69 MB arrive once.
 * The real app would ask first - see SardAsrPlugin.prepare - and so does the
 * button on this page.
 */
async function modelBytes(url) {
  let cache = null;
  try { cache = await caches.open('sard-asr-spike'); } catch { /* no Cache API */ }
  let res = cache ? await cache.match(url) : undefined;
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    if (cache) await cache.put(url, res.clone());
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** 16 kHz mono PCM16 WAV read exactly, so the samples match sherpa's readWave. */
function parseWav(buf) {
  const v = new DataView(buf);
  let p = 12;
  let fmt = null;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
    const len = v.getUint32(p + 4, true);
    if (id === 'fmt ') fmt = { channels: v.getUint16(p + 10, true), rate: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
    if (id === 'data' && fmt?.channels === 1 && fmt.rate === 16000 && fmt.bits === 16) {
      const out = new Float32Array(len / 2);
      for (let i = 0; i < out.length; i++) out[i] = v.getInt16(p + 8 + i * 2, true) / 32768;
      return out;
    }
    p += 8 + len + (len & 1);
  }
  return null;
}

/** Anything else the browser can decode, resampled to 16 kHz mono. */
async function decodeAny(buf) {
  const exact = parseWav(buf.slice(0));
  if (exact) return exact;
  const probe = new AudioContext();
  const decoded = await probe.decodeAudioData(buf);
  await probe.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

async function recognise(recognizer, samples, onPartial) {
  const stream = recognizer.createStream();
  const t0 = performance.now();
  for (let i = 0; i < samples.length; i += 1600) {
    stream.acceptWaveform(samples.subarray(i, i + 1600));
    await stream.decodeAvailable();
    onPartial?.(stream.result());
  }
  stream.inputFinished();
  await stream.decodeAvailable();
  const totalMs = performance.now() - t0;
  return {
    heard: stream.result(),
    audioMs: stream.audioMs(),
    totalMs,
    inferenceMs: stream.inferenceMs,
    chunks: stream.chunks,
    rtf: totalMs / stream.audioMs(),
  };
}

async function build(bytes) {
  const t0 = performance.now();
  const r = await Recognizer.create(ort, bytes, await tokens());
  return { recognizer: r, sessionMs: performance.now() - t0 };
}

window.spike = {
  threads: THREADS,
  isolated: self.crossOriginIsolated,

  async transcribeUrl(modelUrl, wavUrl) {
    const t0 = performance.now();
    const bytes = await modelBytes(modelUrl);
    const loadMs = performance.now() - t0;
    const { recognizer, sessionMs } = await build(bytes);
    const samples = await decodeAny(await (await fetch(wavUrl)).arrayBuffer());
    return { loadMs, sessionMs, ...(await recognise(recognizer, samples)) };
  },

  /**
   * The weight proxy: one call per 320 ms chunk of audio, `frames` rows of
   * 2048 through ~65M int8 parameters. Not the real model - see make_models.py.
   */
  async benchProxy(url, frames, chunks) {
    const t0 = performance.now();
    const bytes = await modelBytes(url);
    const loadMs = performance.now() - t0;
    const t1 = performance.now();
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const sessionMs = performance.now() - t1;
    const x = new ort.Tensor('float32', new Float32Array(frames * 2048).map(() => Math.random() - 0.5), [1, frames, 2048]);
    await session.run({ x }); // warm-up
    const t2 = performance.now();
    for (let i = 0; i < chunks; i++) await session.run({ x });
    const perChunkMs = (performance.now() - t2) / chunks;
    return { loadMs, sessionMs, perChunkMs, rtf: perChunkMs / 320 };
  },
};

// ---------------------------------------------------------------------------
// By hand
// ---------------------------------------------------------------------------

let current = null;

$('threads').textContent = `${THREADS} (${self.crossOriginIsolated ? 'isolated' : 'not isolated: one thread'})`;

$('model-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  log(`loading ${file.name} (${(file.size / 1e6).toFixed(1)} MB)...`);
  try {
    const { recognizer, sessionMs } = await build(new Uint8Array(await file.arrayBuffer()));
    current = recognizer;
    log(`ready in ${sessionMs.toFixed(0)} ms. T=${recognizer.T}, shift=${recognizer.chunkShift}, states=${recognizer.stateShapes.length}`);
  } catch (err) {
    log(`failed: ${err.message}`);
  }
});

function show(result) {
  $('heard').textContent = result.heard.map((h) => h.symbol).join(' ');
}

$('audio-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !current) return log('load a model first');
  const samples = await decodeAny(await file.arrayBuffer());
  const r = await recognise(current, samples, (heard) => show({ heard }));
  show(r);
  log(`${(r.audioMs / 1000).toFixed(1)} s of audio in ${r.totalMs.toFixed(0)} ms (RTF ${r.rtf.toFixed(3)}), ${r.heard.length} symbols`);
});

let mic = null;
$('mic').addEventListener('click', async () => {
  if (!current) return log('load a model first');
  if (mic) {
    mic.stop();
    mic = null;
    $('mic').textContent = 'تسجيل من الميكروفون';
    return;
  }
  const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const worklet = `registerProcessor('tap', class extends AudioWorkletProcessor {
    process(inputs) { if (inputs[0][0]) this.port.postMessage(inputs[0][0].slice()); return true; }
  });`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([worklet], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(ctx, 'tap');
  ctx.createMediaStreamSource(media).connect(node);
  const stream = current.createStream();
  let busy = Promise.resolve();
  node.port.onmessage = ({ data }) => {
    stream.acceptWaveform(data);
    busy = busy.then(() => stream.decodeAvailable()).then(() => show({ heard: stream.result() }));
  };
  mic = {
    async stop() {
      media.getTracks().forEach((t) => t.stop());
      node.disconnect();
      await ctx.close();
      await busy;
      stream.inputFinished();
      await stream.decodeAvailable();
      show({ heard: stream.result() });
      log(`mic: ${(stream.audioMs() / 1000).toFixed(1)} s, inference ${stream.inferenceMs.toFixed(0)} ms (RTF ${(stream.inferenceMs / stream.audioMs()).toFixed(3)})`);
    },
  };
  $('mic').textContent = 'إيقاف';
});
