import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import AsrSuggestions from '@/components/board/AsrSuggestions';
import type { ReviewedCandidate } from '@/lib/asr/engine';
import type { AsrReview } from '@/lib/asr/review';

afterEach(cleanup);

const candidate = (over: Partial<ReviewedCandidate> = {}): ReviewedCandidate => ({
  id: 'c1', verdict: 'pending', kind: 'substitution', anchorId: 58, word: 1, atMs: 1200,
  expected: ['a'], heard: ['b'], confidence: null, ...over,
});
const review = (c: ReviewedCandidate): AsrReview => ({ followed: true, enough: true, agreement: 0.9, candidates: [c], durationMs: 9000 });

const mount = (c: ReviewedCandidate) => render(
  <I18nProvider forceLang="ar">
    <AsrSuggestions review={review(c)} label={() => 'البقرة 58'} onAccept={() => {}} onDismiss={() => {}} />
  </I18nProvider>,
);

describe('naming the verse a slip came from', () => {
  it('names it where the recording showed one', () => {
    const { container } = mount(candidate({ source: { surah: 7, ayah: 161, word: 0, score: 0.95 } }));
    const line = container.querySelector('[data-asr-source]');
    expect(line?.textContent).toContain('الأعراف');
    expect(line?.textContent).toContain('161');
  });

  it('says nothing extra where it did not', () => {
    expect(mount(candidate({ source: null })).container.querySelector('[data-asr-source]')).toBeNull();
    cleanup();
    expect(mount(candidate()).container.querySelector('[data-asr-source]')).toBeNull();
  });
});
