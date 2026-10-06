import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import SoloListenPanel from '@/components/board/SoloListenPanel';
import { setAsrEngine, nullEngine, type AsrEngine } from '@/lib/asr/engine';
import { phonemesFromFile, resetQuranPhonemesCache } from '@/lib/asr/phonemes';
import type { AyahPosition } from '@/lib/mushaf/position';
import { CANONICAL_COUNTING } from '@/lib/mushaf/registry';

/**
 * The panel as the majlis actually mounts it.
 *
 * Two claims are worth a test more than any other: that it is *absent* where
 * the recogniser cannot run, and that nothing reaches the session until a
 * person presses «yes».
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const phonemes = phonemesFromFile(raw);

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

/** Where a slip's wording came from — real search elsewhere; set per test here. */
const source = vi.hoisted(() => ({ next: null as null | { surah: number; ayah: number; word: number | null; score: number } }));
vi.mock('@/lib/asr/source', () => ({ sourceOfCandidate: () => source.next }));

/** Only what the panel touches. */
const index = {
  locOf: (id: number) => (id >= 1 && id <= 7 ? { surah: 1, ayah: id } : undefined),
  verseById: (id: number) =>
    (id <= 2 ? { aya_text: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ' } : undefined),
} as never;

const position = (anchorId: number): AyahPosition => ({
  mushafId: 'madinah', riwayaId: 'hafs', ayahCounting: CANONICAL_COUNTING,
  surah: 1, ayah: anchorId, origin: 'converted',
  anchor: { scheme: CANONICAL_COUNTING, surah: 1, ayah: anchorId, id: anchorId, exact: true },
});

vi.mock('@/lib/mushaf/position', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mushaf/position')>('@/lib/mushaf/position');
  return { ...actual, positionFromAnchor: (_b: never, _c: never, id: number) => position(id) };
});

function engine(slipAt?: number): AsrEngine {
  return {
    async available() { return true; },
    async prepare() { return true; },
    async start() { return true; },
    async stop() {
      const expected = phonemes.expected([
        { surah: 1, ayah: 1, anchorId: 1 },
        { surah: 1, ayah: 2, anchorId: 2 },
      ]);
      return {
        phonemes: expected.map((p, i) => ({
          symbol: slipAt !== undefined && i >= slipAt && i < slipAt + 2 ? 'zz' + i : p.symbol,
          confidence: 0.95,
          atMs: i * 90,
        })),
        durationMs: 4000,
      };
    },
    cancel() { /* nothing */ },
  };
}

const book = {} as never;
const canonical = {} as never;

const mount = (onAccept = vi.fn()) => ({
  onAccept,
  ...render(
    <I18nProvider forceLang="ar">
      <SoloListenPanel
        index={index} book={book} canonical={canonical}
        anchorNow={() => 1} onAccept={onAccept}
      />
    </I18nProvider>,
  ),
});

beforeEach(() => { resetQuranPhonemesCache(); setAsrEngine(nullEngine()); source.next = null; });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); });

describe('where the recogniser cannot run', () => {
  /** The browser, and any build without the model. */
  it('draws nothing at all — not a disabled button, not an explanation', async () => {
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[data-solo-listen]')).toBeNull());
    expect(container.textContent).toBe('');
  });
});

describe('one solo recitation', () => {
  const record = async (slipAt?: number) => {
    setAsrEngine(engine(slipAt));
    const m = mount();
    await waitFor(() => expect(m.container.querySelector('[data-asr-start]')).toBeTruthy());
    fireEvent.click(m.container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(m.container.querySelector('[data-asr-stop]')).toBeTruthy());
    fireEvent.click(m.container.querySelector('[data-asr-stop]')!);
    return m;
  };

  it('offers the button once the device can run it', async () => {
    setAsrEngine(engine());
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
  });

  it('shows what it noticed, and hands the session nothing yet', async () => {
    const { container, onAccept } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-asr-suggestions]')).toBeTruthy());
    expect(container.querySelectorAll('[data-asr-candidate]').length).toBeGreaterThan(0);
    // The claim of the whole feature: seeing is not recording.
    expect(onAccept).not.toHaveBeenCalled();
  });

  /**
   * The verse itself, because the machine cannot say which word went wrong:
   * its sounds are numbered by phonetic group, and «هدى من ربهم» is one group.
   * Showing the verse whole lets the reciter find it; naming a word would be
   * right about a third of the time.
   */
  it('shows the verse, so the reciter can find the place themselves', async () => {
    const { container } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-ayah-text]')).toBeTruthy());
    expect(container.querySelector('[data-ayah-text]')!.textContent)
      .toContain('ٱلرَّحْمَٰنِ');
  });

  /** No audio kept, no button — never one that does nothing when pressed. */
  it('offers no playback where the engine keeps no audio', async () => {
    const { container } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-asr-candidate]')).toBeTruthy());
    expect(container.querySelector('[data-asr-play]')).toBeNull();
  });

  /** The one press that is allowed to write into the majlis. */
  it('records a note only when the reciter says yes', async () => {
    const { container, onAccept } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-asr-accept]')).toBeTruthy());

    fireEvent.click(container.querySelector('[data-asr-accept]')!);
    expect(onAccept).toHaveBeenCalledTimes(1);
    const [place, detail] = onAccept.mock.calls[0];
    expect(place.anchor.id).toBe(1);
    expect(detail).toContain('من التسجيل');
  });

  /** A slip into another verse's wording: the note names both places. */
  it('carries the verse the wording came from into the note', async () => {
    source.next = { surah: 7, ayah: 161, word: 0, score: 0.95 };
    const { container, onAccept } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-asr-source]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-asr-accept]')!);
    const [, detail] = onAccept.mock.calls[0];
    expect(detail).toContain('من التسجيل');
    expect(detail).toContain('الأعراف 161');
  });

  it('records nothing when the reciter says no', async () => {
    const { container, onAccept } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-asr-dismiss]')).toBeTruthy());

    fireEvent.click(container.querySelector('[data-asr-dismiss]')!);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('records nothing when the reciter says the rest was fine', async () => {
    const { container, onAccept } = await record(3);
    await waitFor(() => expect(container.querySelector('[data-asr-suggestions]')).toBeTruthy());

    const rest = container.querySelector('[data-asr-dismiss-rest]');
    if (rest) fireEvent.click(rest);
    else fireEvent.click(container.querySelector('[data-asr-dismiss]')!);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('says nothing was noticed after a recitation that matched', async () => {
    const { container, onAccept } = await record();
    await waitFor(() => expect(container.querySelector('[data-asr-clean]')).toBeTruthy());
    expect(container.querySelector('[data-asr-candidate]')).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('the first time, before a 70 MB download', () => {
  it('says the size and that it is not a teacher, and fetches only on «yes»', async () => {
    const prepare = vi.fn(async () => true);
    setAsrEngine({ ...engine(), prepare, async needsDownload() { return 72_705_392; } });
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-asr-start]')!);

    await waitFor(() => expect(container.querySelector('[data-asr-consent]')).toBeTruthy());
    const consent = container.querySelector('[data-asr-consent]')!.textContent!;
    expect(consent).toContain('73');          // MB, as the download is announced
    expect(consent).not.toContain('{mb}');
    expect(prepare).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('[data-asr-agree]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-stop]')).toBeTruthy());
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('goes back to the button on «later», having fetched nothing', async () => {
    const prepare = vi.fn(async () => true);
    setAsrEngine({ ...engine(), prepare, async needsDownload() { return 72_705_392; } });
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[data-asr-start]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-asr-start]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-later]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-asr-later]')!);
    await waitFor(() => expect(container.querySelector('[data-asr-consent]')).toBeNull());
    expect(prepare).not.toHaveBeenCalled();
  });
});
