import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import AsrSuggestions from '@/components/board/AsrSuggestions';
import { reviewRecitation, answer } from '@/lib/asr/review';
import type { ExpectedPhoneme, HeardPhoneme } from '@/lib/asr/align';

/**
 * The screen where the boundary is actually kept. The tests that matter are
 * the ones about what it will not do: show findings from a recording it could
 * not follow, or let anything reach the session without being pressed.
 */

const expect_ = (symbols: string, anchorId = 100): ExpectedPhoneme[] =>
  symbols.split(' ').map((symbol, i) => ({ symbol, anchorId, word: Math.floor(i / 3) }));
const heard_ = (symbols: string): HeardPhoneme[] =>
  symbols.split(' ').map((symbol, i) => ({ symbol, confidence: 0.95, atMs: i * 100 }));

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

const label = (anchorId: number) => `البقرة ${anchorId}`;
const noop = () => undefined;

afterEach(cleanup);

describe('when the recording could not be followed', () => {
  it('says so, and shows no candidates at all', () => {
    const review = reviewRecitation(expect_('a b c d e f g h'), heard_('x y z w v u t s'), 9000, { minSounds: 0 });
    const { container } = wrap(
      <AsrSuggestions review={review} label={label} onAccept={noop} onDismiss={noop} />,
    );
    expect(container.querySelector('[data-asr-unclear]')).toBeTruthy();
    expect(container.querySelector('[data-asr-candidate]')).toBeNull();
    expect(container.querySelectorAll('[data-asr-accept]')).toHaveLength(0);
  });
});

describe('when the recitation was clean', () => {
  it('says nothing was noticed, and still asks for a human review', () => {
    const review = reviewRecitation(expect_('a b c d e f'), heard_('a b c d e f'), 9000, { minSounds: 0 });
    const { container } = wrap(
      <AsrSuggestions review={review} label={label} onAccept={noop} onDismiss={noop} />,
    );
    expect(container.querySelector('[data-asr-clean]')).toBeTruthy();
    expect(container.textContent).toContain('وراجِعْ بنفسك');
  });
});

describe('putting a place to the reciter', () => {
  const review = () => reviewRecitation(expect_('a b c d e f'), heard_('a b x y e f'), 9000, { minSounds: 0 });

  it('names the place and the verse it is in', () => {
    const { container } = wrap(
      <AsrSuggestions
        review={review()} label={label}
        textOf={() => 'الم ذلك الكتاب لا ريب فيه'}
        onAccept={noop} onDismiss={noop}
      />,
    );
    expect(container.querySelector('[data-asr-candidate]')).toBeTruthy();
    expect(container.textContent).toContain('البقرة 100');
    expect(container.querySelector('[data-ayah-text]')!.textContent).toContain('ذلك الكتاب');
  });

  it('offers both answers, and reports which was pressed', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const r = review();
    const { container } = wrap(
      <AsrSuggestions review={r} label={label} onAccept={onAccept} onDismiss={onDismiss} />,
    );

    fireEvent.click(container.querySelector('[data-asr-accept]')!);
    expect(onAccept).toHaveBeenCalledWith(r.candidates[0]);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('[data-asr-dismiss]')!);
    expect(onDismiss).toHaveBeenCalledWith(r.candidates[0]);
  });

  /**
   * The sentences the model's own card asks for, and the one about what it is
   * deaf to — so silence about tafkhīm is never read as approval.
   */
  it('says it is not a teacher, and names what it cannot hear', () => {
    const { container } = wrap(
      <AsrSuggestions review={review()} label={label} onAccept={noop} onDismiss={noop} />,
    );
    const caveat = container.querySelector('[data-asr-caveat]')!.textContent!;
    expect(caveat).toContain('لا حكمُ شيخ');
    expect(caveat).toContain('التفخيم');
    expect(caveat).toContain('المدّ');
  });

  it('offers to hear the moment only when the recording can be played', () => {
    const bare = wrap(<AsrSuggestions review={review()} label={label} onAccept={noop} onDismiss={noop} />);
    expect(bare.container.querySelector('[data-asr-play]')).toBeNull();
    cleanup();

    const onPlay = vi.fn();
    const { container } = wrap(
      <AsrSuggestions review={review()} label={label} onAccept={noop} onDismiss={noop} onPlay={onPlay} />,
    );
    fireEvent.click(container.querySelector('[data-asr-play]')!);
    expect(onPlay).toHaveBeenCalledWith(200);
  });
});

describe('as the reciter works through them', () => {
  const two = () => reviewRecitation(
    expect_('a b c d e f g h i j'), heard_('x x c d e f y y i j'), 9000, { minSounds: 0 },
  );

  it('drops a place once it has been answered', () => {
    const r = two();
    const { container, rerender } = wrap(
      <AsrSuggestions review={r} label={label} onAccept={noop} onDismiss={noop} />,
    );
    expect(container.querySelectorAll('[data-asr-candidate]')).toHaveLength(2);

    rerender(
      <I18nProvider forceLang="ar">
        <AsrSuggestions
          review={answer(r, r.candidates[0].id, 'accepted')}
          label={label} onAccept={noop} onDismiss={noop}
        />
      </I18nProvider>,
    );
    expect(container.querySelectorAll('[data-asr-candidate]')).toHaveLength(1);
  });

  /**
   * «The recording noticed nothing», said after the reciter has just answered
   * two places, is untrue — and it is the first thing that confused a real
   * reciter using this. A list that has been worked through says so, and says
   * what came of it.
   */
  it('says the places were answered, not that there were none', () => {
    const r = two();
    const done = answer(answer(r, r.candidates[0].id, 'dismissed'), r.candidates[1].id, 'accepted');
    const { container } = wrap(
      <AsrSuggestions review={done} label={label} onAccept={noop} onDismiss={noop} />,
    );
    expect(container.querySelector('[data-asr-candidate]')).toBeNull();
    expect(container.querySelector('[data-asr-clean]')).toBeNull();
    expect(container.querySelector('[data-asr-answered]')).toBeTruthy();
    expect(container.textContent).toContain('1');
  });

  it('says plainly when the reciter kept none of them', () => {
    const r = two();
    const none = answer(answer(r, r.candidates[0].id, 'dismissed'), r.candidates[1].id, 'dismissed');
    const { container } = wrap(
      <AsrSuggestions review={none} label={label} onAccept={noop} onDismiss={noop} />,
    );
    expect(container.querySelector('[data-asr-answered]')).toBeTruthy();
    expect(container.textContent).toContain('لم يُسجَّل');
  });

  /** And a genuinely clean recitation still gets the message meant for it. */
  it('keeps the clean message for a recording that noticed nothing at all', () => {
    const clean = reviewRecitation(expect_('a b c d e f'), heard_('a b c d e f'), 9000, { minSounds: 0 });
    const { container } = wrap(
      <AsrSuggestions review={clean} label={label} onAccept={noop} onDismiss={noop} />,
    );
    expect(container.querySelector('[data-asr-clean]')).toBeTruthy();
    expect(container.querySelector('[data-asr-answered]')).toBeNull();
  });

  /** Offered only where it saves presses. */
  it('offers «the rest was fine» for more than one place, not for a single one', () => {
    const many = wrap(
      <AsrSuggestions review={two()} label={label} onAccept={noop} onDismiss={noop} onDismissRest={noop} />,
    );
    expect(many.container.querySelector('[data-asr-dismiss-rest]')).toBeTruthy();
    cleanup();

    const one = reviewRecitation(expect_('a b c d e f'), heard_('a b x y e f'), 9000, { minSounds: 0 });
    const { container } = wrap(
      <AsrSuggestions review={one} label={label} onAccept={noop} onDismiss={noop} onDismissRest={noop} />,
    );
    expect(container.querySelector('[data-asr-dismiss-rest]')).toBeNull();
  });
});

/**
 * Naming the word, now that the index can.
 *
 * It could not before: boundaries taken from the phonetic transcription agreed
 * with the printed verse 34% of the time. From the per-sound word index they
 * agree 98.5%, and the 94 āyāt that still do not are reported as `word: null`
 * — which is what this screen falls back on.
 */
describe('pointing at the word', () => {
  const words = ['ذلك', 'الكتاب', 'لا', 'ريب', 'فيه'];
  const at = (word: number | null) => {
    const r = reviewRecitation(expect_('a b c d e f'), heard_('a b x y e f'), 9000, { minSounds: 0 });
    return { ...r, candidates: r.candidates.map(c => ({ ...c, word })) };
  };

  it('shows the word itself when the verse has known boundaries', () => {
    const { container } = wrap(
      <AsrSuggestions
        review={at(3)} label={label}
        textOf={() => words.join(' ')} wordsOf={() => words}
        onAccept={noop} onDismiss={noop}
      />,
    );
    expect(container.querySelector('[data-ayah-word]')!.textContent).toBe('ريب');
    expect(container.querySelector('[data-ayah-text]')).toBeNull();
  });

  /** The 94 āyāt whose boundaries could not be checked — the verse, whole. */
  it('falls back to the whole verse where the word is not known', () => {
    const { container } = wrap(
      <AsrSuggestions
        review={at(null)} label={label}
        textOf={() => words.join(' ')} wordsOf={() => words}
        onAccept={noop} onDismiss={noop}
      />,
    );
    expect(container.querySelector('[data-ayah-word]')).toBeNull();
    expect(container.querySelector('[data-ayah-text]')!.textContent).toBe(words.join(' '));
  });

  /** A matn has no word list at all, and must not lose its verse for it. */
  it('falls back to the whole verse where no words were supplied', () => {
    const { container } = wrap(
      <AsrSuggestions
        review={at(3)} label={label}
        textOf={() => words.join(' ')}
        onAccept={noop} onDismiss={noop}
      />,
    );
    expect(container.querySelector('[data-ayah-text]')).toBeTruthy();
  });

  /** An index past the end is a bug somewhere; it must not print undefined. */
  it('falls back rather than pointing past the end of the verse', () => {
    const { container } = wrap(
      <AsrSuggestions
        review={at(99)} label={label}
        textOf={() => words.join(' ')} wordsOf={() => words}
        onAccept={noop} onDismiss={noop}
      />,
    );
    expect(container.querySelector('[data-ayah-word]')).toBeNull();
    expect(container.querySelector('[data-ayah-text]')).toBeTruthy();
  });
});
