import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import ReviewPlaces from '@/components/board/ReviewPlaces';
import SessionComparison from '@/components/board/SessionComparison';
import AchievementCard from '@/components/board/AchievementCard';
import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { addCorrection, addMark, makeCorrection } from '@/lib/recitation-session';
import { compareSessions, reviewPlaces, sessionFigures } from '@/lib/recitation-review';
import { indexFromFile } from '@/lib/mutashabihat';
import { addTag, clearTags } from '@/lib/place-tags';
import { SIMILAR_TAG } from '@/components/board/SimilarAyahs';
import { testBooks, type TestBooks } from './session-helpers';

afterEach(cleanup);

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, '../../public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
});

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

const figures = (notes: number, pages: number) => sessionFigures(
  { notes: Array.from({ length: notes }, () => books.note('memory', 10)) }, pages,
);

describe('the review list', () => {
  it('gathers everything at one verse onto one row', () => {
    let s = books.session({ goalKind: 'juz1', startAyahId: 8 });
    s = { ...s, notes: [books.note('memory', 10), books.note('memory', 10)] };
    s = addMark(s, books.at(10));
    s = addCorrection(s, makeCorrection(books.at(10), 3_000, 'c'));

    const { container } = wrap(
      <ReviewPlaces places={reviewPlaces(s, p => p.anchor.id)} label={() => 'البقرة ٣'} />,
    );
    expect(container.querySelectorAll('[data-place]')).toHaveLength(1);
    const row = container.querySelector('[data-place]')!;
    // Two of the same kind is one line about that verse, with a count.
    expect(row.textContent).toContain('خطأ حفظ ×2');
    expect(row.textContent).toContain('يحتاج مراجعة');
    expect(row.textContent).toContain('تصحيحات الشيخ');
  });

  it('shows what the teacher wrote, which is the useful part', () => {
    const note = { ...books.note('memory', 10), detail: 'اختلط عليه الموضع' };
    const s = { ...books.session({ goalKind: 'juz1', startAyahId: 8 }), notes: [note] };
    const { container } = wrap(
      <ReviewPlaces places={reviewPlaces(s, p => p.anchor.id)} label={() => 'x'} />,
    );
    expect(container.textContent).toContain('اختلط عليه الموضع');
  });

  it('draws nothing at all for a clean majlis', () => {
    const s = books.session({ goalKind: 'juz1', startAyahId: 8 });
    const { container } = wrap(
      <ReviewPlaces places={reviewPlaces(s, p => p.anchor.id)} label={() => 'x'} />,
    );
    expect(container.querySelector('[data-review-places]')).toBeNull();
  });
});

describe('the comparison', () => {
  it('calls a lower rate an improvement', () => {
    const { container } = wrap(
      <SessionComparison comparison={compareSessions(figures(4, 10), figures(12, 10))} />,
    );
    expect(container.querySelector('[data-direction]')!.getAttribute('data-direction')).toBe('better');
  });

  it('shows the two counts when the sessions were of a size', () => {
    const { container } = wrap(
      <SessionComparison comparison={compareSessions(figures(4, 10), figures(12, 10))} />,
    );
    expect(container.querySelector('[data-counts]')!.textContent).toContain('12');
  });

  /**
   * The whole point. «Last week 17, this week 8» across a juzʾ and three pages
   * is a triumph manufactured out of nothing, and the counts must not appear.
   */
  it('withholds the counts when the two are not comparable, and says why', () => {
    const { container } = wrap(
      <SessionComparison comparison={compareSessions(figures(2, 1), figures(17, 20))} />,
    );
    expect(container.querySelector('[data-counts]')).toBeNull();
    expect(container.querySelector('[data-not-comparable]')).toBeTruthy();
  });

  /**
   * Notes are weighted — a memorisation slip counts three — so one extra slip
   * over ten pages moves the rate by 0.3 and is a real change. It takes a
   * hundred pages for a single slip to fall under the threshold, which is
   * exactly the point: the noise floor is relative to how much was recited.
   */
  it('treats a hundredth of a fault per page as noise, not a trend', () => {
    const { container } = wrap(
      <SessionComparison comparison={compareSessions(figures(30, 100), figures(31, 100))} />,
    );
    expect(container.querySelector('[data-direction]')!.getAttribute('data-direction')).toBe('same');
  });

  it('but calls one extra slip over ten pages a real change', () => {
    const { container } = wrap(
      <SessionComparison comparison={compareSessions(figures(31, 10), figures(30, 10))} />,
    );
    expect(container.querySelector('[data-direction]')!.getAttribute('data-direction')).toBe('worse');
  });
});

describe('the achievement card', () => {
  const card = () => wrap(
    <AchievementCard
      studentName="محمّد"
      achievement={{ what: 'سورة الكهف', minutes: 22, toReview: 3 }}
      minutesLabel="٢٢ دقيقة"
    />,
  );

  it('says the one thing it is for', () => {
    const { container } = card();
    expect(container.textContent).toContain('سورة الكهف');
    expect(container.textContent).toContain('٢٢ دقيقة');
    expect(container.textContent).toContain('محمّد');
  });

  /**
   * It is not a certificate and must never read as one: no listener named, no
   * code, and not the word شهادة. Anything else would cheapen the real ones.
   */
  it('carries nothing that would make it look like a certificate', () => {
    const { container } = card();
    expect(container.textContent).not.toContain('شهادة');
    expect(container.textContent).not.toContain('نشهد');
    expect(container.querySelector('img')).toBeNull();
  });
});

/**
 * «البقرة ٢١» tells a student where to go; the words let them start there.
 * The guard that matters is the one that refuses to print words it is not
 * sure of.
 */
describe('the verse itself, in the review list', () => {
  const place = () => {
    const s = { ...books.session({ goalKind: 'juz1', startAyahId: 8 }), notes: [books.note('memory', 10)] };
    return reviewPlaces(s, p => p.anchor.id);
  };

  it('prints the words of the verse that was faulted', () => {
    const { container } = wrap(
      <ReviewPlaces
        places={place()}
        label={() => 'البقرة ٣'}
        textOf={p => index.verseById(p.anchor.id)?.aya_text_emlaey ?? null}
      />,
    );
    const text = container.querySelector('[data-ayah-text]');
    expect(text).toBeTruthy();
    expect(text!.textContent!.length).toBeGreaterThan(10);
  });

  /**
   * A Warsh position carried across approximately must show no text at all:
   * printing the Ḥafṣ verse at that number would be showing the student words
   * their teacher never pointed at.
   */
  it('prints nothing where the conversion was not exact', () => {
    const { container } = wrap(
      <ReviewPlaces places={place()} label={() => 'x'} textOf={() => null} />,
    );
    expect(container.querySelector('[data-ayah-text]')).toBeNull();
  });

  it('prints nothing at all when no text was offered', () => {
    const { container } = wrap(<ReviewPlaces places={place()} label={() => 'x'} />);
    expect(container.querySelector('[data-ayah-text]')).toBeNull();
  });

  it('uses the face the encoding needs, when one is named', () => {
    const { container } = wrap(
      <ReviewPlaces
        places={place()}
        label={() => 'x'}
        textOf={() => 'نصّ'}
        textFont="HafsSmartCanvas, HafsSmart, serif"
      />,
    );
    expect((container.querySelector('[data-ayah-text]') as HTMLElement).style.fontFamily)
      .toContain('HafsSmart');
  });
});

/**
 * The card answers a question the teacher asked; it does not volunteer an
 * opinion at every verse the algorithm finds a rhyme in.
 */
describe('similar passages, only where asked', () => {
  const similar = indexFromFile({
    meta: { attribution: [] },
    byAyah: { '1:1': [{ r: '31:4', t: 'one_word_change', s: 92 }] },
  });

  const draw = () => {
    const s = { ...books.session({ goalKind: 'juz1', startAyahId: 1 }), notes: [books.note('memory', 1)] };
    return wrap(
      <ReviewPlaces
        places={reviewPlaces(s, p => p.anchor.id)}
        label={() => 'الفاتحة ١'}
        similar={similar}
        canonicalOf={p => ({ surah: p.anchor.surah, ayah: p.anchor.ayah })}
        anchorOf={p => p.anchor.id}
      />,
    );
  };

  beforeEach(clearTags);

  it('says nothing about look-alikes on an untagged place', () => {
    const { container } = draw();
    expect(container.querySelector('[data-similar]')).toBeNull();
  });

  it('names them once the teacher has tagged it «متشابهات»', () => {
    addTag(1, SIMILAR_TAG);
    const { container } = draw();
    expect(container.querySelector('[data-similar]')).toBeTruthy();
    expect(container.querySelector('[data-similar-ref="31:4"]')).toBeTruthy();
  });

  it('stays quiet for a different tag', () => {
    addTag(1, 'وقف');
    const { container } = draw();
    expect(container.querySelector('[data-similar]')).toBeNull();
  });
});
