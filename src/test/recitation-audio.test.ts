import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, act, waitFor } from '@testing-library/react';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import {
  addCorrection, coverSpan, makeCorrection, notesPerPage, removeCorrection, sessionCorrections,
  surahPressure,
} from '@/lib/recitation-session';
import { useAudioRecorder } from '@/lib/use-audio-recorder';
import { testBooks, type TestBooks } from './session-helpers';

/**
 * A correction is the teacher teaching, not the student erring.
 *
 * That distinction is the whole reason it is a third list, and the tests that
 * matter most are the ones proving nothing which counts mistakes counts it.
 */

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, '../../public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
});

describe('corrections on a session', () => {
  const covered = () => coverSpan(books.session({ goalKind: 'juz1', startAyahId: 8 }), 8, 27);

  it('reads a session with none as an empty list, not undefined', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: 1 });
    expect(s.corrections).toBeUndefined();
    expect(sessionCorrections(s)).toEqual([]);
  });

  it('keeps the place it was recorded at, and the clip it points to', () => {
    const s = addCorrection(covered(), makeCorrection(books.at(10), 4_200, 'clip-1'));
    expect(sessionCorrections(s)).toHaveLength(1);
    expect(sessionCorrections(s)[0].audioId).toBe('clip-1');
    expect(sessionCorrections(s)[0].durationMs).toBe(4_200);
    expect(sessionCorrections(s)[0].position.ayah).toBe(books.at(10).ayah);
  });

  it('does not touch the notes or the marks', () => {
    const s = addCorrection(covered(), makeCorrection(books.at(10), 3_000, 'c'));
    expect(s.notes).toEqual([]);
    expect(s.marks).toBeUndefined();
  });

  it('can be dropped again', () => {
    const s = addCorrection(covered(), makeCorrection(books.at(10), 3_000, 'c'));
    expect(sessionCorrections(removeCorrection(s, sessionCorrections(s)[0].id))).toEqual([]);
  });

  /** The reason it is not a `NoteKind`. */
  it('raises no pressure on the surah it sits in', () => {
    const base = covered();
    const withCorrection = addCorrection(base, makeCorrection(books.at(10), 3_000, 'c'));
    expect(surahPressure(withCorrection, index).items).toEqual(surahPressure(base, index).items);
  });

  it('is invisible to notes-per-page', () => {
    const base = covered();
    const withCorrection = addCorrection(base, makeCorrection(books.at(10), 3_000, 'c'));
    expect(notesPerPage(withCorrection, index)).toBe(notesPerPage(base, index));
  });

  /** A clip that failed to save leaves the record, without a false pointer. */
  it('records the correction even when the clip did not save', () => {
    const s = addCorrection(covered(), makeCorrection(books.at(10), 3_000, undefined));
    expect(sessionCorrections(s)[0].audioId).toBeUndefined();
  });
});

// ── the recorder ────────────────────────────────────────────────

class FakeRecorder {
  static isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = 'audio/webm;codecs=opus';
  constructor(public stream: MediaStream) {}
  start() { /* capture begins */ }
  stop() {
    this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const tracks = () => {
  const stop = vi.fn();
  return { stop, stream: { getTracks: () => [{ stop }] } as unknown as MediaStream };
};

function install(getUserMedia: () => Promise<MediaStream>) {
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia }, configurable: true, writable: true,
  });
}

afterEach(() => {
  delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
});

describe('the recorder', () => {
  it('hands back a clip with the type the browser chose', async () => {
    const { stream } = tracks();
    install(async () => stream);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => { await result.current.start(); });
    expect(result.current.recording).toBe(true);

    let clip: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => { clip = await result.current.stop(); });
    expect(clip!.mimeType).toBe('audio/webm;codecs=opus');
    expect(clip!.blob.size).toBeGreaterThan(0);
    expect(result.current.recording).toBe(false);
  });

  /**
   * A microphone left open shows a recording indicator for the rest of the
   * session and on some devices blocks other apps.
   */
  it('closes the microphone when it stops', async () => {
    const { stop, stream } = tracks();
    install(async () => stream);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    expect(stop).toHaveBeenCalled();
  });

  it('closes it on a cancel too, and keeps nothing', async () => {
    const { stop, stream } = tracks();
    install(async () => stream);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => { await result.current.start(); });
    act(() => { result.current.cancel(); });
    expect(stop).toHaveBeenCalled();
    expect(result.current.recording).toBe(false);
  });

  /** A borrowed tablet will refuse sometimes; the majlis carries on. */
  it('reads a refusal as an answer rather than throwing', async () => {
    install(async () => { throw new Error('NotAllowedError'); });
    const { result } = renderHook(() => useAudioRecorder());

    let ok = true;
    await act(async () => { ok = await result.current.start(); });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('denied');
    expect(result.current.recording).toBe(false);
  });

  it('says so when the browser cannot record at all', async () => {
    delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined, configurable: true, writable: true,
    });
    const { result } = renderHook(() => useAudioRecorder());

    let ok = true;
    await act(async () => { ok = await result.current.start(); });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('unsupported');
  });

  it('counts the seconds while it runs', async () => {
    const { stream } = tracks();
    install(async () => stream);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.elapsedMs).toBeGreaterThanOrEqual(0));
    await act(async () => { await result.current.stop(); });
  });
});
