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
 * The word being recited, reported out to whatever is drawing the page.
 *
 * The panel cannot mark a word itself — it does not hold the page — so it says
 * what it thinks is under way and lets the page decide. Two things matter and
 * both are refusals: it says nothing while nobody asked to be followed, and it
 * says so **again** when the following stops. The second is the one that is
 * easy to get wrong: the poll that would report «no longer listening» is
 * precisely the poll that no longer runs, so a mark left behind would sit on
 * the page for the rest of the majlis.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const phonemes = phonemesFromFile(raw);

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

const index = {
  locOf: (id: number) => (id >= 8 && id <= 300 ? { surah: 2, ayah: id - 7 } : undefined),
  verseById: (id: number) => ({
    aya_text: 'نصّ',
    aya_text_emlaey: id === 9 ? 'ذلك الكتاب لا ريب فيه هدى للمتقين' : 'الم',
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

const twoVerses = (): HeardPhoneme[] =>
  phonemes
    .expected([{ surah: 2, ayah: 1, anchorId: 8 }, { surah: 2, ayah: 2, anchorId: 9 }])
    .map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

function engine(): AsrEngine {
  return {
    async available() { return true; },
    async prepare() { return true; },
    async start() { return true; },
    async stop() { return { phonemes: twoVerses(), durationMs: 9000 }; },
    async partial() { return twoVerses(); },
    cancel() { /* nothing */ },
  };
}

type Report = { listening: boolean; at: { anchorId: number; word: number | null } | null };

const mount = (onAt: (r: Report) => void) => render(
  <I18nProvider forceLang="ar">
    <SoloListenPanel
      index={index} book={{} as never} canonical={{} as never}
      anchorNow={() => 8} onAccept={vi.fn()} onFollow={vi.fn()} onAt={onAt}
    />
  </I18nProvider>,
);

/** Turns following on, starts the recitation, and lets the polls run. */
async function recite(onAt: (r: Report) => void) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setAsrEngine(engine());
  const view = mount(onAt);
  await waitFor(() => expect(view.container.querySelector('[data-follow-toggle]')).toBeTruthy());
  fireEvent.click(view.container.querySelector('[data-follow-toggle]')!);
  fireEvent.click(view.container.querySelector('[data-asr-start]')!);
  // Getting ready is asynchronous and the poll only starts once it is done;
  // advancing before that would tick a timer nobody had set yet.
  await waitFor(() => expect(view.container.querySelector('[data-asr-stop]')).toBeTruthy());
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  return view;
}

// The first-use explainer is its own test (asr-solo-panel); here it has been read.
beforeEach(() => { resetQuranPhonemesCache(); setAsrEngine(nullEngine()); localStorage.setItem('sard:asr-intro-v1', '1'); });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); vi.useRealTimers(); });

describe('before anybody is being followed', () => {
  it('reports that nothing is under way', async () => {
    setAsrEngine(engine());
    const onAt = vi.fn();
    const { container } = mount(onAt);
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    expect(onAt).toHaveBeenCalled();
    for (const [r] of onAt.mock.calls) {
      expect(r.listening).toBe(false);
      expect(r.at).toBeNull();
    }
  });
});

describe('while a recitation is being followed', () => {
  it('reports the verse, and a word inside it', async () => {
    const onAt = vi.fn();
    await recite(onAt);
    const live = onAt.mock.calls.map(c => c[0] as Report).filter(r => r.listening && r.at);
    expect(live.length).toBeGreaterThan(0);
    const last = live.at(-1)!;
    expect(last.at!.anchorId).toBeGreaterThanOrEqual(8);
    // The word is an index into the verse's printed words, so it is a number
    // or an honest null — never a guess dressed as a position.
    expect(last.at!.word === null || last.at!.word >= 0).toBe(true);
  });
});

describe('when the following stops', () => {
  /**
   * The following switch is gone while a recitation runs — flipping it half way
   * would strand the marker — so the way it stops is the recitation stopping.
   */
  it('says so, so the page can clear the mark', async () => {
    const onAt = vi.fn();
    const view = await recite(onAt);
    onAt.mockClear();
    fireEvent.click(view.container.querySelector('[data-asr-stop]')!);
    await waitFor(() => expect(onAt).toHaveBeenCalled());
    expect((onAt.mock.calls.at(-1)![0] as Report).at).toBeNull();
  });

  it('says so when the panel goes away entirely', async () => {
    const onAt = vi.fn();
    const view = await recite(onAt);
    onAt.mockClear();
    view.unmount();
    expect(onAt).toHaveBeenCalled();
    const last = onAt.mock.calls.at(-1)![0] as Report;
    expect(last).toEqual({ listening: false, at: null });
  });
});
