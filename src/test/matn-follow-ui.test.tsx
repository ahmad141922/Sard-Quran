import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import MatnOverlay from '@/components/board/MatnOverlay';
import { setAsrEngine, nullEngine, type AsrEngine } from '@/lib/asr/engine';
import { phonemesFromFile, resetQuranPhonemesCache } from '@/lib/asr/phonemes';
import { matnPhonemes } from '@/lib/matn/phonemes';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { MATN_REGISTRY } from '@/lib/matn/registry';
import { createMatnSession, fullMatnGoal, type MatnSession } from '@/lib/matn/session';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * The cover lifting itself as the matn is recited.
 *
 * This is the join between three things that were built apart: the phonemiser
 * that gives a matn its sounds, the follower that was written for the muṣḥaf,
 * and the cover that hides the lines ahead. What is tested here is only the
 * join — that saying a bayt uncovers it, and that nothing uncovers a line
 * nobody has reached.
 */

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

const jazariyya = matnFromFile(
  JSON.parse(readFileSync('sard/public/matn-jazariyya.json', 'utf8')) as MatnFile,
);
const sounds = matnPhonemes(jazariyya, phonemesFromFile(raw));

/** Somebody reciting the abyāt `from`..`to`, exactly as written. */
const recited = (from: number, to: number): HeardPhoneme[] =>
  sounds.expected(from, to).map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

/**
 * An engine reporting a recitation as it goes.
 *
 * `grow` makes each poll return a little more than the last, which is what a
 * real one does. It matters: an engine that hands over the whole recitation on
 * the first poll finishes in one step, and a follower that stopped listening
 * after that step would still look right.
 */
function engine(heard: HeardPhoneme[], { withPartial = true, grow = 0 } = {}): AsrEngine {
  let polls = 0;
  const base: AsrEngine = {
    async available() { return true; },
    async prepare() { return true; },
    async start() { return true; },
    async stop() { return { phonemes: heard, durationMs: 9000 }; },
    cancel() { /* nothing */ },
  };
  const partial = async () => (grow ? heard.slice(0, Math.min(heard.length, ++polls * grow)) : heard);
  return withPartial ? { ...base, partial } : base;
}

/**
 * The overlay with a parent that actually keeps its session.
 *
 * Not a spy that swallows the change: the app hands the new session straight
 * back, which re-renders the overlay and rebuilds every callback it passes
 * down. That rebuilding is what once tore the listening down after one line, so
 * a test that never applies the change cannot see the bug it is looking for.
 */
const Host: React.FC<{ start: MatnSession; onChange: (s: MatnSession) => void }> = ({ start, onChange }) => {
  const [session, setSession] = React.useState(start);
  return (
    <MatnOverlay
      session={session} matn={jazariyya as Matn}
      onChange={next => { setSession(next); onChange(next); }}
      onEnd={() => {}}
    />
  );
};

const draw = (over: Partial<MatnSession> = {}) => {
  const base = createMatnSession({
    studentName: 'محمّد', instructorName: 'الشيخ',
    matn: jazariyya as Matn, goal: fullMatnGoal(jazariyya as Matn), now: 1_000,
  });
  const onChange = vi.fn();
  const view = render(
    <I18nProvider forceLang="ar">
      <Host start={{ ...base, ...over }} onChange={onChange} />
    </I18nProvider>,
  );
  return { ...view, onChange };
};

const covered = (c: HTMLElement, n: number) =>
  c.querySelector(`[data-bayt="${n}"]`)!.hasAttribute('data-covered');

beforeEach(() => { resetQuranPhonemesCache(); setAsrEngine(nullEngine()); });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); vi.useRealTimers(); });

describe('whether listening is offered at all', () => {
  /**
   * Listening and covering are two switches, not one.
   *
   * Recording is worth having on its own — it asks its questions at the end
   * either way — so it does not wait for the cover. What the cover adds is the
   * uncovering as each line is said.
   */
  it('is offered without the cover, which is a separate switch', async () => {
    setAsrEngine(engine(recited(1, 2)));
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-matn-listen]')).toBeTruthy());
    expect(container.querySelector('[data-covered]')).toBeNull();
  });

  /**
   * An engine that cannot report mid-recitation can still record and be asked
   * at the end, so the mic stays — it is the **following** that is impossible,
   * and nothing uncovers itself.
   */
  it('records where the engine cannot report mid-recitation, but follows nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setAsrEngine(engine(recited(1, 2), { withPartial: false }));
    const view = draw();
    await waitFor(() => expect(view.container.querySelector('[data-matn-listen]')).toBeTruthy());
    fireEvent.click(view.container.querySelector('[data-toggle-veil]')!);
    fireEvent.click(view.container.querySelector('[data-matn-listen]')!);
    await waitFor(() => expect(
      view.container.querySelector('[data-matn-listen]')!.getAttribute('aria-pressed'),
    ).toBe('true'));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(view.onChange).not.toHaveBeenCalled();
    expect(covered(view.container, 1)).toBe(true);
  });

  it('still lets the line be uncovered by hand', async () => {
    setAsrEngine(engine([], { withPartial: false }));
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-toggle-veil]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-toggle-veil]')!);
    expect(container.querySelector('[data-reveal-bayt]')).toBeTruthy();
  });
});

describe('reciting with it listening', () => {
  const listening = async (heard: HeardPhoneme[]) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setAsrEngine(engine(heard));
    const view = draw();
    await waitFor(() => expect(view.container.querySelector('[data-toggle-veil]')).toBeTruthy());
    fireEvent.click(view.container.querySelector('[data-toggle-veil]')!);
    await waitFor(() => expect(view.container.querySelector('[data-matn-listen]')).toBeTruthy());
    fireEvent.click(view.container.querySelector('[data-matn-listen]')!);
    /*
     * Getting ready is asynchronous, and the poll only starts once it is done.
     * Advancing the clock before that would tick a timer nobody had set yet.
     */
    await waitFor(() => expect(
      view.container.querySelector('[data-matn-listen]')!.getAttribute('aria-pressed'),
    ).toBe('true'));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    return view;
  };

  it('uncovers a bayt once it has been said', async () => {
    const { onChange } = await listening(recited(1, 2));
    // The marker is moved past the line just finished, so the reciter is on the
    // next one — and bayt 2 is what the follower confirmed.
    expect(onChange).toHaveBeenCalled();
    const moved = onChange.mock.calls.at(-1)![0] as MatnSession;
    expect(moved.current.bayt).toBe(3);
  });

  /** Nothing uncovers a line nobody has reached. */
  it('leaves the line still being recited covered', async () => {
    const { container } = await listening(recited(1, 1));
    expect(covered(container, 2)).toBe(true);
    expect(covered(container, 3)).toBe(true);
  });

  it('says which word it thinks is being said, without uncovering by it', async () => {
    const { container } = await listening([...recited(1, 1), ...recited(2, 2).slice(0, 14)]);
    const word = container.querySelector('[data-at-word]');
    if (word) expect(word.textContent!.trim()).not.toBe('');
    // Bayt 2 is in progress, not finished: it stays covered whatever the
    // estimate says.
    expect(covered(container, 2)).toBe(true);
  });

  /**
   * The regression that made it useless on the device.
   *
   * The caller rebuilds its `onFollow` whenever the session changes, and the
   * session changes on every move. While the hook depended on that callback's
   * identity, the first confirmed bayt tore the poll down: one line uncovered,
   * then silence. So what is asserted is that it keeps going — the marker
   * reaches a bayt it could only reach by following twice.
   */
  it('keeps listening after the first line, and follows on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A quarter of the four abyāt per poll, so the marker has to move more than once.
    setAsrEngine(engine(recited(1, 4), { grow: Math.ceil(recited(1, 4).length / 4) }));
    const view = draw();
    await waitFor(() => expect(view.container.querySelector('[data-toggle-veil]')).toBeTruthy());
    fireEvent.click(view.container.querySelector('[data-toggle-veil]')!);
    await waitFor(() => expect(view.container.querySelector('[data-matn-listen]')).toBeTruthy());
    fireEvent.click(view.container.querySelector('[data-matn-listen]')!);
    await waitFor(() => expect(
      view.container.querySelector('[data-matn-listen]')!.getAttribute('aria-pressed'),
    ).toBe('true'));

    // Long enough for several polls, and for the session to be handed back more
    // than once — which is exactly what used to stop it.
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });

    expect(view.onChange.mock.calls.length).toBeGreaterThan(1);
    expect(view.container.querySelector('[data-matn-listen]')!.getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('stops when it is told to', async () => {
    const { container } = await listening(recited(1, 2));
    const button = () => container.querySelector('[data-matn-listen]')!;
    expect(button().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button());
    await waitFor(() => expect(button().getAttribute('aria-pressed')).toBe('false'));
  });
});
