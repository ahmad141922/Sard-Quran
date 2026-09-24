import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { I18nProvider } from '@/hooks/useI18n';
import MatnOverlay from '@/components/board/MatnOverlay';
import { setAsrEngine, nullEngine, type AsrEngine } from '@/lib/asr/engine';
import { phonemesFromFile, resetQuranPhonemesCache } from '@/lib/asr/phonemes';
import { matnPhonemes } from '@/lib/matn/phonemes';
import { STRAY_AFTER_SOUNDS } from '@/lib/matn/use-matn-follow';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { createMatnSession, fullMatnGoal, type MatnSession } from '@/lib/matn/session';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * Being told, mid-recitation, that the reciting has left the text.
 *
 * This is the one thing in the tool that interrupts somebody while they are
 * reciting, so nearly every test here is about when it must stay **quiet**. The
 * two mistakes are not equal: missing a slip costs a slip, while calling one
 * that did not happen stops a reciter who was right, in the middle of a line,
 * and teaches them not to trust it.
 *
 * It is a cue and not a verdict — a tone, a tap and a band of colour, with no
 * words and nothing written into the majlis. What was actually noticed is put
 * as a question afterwards, where it can be answered properly.
 */

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

const played = vi.fn();
vi.mock('@/lib/asr/alert-tone', () => ({ alertStray: () => played() }));

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const jazariyya = matnFromFile(
  JSON.parse(readFileSync('sard/public/matn-jazariyya.json', 'utf8')) as MatnFile,
);
const sounds = matnPhonemes(jazariyya, phonemesFromFile(raw));

const heardOf = (from: number, to: number): HeardPhoneme[] =>
  sounds.expected(from, to).map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

/** Reciting something the matn does not say at all, in the right quantity. */
const wrongLines = (howMany: number): HeardPhoneme[] =>
  sounds.expected(90, 90 + howMany).map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

function engine(heard: HeardPhoneme[], grow = 0): AsrEngine {
  let polls = 0;
  return {
    async available() { return true; },
    async prepare() { return true; },
    async start() { return true; },
    async stop() { return { phonemes: heard, durationMs: 9000 }; },
    async partial() { return grow ? heard.slice(0, Math.min(heard.length, ++polls * grow)) : heard; },
    cancel() { /* nothing */ },
  };
}

const Host: React.FC<{ start: MatnSession }> = ({ start }) => {
  const [session, setSession] = React.useState(start);
  return <MatnOverlay session={session} matn={jazariyya as Matn} onChange={setSession} onEnd={() => {}} />;
};

const draw = () => render(
  <I18nProvider forceLang="ar">
    <Host start={createMatnSession({
      studentName: 'محمّد', instructorName: 'الشيخ',
      matn: jazariyya as Matn, goal: fullMatnGoal(jazariyya as Matn), now: 1_000,
    })} />
  </I18nProvider>,
);

/** Switch the alert on (or not), start reciting, and let the polls run. */
async function recite(heard: HeardPhoneme[], { alerts = true, ms = 8000, grow = 0 } = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setAsrEngine(engine(heard, grow));
  const view = draw();
  await waitFor(() => expect(view.container.querySelector('[data-matn-listen]')).toBeTruthy());
  // Following notices the departure, so the cover is on for these.
  fireEvent.click(view.container.querySelector('[data-toggle-veil]')!);
  if (alerts) fireEvent.click(view.container.querySelector('[data-alert-toggle]')!);
  fireEvent.click(view.container.querySelector('[data-matn-listen]')!);
  await waitFor(() => expect(
    view.container.querySelector('[data-matn-listen]')!.getAttribute('aria-pressed'),
  ).toBe('true'));
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  return view;
}

beforeEach(() => { played.mockClear(); resetQuranPhonemesCache(); setAsrEngine(nullEngine()); });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); vi.useRealTimers(); });

describe('whether it says anything at all', () => {
  it('is off until it is switched on', async () => {
    setAsrEngine(engine(wrongLines(3)));
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-alert-toggle]')).toBeTruthy());
    expect(container.querySelector('[data-alert-toggle]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('stays silent while it is off, however far the reciting wanders', async () => {
    const { container } = await recite(wrongLines(4), { alerts: false });
    expect(played).not.toHaveBeenCalled();
    expect(container.querySelector('[data-stray-cue]')).toBeNull();
  });
});

describe('when it does speak', () => {
  it('sounds, and shows, once the reciting has plainly left the text', async () => {
    const { container } = await recite(wrongLines(4));
    expect(played).toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('[data-stray-cue]')).toBeTruthy());
  });

  /** A bell that keeps ringing while somebody is remembering is worse than none. */
  it('says it once, not once a second', async () => {
    await recite(wrongLines(4), { ms: 15_000 });
    expect(played).toHaveBeenCalledTimes(1);
  });

  /** A cue, not a record: nothing about it reaches the majlis. */
  it('writes nothing into the majlis', async () => {
    const { container } = await recite(wrongLines(4));
    expect(played).toHaveBeenCalled();
    expect(container.querySelector('[data-open-list]')!.textContent!.trim()).toBe('0');
  });
});

describe('when it must stay quiet', () => {
  it('says nothing to a reciter who is reciting the matn', async () => {
    await recite(heardOf(1, 4), { grow: 12 });
    expect(played).not.toHaveBeenCalled();
  });

  /**
   * Below the threshold the reciter has merely paused, cleared their throat or
   * been misheard for a moment — and none of those is a mistake.
   */
  it('says nothing about a moment of it', async () => {
    await recite(wrongLines(4).slice(0, STRAY_AFTER_SOUNDS - 4), { ms: 6000 });
    expect(played).not.toHaveBeenCalled();
  });
});
