import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import SoloListenPanel from '@/components/board/SoloListenPanel';
import { setAsrEngine, nullEngine, type AsrEngine } from '@/lib/asr/engine';
import { phonemesFromFile, resetQuranPhonemesCache } from '@/lib/asr/phonemes';
import { CANONICAL_COUNTING } from '@/lib/mushaf/registry';
import type { AyahPosition } from '@/lib/mushaf/position';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * The marker moving itself, as the majlis mounts it.
 *
 * The decisions worth pinning are all refusals: it is **off** unless somebody
 * turns it on, it is not offered at all where the engine cannot report
 * mid-recitation, and it cannot be flipped half way through a recitation —
 * which would strand the marker wherever it had got to.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const phonemes = phonemesFromFile(raw);

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

/** al-Baqara from id 8, which is where the follow tests recite. */
const index = {
  locOf: (id: number) => (id >= 8 && id <= 300 ? { surah: 2, ayah: id - 7 } : undefined),
  verseById: (id: number) => ({
    aya_text: 'نصّ',
    // al-Baqara 2, whose words the live estimate walks through.
    aya_text_emlaey: id === 9
      ? 'ذلك الكتاب لا ريب فيه هدى للمتقين'
      : 'الم',
  }),
} as never;

const position = (anchorId: number): AyahPosition => ({
  mushafId: 'madinah', riwayaId: 'hafs', ayahCounting: CANONICAL_COUNTING,
  surah: 2, ayah: anchorId - 7, origin: 'converted',
  anchor: { scheme: CANONICAL_COUNTING, surah: 2, ayah: anchorId - 7, id: anchorId, exact: true },
});

vi.mock('@/lib/mushaf/position', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mushaf/position')>('@/lib/mushaf/position');
  return { ...actual, positionFromAnchor: (_b: never, _c: never, id: number) => position(id) };
});

/** The first two verses of al-Baqara, recited exactly. */
const twoVerses = (): HeardPhoneme[] =>
  phonemes
    .expected([{ surah: 2, ayah: 1, anchorId: 8 }, { surah: 2, ayah: 2, anchorId: 9 }])
    .map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

/** An engine that can report mid-recitation, unless told it cannot. */
function engine(withPartial = true): AsrEngine {
  const base: AsrEngine = {
    async available() { return true; },
    async prepare() { return true; },
    async start() { return true; },
    async stop() { return { phonemes: twoVerses(), durationMs: 9000 }; },
    cancel() { /* nothing */ },
  };
  return withPartial ? { ...base, async partial() { return twoVerses(); } } : base;
}

const mount = (onFollow?: (id: number) => void) => render(
  <I18nProvider forceLang="ar">
    <SoloListenPanel
      index={index} book={{} as never} canonical={{} as never}
      anchorNow={() => 8} onAccept={vi.fn()} onFollow={onFollow}
    />
  </I18nProvider>,
);

// The first-use explainer is its own test (asr-solo-panel); here it has been read.
beforeEach(() => { resetQuranPhonemesCache(); setAsrEngine(nullEngine()); localStorage.setItem('sard:asr-intro-v1', '1'); });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); vi.useRealTimers(); });

describe('whether it is offered at all', () => {
  it('is offered where the engine can report mid-recitation', async () => {
    setAsrEngine(engine(true));
    const { container } = mount(vi.fn());
    await waitFor(() => expect(container.querySelector('[data-follow-toggle]')).toBeTruthy());
  });

  /** A control that cannot work is worse than none. */
  it('is not offered where the engine cannot', async () => {
    setAsrEngine(engine(false));
    const { container } = mount(vi.fn());
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    expect(container.querySelector('[data-follow-toggle]')).toBeNull();
  });

  it('is not offered where the majlis did not ask for it', async () => {
    setAsrEngine(engine(true));
    const { container } = mount(undefined);
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    expect(container.querySelector('[data-follow-toggle]')).toBeNull();
  });
});

describe('whether it is on', () => {
  /**
   * Off until chosen. A marker that moves on its own is something a reciter
   * should have decided, not something they discover happening to them.
   */
  it('starts off', async () => {
    setAsrEngine(engine(true));
    const { container } = mount(vi.fn());
    await waitFor(() => expect(container.querySelector('[data-follow-toggle]')).toBeTruthy());
    expect(container.querySelector('[data-follow-toggle]')!.getAttribute('aria-pressed'))
      .toBe('false');
  });

  it('turns on and off again', async () => {
    setAsrEngine(engine(true));
    const { container } = mount(vi.fn());
    await waitFor(() => expect(container.querySelector('[data-follow-toggle]')).toBeTruthy());
    const toggle = () => container.querySelector('[data-follow-toggle]')!;

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  /** Flipping it half way would strand the marker wherever it had got to. */
  it('cannot be flipped once a recitation has started', async () => {
    setAsrEngine(engine(true));
    const { container } = mount(vi.fn());
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());

    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-stop]')).toBeTruthy());
    expect(container.querySelector('[data-follow-toggle]')).toBeNull();
  });
});

describe('while somebody recites', () => {
  it('moves the marker to a verse they have finished', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setAsrEngine(engine(true));
    const onFollow = vi.fn();
    const { container } = mount(onFollow);

    await waitFor(() => expect(container.querySelector('[data-follow-toggle]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-follow-toggle]')!);
    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-stop]')).toBeTruthy());

    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    // The two verses recited are al-Baqara 1 and 2 — anchors 8 and 9.
    expect(onFollow).toHaveBeenCalledWith(9);
  });

  it('leaves the marker alone while it is switched off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setAsrEngine(engine(true));
    const onFollow = vi.fn();
    const { container } = mount(onFollow);

    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-stop]')).toBeTruthy());

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(onFollow).not.toHaveBeenCalled();
  });

  /** The same verse confirmed again is not a move, and must not be reported. */
  it('does not report the same verse over and over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setAsrEngine(engine(true));
    const onFollow = vi.fn();
    const { container } = mount(onFollow);

    await waitFor(() => expect(container.querySelector('[data-follow-toggle]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-follow-toggle]')!);
    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-stop]')).toBeTruthy());

    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(onFollow).toHaveBeenCalledTimes(1);
  });
});

/**
 * The word being recited, shown live.
 *
 * It is an estimate and is drawn as one. The test that matters is that it
 * never becomes the marker: `onFollow` is called for the verse **finished**,
 * while the word on screen is the verse in progress.
 */
describe('the word on screen while reciting', () => {
  const reciting = async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setAsrEngine(engine(true));
    const onFollow = vi.fn();
    const { container } = mount(onFollow);

    await waitFor(() => expect(container.querySelector('[data-follow-toggle]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-follow-toggle]')!);
    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-stop]')).toBeTruthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    return { container, onFollow };
  };

  it('names the word out of the verse being recited', async () => {
    const { container } = await reciting();
    const said = container.querySelector('[data-at-word]');
    expect(said).toBeTruthy();
    expect(said!.textContent).toMatch(/ذلك|الكتاب|لا|ريب|فيه|هدى|للمتقين/);
  });

  /** The distinction the whole design rests on. */
  it('is not the verse the marker was moved to', async () => {
    const { onFollow } = await reciting();
    // The marker follows the verse finished — al-Baqara 2, anchor 9.
    expect(onFollow).toHaveBeenCalledWith(9);
  });

  it('shows nothing but the plain notice before anything can be placed', async () => {
    setAsrEngine(engine(true));
    const { container } = mount(vi.fn());
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-listening]')).toBeTruthy());
    expect(container.querySelector('[data-at-word]')).toBeNull();
  });
});
