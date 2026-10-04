import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  Fbank, Recognizer, SAMPLE_RATE, NUM_BINS, parseTokens, readOnnxMetadata, stateShapes,
  type OrtLike, type OrtSession, type OrtTensor,
} from '@/lib/asr/web/recognizer';
import { Downsampler } from '@/lib/asr/web/mic';

/**
 * The browser recogniser, without the model.
 *
 * The 70 MB model is not in the tree, so what is checked here is everything
 * around it: reading its metadata, the feature frames it is fed, the state it
 * carries between chunks, and the greedy decoding of what it returns — with a
 * stand-in session that "hears" a scripted sequence. Equivalence with
 * sherpa-onnx on the real model is checked by spikes/asr-web/compare.mjs.
 */

// --- a hand-built ONNX ModelProto -------------------------------------------

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return out;
}
const enc = new TextEncoder();
function lenField(field: number, payload: number[]): number[] {
  return [...varint((field << 3) | 2), ...varint(payload.length), ...payload];
}
function entry(key: string, value: string): number[] {
  return lenField(14, [...lenField(1, [...enc.encode(key)]), ...lenField(2, [...enc.encode(value)])]);
}

const META: Record<string, string> = {
  encoder_dims: '8', query_head_dims: '2', value_head_dims: '3', num_heads: '2',
  num_encoder_layers: '1', cnn_module_kernels: '5', left_context_len: '4',
  T: '13', decode_chunk_len: '8', model_type: 'zipformer2',
};

function fakeModel(): Uint8Array {
  const bytes: number[] = [
    ...varint((1 << 3) | 0), ...varint(9),            // ir_version: varint
    ...lenField(7, new Array(300).fill(7)),           // graph: skipped by length
  ];
  for (const [k, v] of Object.entries(META)) bytes.push(...entry(k, v));
  return Uint8Array.from(bytes);
}

describe('reading the model file', () => {
  it('finds every metadata key, past a graph it never parses', () => {
    expect(readOnnxMetadata(fakeModel())).toEqual(META);
  });

  it('says so when the file is cut short, rather than guessing', () => {
    const cut = fakeModel().subarray(0, 40);
    expect(() => readOnnxMetadata(cut)).toThrow();
  });

  it('derives the state tensors sherpa-onnx would allocate', () => {
    const { shapes, T, chunkShift } = stateShapes(META);
    expect(T).toBe(13);
    expect(chunkShift).toBe(8);
    // Six per layer, then the embed cache and the processed-frames counter.
    expect(shapes.map(s => s.dims)).toEqual([
      [4, 1, 4], [1, 1, 4, 6], [4, 1, 6], [4, 1, 6], [1, 8, 2], [1, 8, 2],
      [1, 128, 3, 19], [1],
    ]);
    expect(shapes.at(-1)!.type).toBe('int64');
  });

  it('refuses a model without the keys it needs', () => {
    const { T: _, ...rest } = META;
    expect(() => stateShapes(rest)).toThrow(/«T»/);
  });
});

describe('the symbol list', () => {
  it('reads the shipped tokens.txt, with <blank> as the blank', () => {
    const tokens = parseTokens(readFileSync('sard/public/asr/tokens.txt', 'utf8'));
    expect(tokens.symbols.length).toBe(251);
    expect(tokens.blank).toBe(250);
    expect(tokens.symbols[250]).toBe('<blank>');
  });

  it('refuses a list with no blank', () => {
    expect(() => parseTokens('a 0\nb 1\n')).toThrow();
  });
});

describe('feature frames', () => {
  it('makes one frame per 10 ms, kaldi-style, once the input is finished', () => {
    const f = new Fbank();
    f.acceptWaveform(new Float32Array(SAMPLE_RATE)); // one second
    expect(f.frames.length).toBeLessThan(100);       // the last window is not whole yet
    f.inputFinished();
    expect(f.frames.length).toBe(100);
    expect(f.frames[0].length).toBe(NUM_BINS);
  });

  it('gives the same frames whether audio arrives at once or in pieces', () => {
    const tone = Float32Array.from({ length: 8000 }, (_, i) => 0.3 * Math.sin(i / 7) + 0.01 * Math.cos(i / 3));
    const whole = new Fbank();
    whole.acceptWaveform(tone);
    whole.inputFinished();
    const pieces = new Fbank();
    for (let i = 0; i < tone.length; i += 333) pieces.acceptWaveform(tone.subarray(i, i + 333));
    pieces.inputFinished();
    expect(pieces.frames.length).toBe(whole.frames.length);
    for (let t = 0; t < whole.frames.length; t++) expect(Array.from(pieces.frames[t])).toEqual(Array.from(whole.frames[t]));
  });

  it('keeps the audio for playing a moment back', () => {
    const f = new Fbank();
    f.acceptWaveform(Float32Array.of(0.1, 0.2));
    f.acceptWaveform(Float32Array.of(0.3));
    expect(Array.from(f.audio())).toEqual([0.1, 0.2, 0.3].map(Math.fround));
  });
});

describe('the microphone resampler', () => {
  it('turns 48 kHz into a third as many samples, across chunk edges', () => {
    const d = new Downsampler(48000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += d.push(new Float32Array(480)).length;
    expect(Math.abs(total - 1600)).toBeLessThanOrEqual(1);
  });

  it('keeps a steady level steady', () => {
    const d = new Downsampler(44100);
    const out = d.push(new Float32Array(4410).fill(0.5));
    expect(out.length).toBeGreaterThan(1500);
    for (const v of out) expect(v).toBeCloseTo(0.5, 6);
  });

  it('passes 16 kHz through untouched', () => {
    const d = new Downsampler(SAMPLE_RATE);
    expect(Array.from(d.push(Float32Array.of(0.25, -0.5)))).toEqual([0.25, -0.5]);
  });
});

// --- decoding, with a session that hears a script -----------------------------

class Tensor implements OrtTensor {
  constructor(readonly type: string, readonly data: Float32Array | BigInt64Array, readonly dims: readonly number[]) {}
}

/**
 * Each call to `run` returns two output frames; `script` says which symbol id
 * wins each frame, and the state it was given comes back incremented, so the
 * test can see it was carried from one chunk to the next.
 */
function scriptedOrt(script: number[], vocab: number, seenStates: number[]): OrtLike {
  let frame = 0;
  const session: OrtSession = {
    inputNames: ['x', ...Array.from({ length: 8 }, (_, i) => `s${i}`)],
    outputNames: ['log_probs', ...Array.from({ length: 8 }, (_, i) => `n${i}`)],
    async run(feeds) {
      const first = feeds.s0.data as Float32Array;
      seenStates.push(first[0]);
      const out: Record<string, OrtTensor> = {};
      const frames = 2;
      const lp = new Float32Array(frames * vocab).fill(Math.log(0.01));
      for (let t = 0; t < frames; t++) {
        const id = script[frame++] ?? vocab - 1;
        lp[t * vocab + id] = Math.log(0.9);
      }
      out.log_probs = new Tensor('float32', lp, [1, frames, vocab]);
      for (let i = 0; i < 8; i++) {
        const s = feeds[`s${i}`] as Tensor;
        const next = s.data instanceof Float32Array ? s.data.map(v => v + 1) : s.data;
        out[`n${i}`] = new Tensor(s.type, next, s.dims);
      }
      return out;
    },
  };
  return {
    InferenceSession: { create: async () => session },
    Tensor: Tensor as unknown as OrtLike['Tensor'],
  };
}

const TOKENS = 'a 0\nb 1\nc 2\n<blank> 3\n';

describe('decoding what the model returns', () => {
  async function run(script: number[], seconds: number, tailPaddingSeconds = 0) {
    const seen: number[] = [];
    const r = await Recognizer.create(scriptedOrt(script, 4, seen), fakeModel(), TOKENS, { tailPaddingSeconds });
    const s = r.createStream();
    s.acceptWaveform(new Float32Array(Math.round(seconds * SAMPLE_RATE)));
    await s.decodeAvailable();
    s.inputFinished();
    await s.decodeAvailable();
    return { heard: s.result(), seen, s };
  }

  it('collapses repeats, splits on blanks, and keeps each sound’s probability', async () => {
    // a a _ a b b c  → a a b c
    const { heard } = await run([0, 0, 3, 0, 1, 1, 2], 0.5);
    expect(heard.map(h => h.symbol)).toEqual(['a', 'a', 'b', 'c']);
    for (const h of heard) expect(h.prob).toBeCloseTo(0.9, 5);
    // Output frames are 40 ms apart: the four sounds started at frames 0, 3, 4, 6.
    expect(heard.map(h => h.atMs)).toEqual([0, 120, 160, 240]);
  });

  it('does not repeat a sound that spans two chunks', async () => {
    // chunk 1: _ a | chunk 2: a b → a b
    const { heard } = await run([3, 0, 0, 1], 0.5);
    expect(heard.map(h => h.symbol)).toEqual(['a', 'b']);
  });

  it('carries the model’s state from one chunk to the next', async () => {
    const { seen } = await run([], 0.5);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen).toEqual(seen.map((_, i) => i));
  });

  it('decodes the end of the recitation only when silence is appended', async () => {
    const bare = await run([], 0.3);
    const padded = await run([], 0.3, 0.8);
    // The window needs T frames past what was decoded; without padding the
    // last ones are never reached — the Android plugin's dropped last word.
    expect(padded.seen.length).toBeGreaterThan(bare.seen.length);
    expect(padded.s.audioMs()).toBeCloseTo(1100, 5);
  });

  it('refuses a model whose inputs do not match its own metadata', async () => {
    const ort = scriptedOrt([], 4, []);
    const session = await ort.InferenceSession.create(new Uint8Array());
    const wrong = { ...ort, InferenceSession: { create: async () => ({ ...session, inputNames: ['x'] }) } };
    await expect(Recognizer.create(wrong, fakeModel(), TOKENS)).rejects.toThrow(/inputs/);
  });
});
