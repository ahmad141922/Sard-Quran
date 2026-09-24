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
import { createMatnSession, fullMatnGoal, type MatnSession } from '@/lib/matn/session';
import { ACCEPTED_KIND } from '@/lib/asr/review';
import { MATN_NOTE_KINDS } from '@/lib/recitation-session';
import type { HeardPhoneme } from '@/lib/asr/align';

/**
 * What the recording noticed in a matn, put to the reciter as questions.
 *
 * The rule this screen exists to keep is the one `asr/engine.ts` states: every
 * line is a **question**, and only «yes» writes anything into the majlis. So
 * what is tested is mostly what must *not* happen — nothing recorded until it
 * is answered, and nothing recorded at all for a recitation too short to have
 * an opinion about.
 *
 * Nothing here is new machinery. `reviewRecitation` and `AsrSuggestions` were
 * written for the muṣḥaf and take their numbering from the caller; a bayt goes
 * where an āyah went, exactly as it does for the following.
 */

vi.mock('@/lib/asr/phonemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asr/phonemes')>('@/lib/asr/phonemes');
  const { readFileSync: read } = await import('node:fs');
  const file = JSON.parse(read('sard/public/quran-phonemes.json', 'utf8'));
  return { ...actual, loadQuranPhonemes: async () => actual.phonemesFromFile(file) };
});

const raw = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8'));
const jazariyya = matnFromFile(
  JSON.parse(readFileSync('sard/public/matn-jazariyya.json', 'utf8')) as MatnFile,
);
const sounds = matnPhonemes(jazariyya, phonemesFromFile(raw));

const recited = (from: number, to: number): HeardPhoneme[] =>
  sounds.expected(from, to).map((p, i) => ({ symbol: p.symbol, confidence: null, atMs: i * 80 }));

function engine(heard: HeardPhoneme[]): AsrEngine {
  return {
    async available() { return true; },
    async prepare() { return true; },
    async start() { return true; },
    async stop() { return { phonemes: heard, durationMs: 12_000 }; },
    async partial() { return heard; },
    cancel() { /* nothing */ },
  };
}

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

const draw = () => {
  const base = createMatnSession({
    studentName: 'محمّد', instructorName: 'الشيخ',
    matn: jazariyya as Matn, goal: fullMatnGoal(jazariyya as Matn), now: 1_000,
  });
  const onChange = vi.fn();
  const view = render(
    <I18nProvider forceLang="ar"><Host start={base} onChange={onChange} /></I18nProvider>,
  );
  return { ...view, onChange };
};

/** Record, then stop, and wait for the questions. */
async function reciteThenStop(heard: HeardPhoneme[]) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setAsrEngine(engine(heard));
  const view = draw();
  await waitFor(() => expect(view.container.querySelector('[data-matn-listen]')).toBeTruthy());
  fireEvent.click(view.container.querySelector('[data-matn-listen]')!);
  await waitFor(() => expect(
    view.container.querySelector('[data-matn-listen]')!.getAttribute('aria-pressed'),
  ).toBe('true'));
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  fireEvent.click(view.container.querySelector('[data-matn-listen]')!);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  return view;
}

beforeEach(() => { resetQuranPhonemesCache(); setAsrEngine(nullEngine()); });
afterEach(() => { cleanup(); setAsrEngine(nullEngine()); vi.useRealTimers(); });

describe('what the recording is allowed to claim', () => {
  /**
   * The same claim the muṣḥaf makes, and it must stay the same one: a memory
   * slip, never a ḍabṭ error, because the model cannot hear tafkhīm or madd
   * length and so cannot say a rule was broken.
   */
  it('records a memory slip, which is what it is in a position to say', () => {
    expect(ACCEPTED_KIND).toBe('memory');
    expect(MATN_NOTE_KINDS).toContain(ACCEPTED_KIND);
  });
});

describe('listening without the cover', () => {
  it('is offered on its own — the cover is a separate switch', async () => {
    setAsrEngine(engine(recited(1, 2)));
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-matn-listen]')).toBeTruthy());
    expect(container.querySelector('[data-covered]')).toBeNull();
  });
});

describe('after the reciting stops', () => {
  it('asks its questions', async () => {
    // A recitation that departs from the matn: the abyāt said are not the
    // abyāt the marker started at.
    const { container } = await reciteThenStop(recited(1, 3));
    await waitFor(() => expect(container.querySelector('[data-matn-review]')).toBeTruthy());
  });

  /** Too little to have an opinion about is a different sentence from «nothing found». */
  it('says it heard too little rather than that nothing was wrong', async () => {
    const { container } = await reciteThenStop(recited(1, 1).slice(0, 6));
    await waitFor(() => expect(container.querySelector('[data-matn-review]')).toBeTruthy());
    expect(container.querySelector('[data-asr-short]')).toBeTruthy();
  });

  /**
   * The rule the whole screen exists for: a question is not a record. Nothing
   * reaches the majlis until the reciter has said yes to it.
   */
  it('writes nothing into the majlis merely by asking', async () => {
    const { container, onChange } = await reciteThenStop(recited(1, 3));
    await waitFor(() => expect(container.querySelector('[data-matn-review]')).toBeTruthy());
    const wrote = onChange.mock.calls
      .map(c => c[0] as MatnSession)
      .filter(s => s.notes.length > 0);
    expect(wrote).toHaveLength(0);
  });

  it('can be closed, and takes its questions with it', async () => {
    const { container } = await reciteThenStop(recited(1, 3));
    await waitFor(() => expect(container.querySelector('[data-matn-review]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-review-close]')!);
    await waitFor(() => expect(container.querySelector('[data-matn-review]')).toBeNull());
  });
});
