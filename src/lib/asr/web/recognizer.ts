/**
 * The recitation recogniser in the browser: kaldi fbank features, the
 * streaming Zipformer2 CTC loop and greedy CTC search, on onnxruntime-web.
 *
 * A port of exactly the three pieces of sherpa-onnx the Android plugin uses,
 * proven output-identical to it in `spikes/asr-web/` (`compare.mjs`,
 * `fbank-check.mjs`, `browser-check.mjs`). Every behaviour below is sherpa's
 * and names the file it comes from; the one deliberate difference, tail
 * padding, is an option.
 *
 * Nothing here knows about the microphone, the network or the interface: it
 * takes samples and gives back sounds. `web-engine.ts` is the part that does.
 * `ort` is passed in, not imported, so the tests can run it under Node and the
 * app can load the runtime lazily.
 */

// ---------------------------------------------------------------------------
// Model metadata
// ---------------------------------------------------------------------------

/**
 * Reads `metadata_props` from an ONNX file.
 *
 * sherpa-onnx takes the state shapes from these keys, and onnxruntime-web does
 * not expose them, so the ModelProto is walked directly. Only the top level is
 * read; the graph (field 7) is skipped by its length.
 */
export function readOnnxMetadata(bytes: Uint8Array): Record<string, string> {
  const text = new TextDecoder();
  let pos = 0;

  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[pos++];
      if (b === undefined) throw new Error('ONNX: truncated');
      result += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return result;
      shift += 7;
    }
  };

  /*
   * Lengths are read into a constant before being added: `pos += varint()`
   * reads `pos` *before* varint() advances it, and lands one byte short. That
   * bug passed on a 0.1 MB stand-in model and failed on the real one.
   */
  const skip = (wire: number) => {
    if (wire === 0) varint();
    else if (wire === 1) pos += 8;
    else if (wire === 2) {
      const size = varint();
      pos += size;
    } else if (wire === 5) pos += 4;
    else throw new Error(`ONNX: unsupported wire type ${wire}`);
  };

  const meta: Record<string, string> = {};
  while (pos < bytes.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 14 && wire === 2) {
      const size = varint();
      const end = pos + size;
      let key = '';
      let value = '';
      while (pos < end) {
        const t = varint();
        const len = varint();
        const s = text.decode(bytes.subarray(pos, pos + len));
        pos += len;
        if (t >>> 3 === 1) key = s;
        else if (t >>> 3 === 2) value = s;
      }
      meta[key] = value;
    } else {
      skip(wire);
    }
  }
  // A download cut short skips "past" the end rather than reading it; say so
  // here, not later as a confusing «metadata lacks …».
  if (pos > bytes.length) throw new Error('ONNX: truncated');
  return meta;
}

// ---------------------------------------------------------------------------
// Features: kaldi fbank, as sherpa-onnx configures it
// ---------------------------------------------------------------------------

/*
 * sherpa-onnx/csrc/features.h defaults, which the Android plugin keeps (it
 * sets only the sample rate and the 80 bins): dither 0, snip_edges false,
 * 25 ms frames every 10 ms, DC removal, pre-emphasis 0.97, povey window,
 * 20 Hz to 7600 Hz, samples in -1..1; kaldi-native-fbank's power spectrum,
 * 512-point FFT and log floor at FLT_EPSILON.
 *
 * Computed in float32 storage, as kaldi does. In doubles the features differ
 * by a few 1e-4, which is enough to flip a frame the model is undecided about.
 */
export const SAMPLE_RATE = 16000;
const FRAME_LEN = 400;
const FRAME_SHIFT = 160;
const FFT_SIZE = 512;
export const NUM_BINS = 80;
const PREEMPH = 0.97;
const FLT_EPSILON = 1.1920928955078125e-7;

const melScale = (hz: number) => 1127 * Math.log(1 + hz / 700);

function povey(): Float32Array {
  const w = new Float32Array(FRAME_LEN);
  const a = (2 * Math.PI) / (FRAME_LEN - 1);
  for (let i = 0; i < FRAME_LEN; i++) w[i] = Math.pow(0.5 - 0.5 * Math.cos(a * i), 0.85);
  return w;
}

interface MelBank { first: number; weights: Float32Array }

/** Triangular mel filters over FFT bins 0..255, as kaldi's MelBanks builds them. */
function melBanks(): MelBank[] {
  const numFftBins = FFT_SIZE / 2;
  const binWidth = SAMPLE_RATE / FFT_SIZE;
  const low = melScale(20);
  const high = melScale(SAMPLE_RATE / 2 - 400);
  const delta = (high - low) / (NUM_BINS + 1);
  const banks: MelBank[] = [];
  for (let b = 0; b < NUM_BINS; b++) {
    const left = low + b * delta;
    const center = left + delta;
    const right = center + delta;
    let first = -1;
    const weights: number[] = [];
    for (let i = 0; i < numFftBins; i++) {
      const mel = melScale(binWidth * i);
      if (mel > left && mel < right) {
        if (first < 0) first = i;
        weights.push(mel <= center ? (mel - left) / (center - left) : (right - mel) / (right - center));
      }
    }
    banks.push({ first, weights: Float32Array.from(weights) });
  }
  return banks;
}

/** In-place radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const WINDOW = povey();
const BANKS = melBanks();

export class Fbank {
  private samples = new Float32Array(SAMPLE_RATE * 60);
  numSamples = 0;
  private finished = false;
  /** Computed frames, 80 floats each. */
  readonly frames: Float32Array[] = [];
  private re = new Float32Array(FFT_SIZE);
  private im = new Float32Array(FFT_SIZE);
  private frame = new Float32Array(FRAME_LEN);

  acceptWaveform(chunk: Float32Array) {
    if (this.numSamples + chunk.length > this.samples.length) {
      const grown = new Float32Array(Math.max(this.samples.length * 2, this.numSamples + chunk.length));
      grown.set(this.samples.subarray(0, this.numSamples));
      this.samples = grown;
    }
    this.samples.set(chunk, this.numSamples);
    this.numSamples += chunk.length;
    this.compute();
  }

  inputFinished() {
    this.finished = true;
    this.compute();
  }

  /** The audio taken in so far, for playing a moment back. */
  audio(): Float32Array {
    return this.samples.subarray(0, this.numSamples);
  }

  /** kaldi NumFrames with snip_edges = false. */
  private numFramesAvailable(): number {
    const n = this.numSamples;
    let frames = Math.floor((n + FRAME_SHIFT / 2) / FRAME_SHIFT);
    if (this.finished) return frames;
    let end = (frames - 1) * FRAME_SHIFT + FRAME_SHIFT / 2 - FRAME_LEN / 2 + FRAME_LEN;
    while (frames > 0 && end > n) {
      frames--;
      end -= FRAME_SHIFT;
    }
    return frames;
  }

  private compute() {
    const target = this.numFramesAvailable();
    for (let f = this.frames.length; f < target; f++) this.frames.push(this.computeFrame(f));
  }

  private computeFrame(f: number): Float32Array {
    const n = this.numSamples;
    const start = f * FRAME_SHIFT + FRAME_SHIFT / 2 - FRAME_LEN / 2;
    const w = this.frame;
    let mean = 0;
    for (let i = 0; i < FRAME_LEN; i++) {
      let s = start + i;
      // kaldi ExtractWindow: reflect at both edges.
      while (s < 0 || s >= n) s = s < 0 ? -s - 1 : 2 * n - 1 - s;
      w[i] = this.samples[s];
      mean += w[i];
    }
    mean = Math.fround(mean / FRAME_LEN);
    for (let i = 0; i < FRAME_LEN; i++) w[i] -= mean;
    for (let i = FRAME_LEN - 1; i > 0; i--) w[i] -= PREEMPH * w[i - 1];
    w[0] -= PREEMPH * w[0];

    const { re, im } = this;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME_LEN; i++) re[i] = w[i] * WINDOW[i];
    fft(re, im);

    const out = new Float32Array(NUM_BINS);
    for (let b = 0; b < NUM_BINS; b++) {
      const { first, weights } = BANKS[b];
      let e = 0;
      for (let k = 0; k < weights.length; k++) {
        const i = first + k;
        e = Math.fround(e + weights[k] * Math.fround(Math.fround(re[i] * re[i]) + Math.fround(im[i] * im[i])));
      }
      out[b] = Math.log(Math.max(e, FLT_EPSILON));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Streaming Zipformer2 CTC
// ---------------------------------------------------------------------------

/** The slice of onnxruntime-web this file uses — the real module satisfies it. */
export interface OrtLike {
  InferenceSession: {
    create(model: Uint8Array, options?: Record<string, unknown>): Promise<OrtSession>;
  };
  Tensor: new (type: 'float32' | 'int64', data: Float32Array | BigInt64Array, dims: readonly number[]) => OrtTensor;
}
export interface OrtTensor { data: unknown; dims: readonly number[] }
export interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release?(): Promise<void>;
}

interface StateShape { type: 'float32' | 'int64'; dims: number[] }

const ints = (s: string) => s.split(',').map(v => parseInt(v, 10));

/** sherpa-onnx/csrc/online-zipformer2-ctc-model.cc, InitStates. */
export function stateShapes(meta: Record<string, string>): { shapes: StateShape[]; T: number; chunkShift: number } {
  const need = ['encoder_dims', 'query_head_dims', 'value_head_dims', 'num_heads',
    'num_encoder_layers', 'cnn_module_kernels', 'left_context_len', 'T', 'decode_chunk_len'];
  for (const k of need) if (!(k in meta)) throw new Error(`model metadata lacks «${k}»`);

  const encoderDims = ints(meta.encoder_dims);
  const qHead = ints(meta.query_head_dims);
  const vHead = ints(meta.value_head_dims);
  const heads = ints(meta.num_heads);
  const layers = ints(meta.num_encoder_layers);
  const kernels = ints(meta.cnn_module_kernels);
  const left = ints(meta.left_context_len);

  const shapes: StateShape[] = [];
  for (let i = 0; i < encoderDims.length; i++) {
    const keyDim = qHead[i] * heads[i];
    const valueDim = vHead[i] * heads[i];
    const nonlin = Math.floor((3 * encoderDims[i]) / 4);
    for (let j = 0; j < layers[i]; j++) {
      shapes.push(
        { type: 'float32', dims: [left[i], 1, keyDim] },
        { type: 'float32', dims: [1, 1, left[i], nonlin] },
        { type: 'float32', dims: [left[i], 1, valueDim] },
        { type: 'float32', dims: [left[i], 1, valueDim] },
        { type: 'float32', dims: [1, encoderDims[i], Math.floor(kernels[i] / 2)] },
        { type: 'float32', dims: [1, encoderDims[i], Math.floor(kernels[i] / 2)] },
      );
    }
  }
  // Fixed in sherpa, not read from the metadata.
  shapes.push({ type: 'float32', dims: [1, 128, 3, 19] });
  shapes.push({ type: 'int64', dims: [1] });
  return { shapes, T: parseInt(meta.T, 10), chunkShift: parseInt(meta.decode_chunk_len, 10) };
}

export interface Tokens { symbols: string[]; blank: number }

/** tokens.txt: «symbol id» per line. */
export function parseTokens(text: string): Tokens {
  const symbols: string[] = [];
  let blank = -1;
  for (const line of text.split('\n')) {
    const t = line.trimEnd();
    if (!t) continue;
    const at = t.lastIndexOf(' ');
    const sym = t.slice(0, at);
    const id = parseInt(t.slice(at + 1), 10);
    symbols[id] = sym;
    if (blank < 0 && (sym === '<blk>' || sym === '<eps>' || sym === '<blank>')) blank = id;
  }
  if (blank < 0) throw new Error('tokens.txt has no <blk>, <eps> or <blank>');
  return { symbols, blank };
}

export interface RecognizerOptions {
  sessionOptions?: Record<string, unknown>;
  /**
   * Silence appended before the end. sherpa's `IsReady` needs a full window of
   * `T` frames, so without it the last 0.15–0.5 s of a recitation is never
   * decoded and its final words read as omitted. The Android plugin had that
   * bug; 0 reproduces sherpa exactly, for the comparison checks.
   */
  tailPaddingSeconds?: number;
}

/** One recognised sound. */
export interface Heard {
  symbol: string;
  /** Milliseconds into the audio. */
  atMs: number;
  /**
   * The model's probability for this sound, at the frame it was emitted.
   *
   * sherpa's greedy CTC computes it and throws it away; here it is kept. It is
   * what lets `align.ts` refuse to blame the reciter where the model itself
   * was unsure.
   */
  prob: number;
}

export class Recognizer {
  static async create(ort: OrtLike, model: Uint8Array, tokensText: string, options: RecognizerOptions = {}): Promise<Recognizer> {
    const meta = readOnnxMetadata(model);
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      ...options.sessionOptions,
    });
    return new Recognizer(ort, session, meta, parseTokens(tokensText), options);
  }

  readonly stateShapes: StateShape[];
  readonly T: number;
  readonly chunkShift: number;

  constructor(
    readonly ort: OrtLike,
    readonly session: OrtSession,
    readonly meta: Record<string, string>,
    readonly tokens: Tokens,
    readonly options: RecognizerOptions,
  ) {
    const { shapes, T, chunkShift } = stateShapes(meta);
    if (session.inputNames.length !== shapes.length + 1) {
      throw new Error(`model takes ${session.inputNames.length} inputs; metadata implies ${shapes.length + 1}`);
    }
    this.stateShapes = shapes;
    this.T = T;
    this.chunkShift = chunkShift;
  }

  createStream(): RecognitionStream {
    return new RecognitionStream(this);
  }

  initialStates(): OrtTensor[] {
    return this.stateShapes.map(({ type, dims }) => {
      const size = dims.reduce((a, b) => a * b, 1);
      const data = type === 'int64' ? new BigInt64Array(size) : new Float32Array(size);
      return new this.ort.Tensor(type, data, dims);
    });
  }
}

export class RecognitionStream {
  readonly fbank = new Fbank();
  private states: OrtTensor[];
  private processed = 0;
  // OnlineCtcDecoderResult
  private ids: number[] = [];
  private frameStamps: number[] = [];
  private probs: number[] = [];
  private trailingBlanks = 0;
  private frameOffset = 0;
  private finishing = false;
  /** Milliseconds spent inside session.run. */
  inferenceMs = 0;

  constructor(private readonly r: Recognizer) {
    this.states = r.initialStates();
  }

  acceptWaveform(samples: Float32Array) {
    if (this.finishing) return;
    this.fbank.acceptWaveform(samples);
  }

  inputFinished() {
    if (this.finishing) return;
    this.finishing = true;
    const pad = this.r.options.tailPaddingSeconds ?? 0;
    if (pad > 0) this.fbank.acceptWaveform(new Float32Array(Math.round(pad * SAMPLE_RATE)));
    this.fbank.inputFinished();
  }

  /** online-recognizer-ctc-impl.h, IsReady. */
  isReady(): boolean {
    return this.processed + this.r.T < this.fbank.frames.length;
  }

  /** online-recognizer-ctc-impl.h, DecodeStream. */
  async decode() {
    const { r } = this;
    const x = new Float32Array(r.T * NUM_BINS);
    for (let t = 0; t < r.T; t++) x.set(this.fbank.frames[this.processed + t], t * NUM_BINS);
    this.processed += r.chunkShift;

    const names = r.session.inputNames;
    const feeds: Record<string, OrtTensor> = { [names[0]]: new r.ort.Tensor('float32', x, [1, r.T, NUM_BINS]) };
    for (let i = 0; i < this.states.length; i++) feeds[names[i + 1]] = this.states[i];

    const t0 = performance.now();
    const out = await r.session.run(feeds);
    this.inferenceMs += performance.now() - t0;

    const outNames = r.session.outputNames;
    this.states = outNames.slice(1).map(n => out[n]);
    const logProbs = out[outNames[0]];
    this.greedy(logProbs.data as Float32Array, logProbs.dims[1], logProbs.dims[2]);
  }

  async decodeAvailable() {
    while (this.isReady()) await this.decode();
  }

  /** online-ctc-greedy-search-decoder.cc — plus the probability it discards. */
  private greedy(p: Float32Array, numFrames: number, vocab: number) {
    const blank = this.r.tokens.blank;
    let prev = -1;
    if (this.ids.length) prev = this.trailingBlanks > 0 ? blank : this.ids[this.ids.length - 1];
    for (let t = 0; t < numFrames; t++) {
      let best = 0;
      let bestV = -Infinity;
      const base = t * vocab;
      for (let k = 0; k < vocab; k++) {
        if (p[base + k] > bestV) {
          bestV = p[base + k];
          best = k;
        }
      }
      this.trailingBlanks = best === blank ? this.trailingBlanks + 1 : 0;
      if (best !== blank && best !== prev) {
        this.ids.push(best);
        this.frameStamps.push(t + this.frameOffset);
        this.probs.push(Math.exp(bestV));
      }
      prev = best;
    }
    this.frameOffset += numFrames;
  }

  /** 10 ms frames, subsampling 4 — GetResult in online-recognizer-ctc-impl.h. */
  result(): Heard[] {
    return this.ids.map((id, i) => ({
      symbol: this.r.tokens.symbols[id],
      atMs: Math.round(this.frameStamps[i] * 40),
      prob: this.probs[i],
    }));
  }

  audioMs(): number {
    return (this.fbank.numSamples / SAMPLE_RATE) * 1000;
  }
}
