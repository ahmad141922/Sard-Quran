/**
 * The real recogniser, where there is one.
 *
 * This is the only file in `asr/` that knows a native plugin exists. Above it
 * everything is pure and tested against hand-written examples; below it is a
 * 24 MB library, a 69 MB model and a microphone. `install` is called once at
 * boot inside the Android shell, and nowhere else — on the web `asrEngine()`
 * keeps returning `nullEngine()` and the feature is simply absent.
 *
 * ## Confidence is not decoration here either
 *
 * The plugin hands back one probability per recognised sound, and `align.ts`
 * refuses to blame the reciter for anything the model was unsure of. If that
 * number ever arrives wrong — always 1, always 0, on the wrong scale — the
 * refusal quietly stops working and the tool starts telling people they erred
 * where they did not. So the plugin is the side that converts, and this side
 * checks the range and drops a recording whose numbers make no sense.
 */

import { registerPlugin } from '@capacitor/core';

import { setAsrEngine, type AsrEngine, type RecognisedAudio } from './engine';
import type { HeardPhoneme } from './align';

interface HeardFromPlugin {
  symbol: string;
  /**
   * 0..1, or null where the decoder rated nothing.
   *
   * Null is the normal case for this model: sherpa-onnx's CTC decoder finds
   * the most likely symbol per frame and throws the likelihood away. The
   * plugin says so rather than sending a number nobody computed.
   */
  confidence: number | null;
  atMs: number;
}

interface SardAsr {
  /** Whether this device has the library, the model and a microphone. */
  available(): Promise<{ available: boolean }>;
  /** Fetches the model if it is not on the device. Reports its own progress. */
  prepare(): Promise<{ ready: boolean }>;
  start(): Promise<{ started: boolean }>;
  stop(): Promise<{ phonemes: HeardFromPlugin[]; durationMs: number; canPlay?: boolean }>;
  cancel(): Promise<void>;
  play(options: { atMs: number; forMs?: number }): Promise<void>;
  discard(): Promise<void>;
  partial(): Promise<{ phonemes: HeardFromPlugin[] }>;
  addListener(
    event: 'downloadProgress',
    fn: (data: { fraction: number }) => void,
  ): Promise<{ remove(): Promise<void> }>;
}

const plugin = registerPlugin<SardAsr>('SardAsr');

/**
 * A probability outside 0..1 means the plugin and this file disagree about what
 * it is sending — a log-probability that was never exponentiated, a percentage,
 * a sentinel. Every one of those would defeat `MIN_CONFIDENCE` silently, so the
 * recording is dropped instead.
 *
 * `null` is not such a case. It is the decoder saying it did not rate the
 * symbol, which is the truth for this model, and `align.ts` handles it.
 */
export function readPhonemes(raw: HeardFromPlugin[]): HeardPhoneme[] | null {
  const out: HeardPhoneme[] = [];
  for (const p of raw) {
    if (typeof p.symbol !== 'string' || !p.symbol) return null;
    const rated = p.confidence !== null && p.confidence !== undefined;
    if (rated && (!Number.isFinite(p.confidence) || (p.confidence as number) < 0
      || (p.confidence as number) > 1)) return null;
    if (!Number.isFinite(p.atMs) || p.atMs < 0) return null;
    out.push({ symbol: p.symbol, confidence: rated ? p.confidence : null, atMs: p.atMs });
  }
  return out;
}

/**
 * How long a native call may take before the screen gives up on it.
 *
 * Not a guess about the plugin's speed — a promise to the reciter. A bug on the
 * far side of the bridge once left «reading the recording» on screen with
 * nothing behind it and no way out but closing the majlis. Whatever else goes
 * wrong, that must not: a step that does not finish has to end as «nothing came
 * of it», which the interface already knows how to say.
 */
const PREPARE_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 30_000;
/** Short: a poll that has not answered by now is one the next poll replaces. */
const PARTIAL_TIMEOUT_MS = 4_000;

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    const done = (value: T) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => done(fallback), ms);
    promise.then(
      value => { clearTimeout(timer); done(value); },
      () => { clearTimeout(timer); done(fallback); },
    );
  });
}

export function nativeEngine(): AsrEngine {
  return {
    async available() {
      const { available } = await plugin.available();
      return available;
    },

    async prepare(onProgress) {
      const listener = onProgress
        ? await plugin.addListener('downloadProgress', ({ fraction }) => onProgress(fraction))
        : null;
      try {
        return await within(plugin.prepare().then(r => r.ready), PREPARE_TIMEOUT_MS, false);
      } finally {
        await listener?.remove();
      }
    },

    async start() {
      const { started } = await plugin.start();
      return started;
    },

    async stop(): Promise<RecognisedAudio | null> {
      const result = await within(plugin.stop(), STOP_TIMEOUT_MS, null);
      if (!result) return null;
      const read = readPhonemes(result.phonemes ?? []);
      // See the header: numbers that make no sense are not worked around.
      if (!read) return null;
      return { phonemes: read, durationMs: result.durationMs, canPlay: result.canPlay };
    },

    cancel() {
      plugin.cancel().catch(() => undefined);
    },

    play(atMs) {
      plugin.play({ atMs }).catch(() => undefined);
    },

    discard() {
      plugin.discard().catch(() => undefined);
    },

    async partial() {
      // Polled on a timer while somebody is reciting, so it never throws and
      // never waits long: nothing to report is a perfectly good answer.
      const result = await within(plugin.partial(), PARTIAL_TIMEOUT_MS, null);
      if (!result) return null;
      return readPhonemes(result.phonemes ?? []);
    },
  };
}

/**
 * Installs it, once, inside the Android shell.
 *
 * Everything is wrapped: a shell built before the plugin existed, or one whose
 * library failed to load, must leave `nullEngine()` in place rather than throw
 * during boot. A majlis that cannot start is a far worse failure than one
 * without a microphone button.
 */
export function installNativeAsr(): void {
  try {
    const engine = nativeEngine();
    engine.available()
      .then(ok => { if (ok) setAsrEngine(engine); })
      .catch(() => undefined);
  } catch {
    // No plugin in this build. Nothing is broken.
  }
}
