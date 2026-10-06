// The spike page: load a model, feed it a recording or the microphone, and
// report what was heard and what it cost. `window.spike` is what
// browser-check.mjs drives; the buttons are the same calls by hand.
//
// Paths are relative so the same files work from `serve.mjs` and from the
// folder `build-preview.mjs` makes for a Cloudflare Pages preview.

import * as ort from './ort/ort.wasm.min.mjs';

import { Recognizer } from './web-asr.js';

ort.env.wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
const asked = Number(new URLSearchParams(location.search).get('threads'));
const THREADS = self.crossOriginIsolated ? asked || Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.wasm.numThreads = THREADS;

const $ = (id) => document.getElementById(id);
const log = (line) => {
  $('log').textContent += `${line}\n`;
};

let tokensText = null;
async function tokens() {
  tokensText ??= await (await fetch('./tokens.txt')).text();
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
  if (v.byteLength < 12 || v.getUint32(0, false) !== 0x52494646) return null; // "RIFF"
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

/**
 * Microphone audio to 16 kHz, whatever rate the device records at.
 *
 * Asking the AudioContext for 16 kHz works in Chrome but not everywhere
 * (Firefox refuses to connect a microphone at a different rate), so the
 * context runs at the device's rate and this averages each output sample over
 * its span of input: a box filter, enough to keep 48 kHz from folding above
 * 8 kHz into the speech band.
 */
class Downsampler {
  constructor(fromRate) {
    this.ratio = fromRate / 16000;
    this.pending = new Float32Array(0);
    this.next = 0; // position of the next output sample, in pending's samples
  }

  push(input) {
    const buf = new Float32Array(this.pending.length + input.length);
    buf.set(this.pending);
    buf.set(input, this.pending.length);
    const out = [];
    const half = this.ratio / 2;
    while (this.next + half < buf.length) {
      const from = Math.max(0, Math.floor(this.next - half));
      const to = Math.min(buf.length, Math.ceil(this.next + half));
      let sum = 0;
      for (let i = from; i < to; i++) sum += buf[i];
      out.push(sum / (to - from));
      this.next += this.ratio;
    }
    const keep = Math.max(0, Math.floor(this.next - half) - 1);
    this.pending = buf.slice(keep);
    this.next -= keep;
    return Float32Array.from(out);
  }
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
let sessionMs = 0;
let modelName = '';

const device = [
  `${THREADS} ${THREADS === 1 ? 'خيط' : 'خيوط'}`,
  self.crossOriginIsolated ? 'معزول' : 'غير معزول',
  `${navigator.hardwareConcurrency || '?'} أنوية`,
].join(' · ');
$('threads').textContent = device;

function setStep(step) {
  for (const el of document.querySelectorAll('[data-step]')) {
    el.toggleAttribute('disabled', Number(el.dataset.step) > step);
  }
}
setStep(1);

function show(heard) {
  $('heard').textContent = heard.map((h) => h.symbol).join(' ') || '…';
}

/** The box meant for a screenshot: what was heard, and what it cost. */
function report(source, r) {
  const rtf = r.rtf;
  const verdict = rtf < 0.5 ? 'ممتاز — أسرع بكثير من التلاوة'
    : rtf < 1 ? 'مقبول — أسرع من التلاوة'
      : 'بطيء — أبطأ من التلاوة';
  $('report').hidden = false;
  $('report-body').textContent = [
    `المصدر: ${source}`,
    `مدة الصوت: ${(r.audioMs / 1000).toFixed(1)} ث`,
    `زمن المعالجة: ${(r.totalMs / 1000).toFixed(1)} ث`,
    `النسبة (RTF): ${rtf.toFixed(2)} — ${verdict}`,
    `عدد الأصوات: ${r.heard.length}`,
    `تحميل النموذج: ${(sessionMs / 1000).toFixed(1)} ث (${modelName})`,
    `الجهاز: ${device}`,
    `المتصفح: ${navigator.userAgent}`,
  ].join('\n');
}

$('model-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('model-status').textContent = `جارٍ التحميل (${(file.size / 1e6).toFixed(0)} م.ب)…`;
  try {
    const built = await build(new Uint8Array(await file.arrayBuffer()));
    current = built.recognizer;
    sessionMs = built.sessionMs;
    modelName = file.name;
    $('model-status').textContent = `✓ جاهز في ${(sessionMs / 1000).toFixed(1)} ث`;
    log(`model ${file.name}: T=${current.T}, shift=${current.chunkShift}, states=${current.stateShapes.length}`);
    setStep(2);
  } catch (err) {
    $('model-status').textContent = `✗ فشل: ${err.message}`;
    log(`failed: ${err.stack ?? err.message}`);
  }
});

$('audio-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !current) return;
  $('audio-status').textContent = 'جارٍ التعرّف…';
  try {
    const samples = await decodeAny(await file.arrayBuffer());
    const r = await recognise(current, samples, show);
    show(r.heard);
    report(`ملف: ${file.name}`, r);
    $('audio-status').textContent = '✓ انتهى';
  } catch (err) {
    $('audio-status').textContent = `✗ فشل: ${err.message}`;
    log(`failed: ${err.stack ?? err.message}`);
  }
});

let mic = null;
$('mic').addEventListener('click', async () => {
  if (!current) return;
  if (mic) {
    const m = mic;
    mic = null;
    $('mic').textContent = '🎙 ابدأ التسجيل';
    await m.stop();
    return;
  }
  let media;
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    $('audio-status').textContent = `✗ لا إذن بالميكروفون: ${err.message}`;
    return;
  }
  const ctx = new AudioContext();
  const worklet = `registerProcessor('tap', class extends AudioWorkletProcessor {
    process(inputs) { if (inputs[0][0]) this.port.postMessage(inputs[0][0].slice()); return true; }
  });`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([worklet], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(ctx, 'tap');
  ctx.createMediaStreamSource(media).connect(node);
  const down = new Downsampler(ctx.sampleRate);
  const stream = current.createStream();
  const t0 = performance.now();
  let busy = Promise.resolve();
  node.port.onmessage = ({ data }) => {
    stream.acceptWaveform(down.push(data));
    busy = busy.then(() => stream.decodeAvailable()).then(() => show(stream.result()));
  };
  $('audio-status').textContent = `● يسجّل (${ctx.sampleRate} Hz)… اقرأ ثم اضغط «إيقاف»`;
  mic = {
    async stop() {
      media.getTracks().forEach((t) => t.stop());
      node.disconnect();
      await ctx.close();
      const tStop = performance.now();
      await busy;
      stream.inputFinished();
      await stream.decodeAvailable();
      const lagMs = performance.now() - tStop;
      const audioMs = stream.audioMs();
      show(stream.result());
      // Live, what matters is the inference cost per second of audio, and how
      // far behind the voice it finished.
      report('الميكروفون', {
        heard: stream.result(),
        audioMs,
        totalMs: stream.inferenceMs,
        rtf: stream.inferenceMs / audioMs,
      });
      $('audio-status').textContent = `✓ انتهى — تأخّر آخر النتيجة عن آخر الصوت ${(lagMs / 1000).toFixed(1)} ث`;
      log(`mic: ${(audioMs / 1000).toFixed(1)} s in ${((performance.now() - t0) / 1000).toFixed(1)} s wall, lag ${lagMs.toFixed(0)} ms`);
    },
  };
  $('mic').textContent = '■ إيقاف';
});
