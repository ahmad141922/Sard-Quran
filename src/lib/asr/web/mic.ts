/**
 * The microphone, as 16 kHz mono samples.
 *
 * The AudioContext runs at the device's own rate and this converts: asking a
 * context for 16 kHz works in Chrome, but Firefox refuses to connect a
 * microphone to a context at a different rate, and the recogniser cannot be
 * told which browser it is in.
 */

import { SAMPLE_RATE } from './recognizer';

/**
 * Device rate to 16 kHz by averaging each output sample over its span of
 * input — a box filter, enough to keep 48 kHz from folding the band above
 * 8 kHz down into the speech.
 */
export class Downsampler {
  private readonly ratio: number;
  private pending = new Float32Array(0);
  /** Position of the next output sample, in `pending`'s samples. */
  private next = 0;

  constructor(fromRate: number) {
    this.ratio = fromRate / SAMPLE_RATE;
  }

  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice();
    const buf = new Float32Array(this.pending.length + input.length);
    buf.set(this.pending);
    buf.set(input, this.pending.length);
    const out: number[] = [];
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

export interface Capture {
  stop(): Promise<void>;
}

const TAP = `registerProcessor('sard-tap', class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice()); return true; }
});`;

/**
 * Starts the microphone and hands every piece of it, at 16 kHz, to `onAudio`.
 *
 * Processing is switched off — echo cancellation, noise suppression and gain
 * control all reshape a voice, and the model was trained on recitation, not
 * on a phone call.
 */
export async function startCapture(onAudio: (samples: Float32Array) => void): Promise<Capture> {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, 'sard-tap');
    const source = ctx.createMediaStreamSource(media);
    source.connect(node);
    const down = new Downsampler(ctx.sampleRate);
    node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => onAudio(down.push(data));
    return {
      async stop() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        media.getTracks().forEach(t => t.stop());
        await ctx.close().catch(() => undefined);
      },
    };
  } catch (err) {
    media.getTracks().forEach(t => t.stop());
    await ctx.close().catch(() => undefined);
    throw err;
  }
}
