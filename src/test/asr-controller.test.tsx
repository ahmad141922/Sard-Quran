import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { useAsrReview, passageBetween } from '@/lib/asr/use-asr';
import { setAsrEngine, nullEngine, type AsrEngine } from '@/lib/asr/engine';
import { phonemesFromFile, resetQuranPhonemesCache } from '@/lib/asr/phonemes';

/**
 * The sequencing, and the thing it must do more reliably than anything else:
 * give up quietly. Every failure below is one a real device will produce.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const index = phonemesFromFile(raw);

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

/** al-Fatiha 1-7 are ids 1..7 in the canonical numbering. */
const quranIndex = {
  locOf: (id: number) => (id >= 1 && id <= 7 ? { surah: 1, ayah: id } : undefined),
} as never;

/** An engine that hears exactly what the text says, unless told to slip. */
function perfectEngine(slipAt?: number): AsrEngine {
  return {
    async available() { return true; },
    async prepare(onProgress) { onProgress?.(1); return true; },
    async start() { return true; },
    async stop() {
      const expected = index.expected([
        { surah: 1, ayah: 1, anchorId: 1 },
        { surah: 1, ayah: 2, anchorId: 2 },
      ]);
      const phonemes = expected.map((p, i) => ({
        symbol: slipAt !== undefined && i >= slipAt && i < slipAt + 2 ? 'zz' + i : p.symbol,
        confidence: 0.95,
        atMs: i * 90,
      }));
      return { phonemes, durationMs: 4000 };
    },
    cancel() { /* nothing */ },
  };
}

beforeEach(() => { resetQuranPhonemesCache(); setAsrEngine(nullEngine()); });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); });

const at = (id: number | null) => () => id;

describe('the passage a recording covers', () => {
  it('is every verse between where recording began and where it ended', () => {
    expect(passageBetween(quranIndex, 2, 5).map(r => r.anchorId)).toEqual([2, 3, 4, 5]);
  });

  it('reads the same whichever way the reciter moved', () => {
    expect(passageBetween(quranIndex, 5, 2)).toEqual(passageBetween(quranIndex, 2, 5));
  });

  it('is one verse when the reciter never moved', () => {
    expect(passageBetween(quranIndex, 3, 3).map(r => r.anchorId)).toEqual([3]);
  });

  it('skips ids the book does not have rather than inventing them', () => {
    expect(passageBetween(quranIndex, 6, 9).map(r => r.anchorId)).toEqual([6, 7]);
  });
});

describe('a device that cannot run it', () => {
  it('reports itself unavailable, so nothing is ever drawn', async () => {
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
  });

  it('records nothing even if the screen calls start anyway', async () => {
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.review).toBeNull());
  });
});

describe('one recitation, end to end', () => {
  const run = async (engine: AsrEngine) => {
    setAsrEngine(engine);
    const hook = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));
    act(() => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.phase).toBe('listening'));
    act(() => hook.result.current.stop());
    return hook;
  };

  it('walks from idle to a list of questions', async () => {
    const { result } = await run(perfectEngine(3));
    await waitFor(() => expect(result.current.phase).toBe('review'));
    const review = result.current.review;
    expect(review?.followed).toBe(true);
    expect(review?.candidates.length).toBeGreaterThan(0);
    expect(review?.candidates.every(c => c.verdict === 'pending')).toBe(true);
  });

  it('asks nothing after a recitation that matched the mushaf', async () => {
    const { result } = await run(perfectEngine());
    await waitFor(() => expect(result.current.phase).toBe('review'));
    expect(result.current.review?.candidates).toEqual([]);
  });

  it('carries the answers a person gave, and only theirs', async () => {
    const { result } = await run(perfectEngine(3));
    await waitFor(() => expect(result.current.phase).toBe('review'));

    const first = result.current.review?.candidates[0].id as string;
    act(() => result.current.say(first, 'accepted'));
    expect(result.current.review?.candidates.find(c => c.id === first)?.verdict).toBe('accepted');

    act(() => result.current.sayRestFine());
    expect(result.current.review?.candidates.filter(c => c.verdict === 'pending')).toEqual([]);
    expect(result.current.review?.candidates.find(c => c.id === first)?.verdict).toBe('accepted');
  });
});

describe('giving up quietly', () => {
  const half = (over: Partial<AsrEngine>): AsrEngine => ({ ...perfectEngine(3), ...over });

  const idleAfterStart = async (engine: AsrEngine) => {
    setAsrEngine(engine);
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    return result;
  };

  it('goes back to idle when the model will not download', async () => {
    const result = await idleAfterStart(half({ async prepare() { return false; } }));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.review).toBeNull();
  });

  it('goes back to idle when the microphone is refused', async () => {
    const result = await idleAfterStart(half({ async start() { return false; } }));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
  });

  it('goes back to idle when the engine throws rather than answering', async () => {
    const result = await idleAfterStart(half({ async prepare() { throw new Error('no plugin'); } }));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
  });

  it('goes back to idle when the recording comes back empty', async () => {
    setAsrEngine(half({ async stop() { return null; } }));
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.review).toBeNull();
  });

  it('never starts when it does not know where the reciter is', async () => {
    setAsrEngine(perfectEngine(3));
    const { result } = renderHook(() => useAsrReview(quranIndex, at(null)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
  });

  it('cancels the engine when the majlis closes mid-recitation', async () => {
    const cancel = vi.fn();
    setAsrEngine(half({ cancel }));
    const { result, unmount } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('hearing the moment back', () => {
  const playable = (canPlay: boolean, played: number[]): AsrEngine => ({
    ...perfectEngine(3),
    async stop() {
      const base = await perfectEngine(3).stop();
      return { ...base!, canPlay };
    },
    play(atMs: number) { played.push(atMs); },
    discard() { played.push(-1); },
  });

  const upToReview = async (engine: AsrEngine) => {
    setAsrEngine(engine);
    const hook = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));
    act(() => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.phase).toBe('listening'));
    act(() => hook.result.current.stop());
    await waitFor(() => expect(hook.result.current.phase).toBe('review'));
    return hook;
  };

  it('offers playback when the recitation was kept', async () => {
    const played: number[] = [];
    const { result } = await upToReview(playable(true, played));
    expect(result.current.canPlay).toBe(true);

    act(() => result.current.play(1234));
    expect(played).toEqual([1234]);
  });

  /** A sitting too long to hold in memory keeps its candidates, loses the button. */
  it('does not offer it for a recitation too long to have been kept', async () => {
    const played: number[] = [];
    const { result } = await upToReview(playable(false, played));
    expect(result.current.canPlay).toBe(false);
    expect(result.current.review?.candidates.length).toBeGreaterThan(0);
  });

  it('never offers it on an engine that keeps no audio at all', async () => {
    const { result } = await upToReview(perfectEngine(3));
    expect(result.current.canPlay).toBe(false);
  });

  /** The recitation is not kept beyond the review that needed it. */
  it('drops the audio when the review is closed', async () => {
    const played: number[] = [];
    const { result } = await upToReview(playable(true, played));
    act(() => result.current.clear());
    expect(played).toContain(-1);
    expect(result.current.canPlay).toBe(false);
  });

  it('drops the audio when the majlis closes mid-review', async () => {
    const played: number[] = [];
    const { unmount } = await upToReview(playable(true, played));
    unmount();
    expect(played).toContain(-1);
  });
});

describe('a download the reciter has not agreed to', () => {
  const needing = (bytes: number | null, prepare = vi.fn(async () => true)): AsrEngine => ({
    ...perfectEngine(), prepare, async needsDownload() { return bytes; },
  });

  it('is asked about, with its size, and nothing is fetched until they agree', async () => {
    const prepare = vi.fn(async () => true);
    setAsrEngine(needing(72_705_392, prepare));
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe('consent'));
    expect(result.current.consentBytes).toBe(72_705_392);
    expect(prepare).not.toHaveBeenCalled();

    act(() => result.current.agree());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('is dropped entirely when they say «later»', async () => {
    const prepare = vi.fn(async () => true);
    setAsrEngine(needing(1000, prepare));
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe('consent'));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.consentBytes).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('is not asked about again once the model is on the device', async () => {
    setAsrEngine(needing(null));
    const { result } = renderHook(() => useAsrReview(quranIndex, at(1)));
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe('listening'));
    expect(result.current.consentBytes).toBeNull();
  });
});
