/**
 * The recogniser in the browser — the same model and the same output as the
 * Android plugin (`native-engine.ts`), so everything above `AsrEngine` works
 * unchanged on any device with a browser.
 *
 * ## The model is a download the reciter agrees to
 *
 * It is about 70 MB. `needsDownload()` says so before anything is fetched; the
 * panel asks; only then does `prepare()` fetch it, once, into the Cache API.
 * After that it loads from the device, and works offline.
 *
 * ## Nothing leaves the device
 *
 * Samples go from the microphone into the recogniser and stay in memory only
 * while the reciter reviews them, for «hear this place». `discard()` drops
 * them. There is no upload anywhere in this file.
 */

import { WEB_ASR_CONFIDENCE } from '@/lib/feature-flags';
import { mushafRoot, withBase } from '@/lib/asset-url';

import type { HeardPhoneme } from './align';
import { setAsrEngine, type AsrEngine, type RecognisedAudio } from './engine';
import { startCapture, type Capture } from './web/mic';
import { Recognizer, SAMPLE_RATE, type Heard, type OrtLike, type RecognitionStream } from './web/recognizer';

/** Quran-Lab zipformer_p_arabic v3.1, INT8 — see THIRD-PARTY.md for its licence. */
export const MODEL_FILE = 'zipformer_p_arabic_v3.1.int8.onnx';
/** Its size, for the consent screen before the first byte is fetched. */
export const MODEL_BYTES = 72_705_392;

const CACHE_NAME = 'sard-asr-model-v1';

/**
 * Silence appended before the end — see `RecognizerOptions.tailPaddingSeconds`.
 * Longer than the model's window, so the last word is always decoded.
 */
const TAIL_PADDING_SECONDS = 0.8;

export function modelUrl(): string {
  const configured = import.meta.env?.VITE_ASR_MODEL_URL;
  return configured ? String(configured) : `${mushafRoot()}/asr/${MODEL_FILE}`;
}

function supported(): boolean {
  return typeof window !== 'undefined'
    && typeof WebAssembly === 'object'
    && !!window.isSecureContext
    && !!navigator.mediaDevices?.getUserMedia
    && typeof AudioWorkletNode !== 'undefined';
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** The model's bytes: from the device if there, else from the network, kept. */
async function fetchModel(onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const url = modelUrl();
  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) {
    onProgress?.(1);
    return new Uint8Array(await hit.arrayBuffer());
  }

  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok || !res.body) throw new Error(`model: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || MODEL_BYTES;
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  let parts: Uint8Array[] | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!parts && got + value.length <= out.length) out.set(value, got);
    else {
      // The server sent more than it announced: fall back to collecting.
      parts ??= [out.subarray(0, got)];
      parts.push(value);
    }
    got += value.length;
    onProgress?.(Math.min(0.99, got / total));
  }
  let bytes = out.subarray(0, got);
  if (parts) {
    bytes = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { bytes.set(p, at); at += p.length; }
  }
  await cache?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }))
    .catch(() => undefined); // a full disk loses the cache, not the session
  onProgress?.(1);
  return bytes;
}

let ortModule: Promise<OrtLike> | null = null;

/** The runtime, loaded the first time it is needed and never before. */
function loadOrt(): Promise<OrtLike> {
  // Vite emits the runtime's .wasm as a hashed asset beside this chunk and the
  // bundle finds it from its own URL — same-origin, as threads require.
  ortModule ??= import('onnxruntime-web/wasm').then(ort => {
    // Threads need cross-origin isolation (COOP/COEP in sard/deploy/_headers).
    // Without it, one thread — measured faster than real time all the same.
    ort.env.wasm.numThreads = self.crossOriginIsolated
      ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
      : 1;
    return ort as unknown as OrtLike;
  });
  return ortModule;
}

function toPhonemes(heard: Heard[]): HeardPhoneme[] {
  return heard.map(h => ({
    symbol: h.symbol,
    confidence: WEB_ASR_CONFIDENCE ? h.prob : null,
    atMs: h.atMs,
  }));
}

export function webEngine(): AsrEngine & { needsDownload(): Promise<number | null> } {
  let recognizer: Recognizer | null = null;
  let stream: RecognitionStream | null = null;
  let capture: Capture | null = null;
  /** Decoding runs behind the microphone; this is the last piece of it. */
  let busy: Promise<void> = Promise.resolve();
  /** The finished recitation's audio, kept only for «hear this place». */
  let kept: Float32Array | null = null;
  let player: AudioContext | null = null;

  const stopCapture = async () => {
    const c = capture;
    capture = null;
    await c?.stop();
  };

  return {
    async available() {
      return supported();
    },

    async needsDownload() {
      const hit = await (await openCache())?.match(modelUrl());
      return hit ? null : MODEL_BYTES;
    },

    async prepare(onProgress) {
      if (recognizer) return true;
      if (!supported()) return false;
      try {
        const [ort, model, tokens] = await Promise.all([
          loadOrt(),
          fetchModel(onProgress),
          fetch(withBase('asr/tokens.txt')).then(r => {
            if (!r.ok) throw new Error(`tokens: HTTP ${r.status}`);
            return r.text();
          }),
        ]);
        recognizer = await Recognizer.create(ort, model, tokens, { tailPaddingSeconds: TAIL_PADDING_SECONDS });
        return true;
      } catch (err) {
        console.warn('[asr] prepare failed', err);
        return false;
      }
    },

    async start() {
      if (!recognizer) return false;
      kept = null;
      const s = recognizer.createStream();
      stream = s;
      busy = Promise.resolve();
      try {
        capture = await startCapture(samples => {
          if (stream !== s) return;
          s.acceptWaveform(samples);
          // One decode at a time, in order; a failed chunk ends nothing.
          busy = busy.then(() => s.decodeAvailable()).catch(() => undefined);
        });
        return true;
      } catch (err) {
        console.warn('[asr] microphone failed', err);
        stream = null;
        return false;
      }
    },

    async stop(): Promise<RecognisedAudio | null> {
      const s = stream;
      if (!s) return null;
      await stopCapture();
      await busy;
      s.inputFinished();
      await s.decodeAvailable();
      stream = null;
      // The padding is not the reciter's: keep only what they said.
      const durationMs = s.audioMs() - TAIL_PADDING_SECONDS * 1000;
      kept = s.fbank.audio().slice(0, Math.round((durationMs / 1000) * SAMPLE_RATE));
      return { phonemes: toPhonemes(s.result()), durationMs, canPlay: true };
    },

    cancel() {
      stream = null;
      void stopCapture();
    },

    async partial() {
      return stream ? toPhonemes(stream.result()) : null;
    },

    play(atMs: number) {
      if (!kept) return;
      // From a little before the place, so the reciter hears it arrive.
      const from = Math.max(0, Math.round(((atMs - 600) / 1000) * SAMPLE_RATE));
      const to = Math.min(kept.length, from + 4 * SAMPLE_RATE);
      if (to <= from) return;
      void player?.close().catch(() => undefined);
      const ctx = new AudioContext();
      player = ctx;
      const buf = ctx.createBuffer(1, to - from, SAMPLE_RATE);
      buf.copyToChannel(kept.slice(from, to), 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => { void ctx.close().catch(() => undefined); };
      src.start();
    },

    discard() {
      kept = null;
      void player?.close().catch(() => undefined);
      player = null;
    },
  };
}

/** Installed at boot outside the native shells — see `sard/src/main.tsx`. */
export function installWebAsr(): void {
  if (supported()) setAsrEngine(webEngine());
}
