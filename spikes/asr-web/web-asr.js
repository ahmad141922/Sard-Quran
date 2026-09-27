/**
 * The recitation recogniser, in the browser.
 *
 * A port of the three pieces of sherpa-onnx the Android plugin uses for
 * `zipformer_p_arabic_v3` - kaldi fbank features, the streaming Zipformer2
 * CTC loop, and greedy CTC search - onto onnxruntime-web. No sherpa build is
 * involved: the official npm `sherpa-onnx` is compiled for Node only
 * (NODERAWFS, it throws in a page), and a browser build would mean vendoring
 * a 15 MB wasm from a third party. onnxruntime-web is Microsoft's own.
 *
 * Every behaviour below is sherpa's, cited by file, and `compare.mjs` checks
 * the output symbol for symbol against the official package. Where this file
 * would like to differ (tail padding), it is an option that defaults to
 * sherpa's behaviour.
 *
 * `ort` is passed in rather than imported so the same code runs under
 * onnxruntime-web in a page and in Node.
 */

// ---------------------------------------------------------------------------
// Model metadata
// ---------------------------------------------------------------------------

/**
 * Reads `metadata_props` from an ONNX file.
 *
 * sherpa-onnx takes the state shapes from these keys; onnxruntime-web does not
 * expose them, so the ModelProto is walked directly. Only the top level is
 * parsed: the graph (field 7) and everything else is skipped by length.
 */
export function readOnnxMetadata(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = new TextDecoder();
  let pos = 0;

  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = buf[pos++];
      result += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return result;
      shift += 7;
    }
  };

  const skip = (wire) => {
    if (wire === 0) varint();
    else if (wire === 1) pos += 8;
    else if (wire === 2) {
      const size = varint(); // before `pos +=`, which would read pos first
      pos += size;
    }
    else if (wire === 5) pos += 4;
    else throw new Error(`ONNX: unsupported wire type ${wire}`);
  };

  const meta = {};
  while (pos < buf.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 14 && wire === 2) {
      // Not `pos + varint()`: that reads pos before the length is consumed.
      const size = varint();
      const end = pos + size;
      let key = '';
      let value = '';
      while (pos < end) {
        const t = varint();
        const len = varint();
        const s = text.decode(buf.subarray(pos, pos + len));
        pos += len;
        if (t >>> 3 === 1) key = s;
        else if (t >>> 3 === 2) value = s;
      }
      meta[key] = value;
    } else {
      skip(wire);
    }
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Features: kaldi fbank, as sherpa-onnx configures it
// ---------------------------------------------------------------------------

/*
 * sherpa-onnx/csrc/features.h defaults, which the Android plugin keeps
 * (it sets only sampleRate 16000 and featureDim 80):
 *   dither 0, snip_edges false, 25 ms / 10 ms, remove_dc_offset, preemph 0.97,
 *   povey window, low 20 Hz, high -400 (= 7600 Hz), 80 bins, samples in -1..1.
 * The rest are kaldi-native-fbank's: power spectrum, 512-point FFT, log mel,
 * floor at FLT_EPSILON.
 */
const SAMPLE_RATE = 16000;
const FRAME_LEN = 400;
const FRAME_SHIFT = 160;
const FFT_SIZE = 512;
const NUM_BINS = 80;
const PREEMPH = 0.97;
const FLT_EPSILON = 1.1920928955078125e-7;

const melScale = (hz) => 1127 * Math.log(1 + hz / 700);

function povey() {
  const w = new Float32Array(FRAME_LEN);
  const a = (2 * Math.PI) / (FRAME_LEN - 1);
  for (let i = 0; i < FRAME_LEN; i++) w[i] = Math.pow(0.5 - 0.5 * Math.cos(a * i), 0.85);
  return w;
}

/** Triangular mel filters over FFT bins 0..255, as kaldi's MelBanks builds them. */
function melBanks() {
  const numFftBins = FFT_SIZE / 2;
  const binWidth = SAMPLE_RATE / FFT_SIZE;
  const low = melScale(20);
  const high = melScale(SAMPLE_RATE / 2 - 400);
  const delta = (high - low) / (NUM_BINS + 1);
  const banks = [];
  for (let b = 0; b < NUM_BINS; b++) {
    const left = low + b * delta;
    const center = left + delta;
    const right = center + delta;
    let first = -1;
    const weights = [];
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

/** In-place radix-2 FFT on separate real/imaginary arrays. */
function fft(re, im) {
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

export class Fbank {
  constructor() {
    this.window = povey();
    this.banks = melBanks();
    this.samples = new Float32Array(SAMPLE_RATE * 60);
    this.numSamples = 0;
    this.finished = false;
    /** Computed frames, 80 floats each. */
    this.frames = [];
    this.re = new Float32Array(FFT_SIZE);
    this.im = new Float32Array(FFT_SIZE);
    this.frame = new Float32Array(FRAME_LEN);
  }

  acceptWaveform(chunk) {
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

  /** kaldi NumFrames with snip_edges = false. */
  numFramesAvailable() {
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

  compute() {
    const target = this.numFramesAvailable();
    for (let f = this.frames.length; f < target; f++) this.frames.push(this.computeFrame(f));
  }

  computeFrame(f) {
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
    for (let i = 0; i < FRAME_LEN; i++) re[i] = w[i] * this.window[i];
    fft(re, im);

    const out = new Float32Array(NUM_BINS);
    for (let b = 0; b < NUM_BINS; b++) {
      const { first, weights } = this.banks[b];
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

const ints = (s) => s.split(',').map((v) => parseInt(v, 10));

/** sherpa-onnx/csrc/online-zipformer2-ctc-model.cc, InitStates. */
function initialStateShapes(meta) {
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

  const shapes = [];
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
  // Fixed in sherpa, not read from metadata.
  shapes.push({ type: 'float32', dims: [1, 128, 3, 19] });
  shapes.push({ type: 'int64', dims: [1] });
  return {
    shapes,
    T: parseInt(meta.T, 10),
    chunkShift: parseInt(meta.decode_chunk_len, 10),
  };
}

/** tokens.txt: «symbol id» per line. */
export function parseTokens(text) {
  const symbols = [];
  let blank = -1;
  for (const line of text.split('\n')) {
    const t = line.trimEnd();
    if (!t) continue;
    const at = t.lastIndexOf(' ');
    const sym = t.slice(0, at);
    const id = parseInt(t.slice(at + 1), 10);
    symbols[id] = sym;
    if (sym === '<blk>' || sym === '<eps>' || sym === '<blank>') blank = blank < 0 ? id : blank;
  }
  if (blank < 0) throw new Error('tokens.txt has no <blk>, <eps> or <blank>');
  return { symbols, blank };
}

export class Recognizer {
  /**
   * @param ort       onnxruntime-web (or -node) namespace
   * @param model     the .onnx file's bytes
   * @param tokens    tokens.txt's text
   * @param options   { sessionOptions, tailPaddingSeconds }
   */
  static async create(ort, model, tokens, options = {}) {
    const bytes = model instanceof Uint8Array ? model : new Uint8Array(model);
    const meta = readOnnxMetadata(bytes);
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      ...options.sessionOptions,
    });
    return new Recognizer(ort, session, meta, parseTokens(tokens), options);
  }

  constructor(ort, session, meta, tokens, options) {
    this.ort = ort;
    this.session = session;
    this.meta = meta;
    this.tokens = tokens;
    this.options = options;
    const { shapes, T, chunkShift } = initialStateShapes(meta);
    if (session.inputNames.length !== shapes.length + 1) {
      throw new Error(`model takes ${session.inputNames.length} inputs; metadata implies ${shapes.length + 1}`);
    }
    this.stateShapes = shapes;
    this.T = T;
    this.chunkShift = chunkShift;
  }

  createStream() {
    return new Stream(this);
  }

  initialStates() {
    return this.stateShapes.map(({ type, dims }) => {
      const size = dims.reduce((a, b) => a * b, 1);
      const data = type === 'int64' ? new BigInt64Array(size) : new Float32Array(size);
      return new this.ort.Tensor(type, data, dims);
    });
  }
}

class Stream {
  constructor(recognizer) {
    this.r = recognizer;
    this.fbank = new Fbank();
    this.states = recognizer.initialStates();
    this.processed = 0;
    // OnlineCtcDecoderResult
    this.ids = [];
    this.frameStamps = [];
    this.trailingBlanks = 0;
    this.frameOffset = 0;
    /** Wall-clock milliseconds spent inside session.run. */
    this.inferenceMs = 0;
    this.chunks = 0;
  }

  acceptWaveform(samples) {
    this.fbank.acceptWaveform(samples);
  }

  /**
   * sherpa's stream.inputFinished(). The Android plugin calls it with no tail
   * padding, so the last < T frames are never decoded; `tailPaddingSeconds`
   * appends silence first, the way sherpa's own examples do.
   */
  inputFinished() {
    const pad = this.r.options.tailPaddingSeconds ?? 0;
    if (pad > 0) this.fbank.acceptWaveform(new Float32Array(Math.round(pad * SAMPLE_RATE)));
    this.fbank.inputFinished();
  }

  /** online-recognizer-ctc-impl.h, IsReady. */
  isReady() {
    return this.processed + this.r.T < this.fbank.frames.length;
  }

  /** online-recognizer-ctc-impl.h, DecodeStream. */
  async decode() {
    const { r } = this;
    const x = new Float32Array(r.T * NUM_BINS);
    for (let t = 0; t < r.T; t++) x.set(this.fbank.frames[this.processed + t], t * NUM_BINS);
    this.processed += r.chunkShift;

    const feeds = {};
    const names = r.session.inputNames;
    feeds[names[0]] = new r.ort.Tensor('float32', x, [1, r.T, NUM_BINS]);
    for (let i = 0; i < this.states.length; i++) feeds[names[i + 1]] = this.states[i];

    const t0 = performance.now();
    const out = await r.session.run(feeds);
    this.inferenceMs += performance.now() - t0;
    this.chunks++;

    const outNames = r.session.outputNames;
    this.states = outNames.slice(1).map((n) => out[n]);
    const logProbs = out[outNames[0]];
    this.greedy(logProbs.data, logProbs.dims[1], logProbs.dims[2]);
  }

  async decodeAvailable() {
    while (this.isReady()) await this.decode();
  }

  /** online-ctc-greedy-search-decoder.cc. */
  greedy(p, numFrames, vocab) {
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
      }
      prev = best;
    }
    this.frameOffset += numFrames;
  }

  /**
   * The shape `native-engine.ts` receives from the plugin: symbol, time, and
   * confidence null - the greedy CTC path keeps no probability, on Android or
   * here (see SardAsrPlugin.kt).
   */
  result() {
    // 10 ms frames, subsampling 4: GetResult in online-recognizer-ctc-impl.h.
    return this.ids.map((id, i) => ({
      symbol: this.r.tokens.symbols[id],
      confidence: null,
      atMs: Math.round(this.frameStamps[i] * 40),
    }));
  }

  audioMs() {
    return (this.fbank.numSamples / SAMPLE_RATE) * 1000;
  }
}
