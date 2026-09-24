import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import ShareReportButton, { type SharedReport } from '@/components/board/ShareReportButton';
import SharedReportView from '@/components/board/SharedReportView';
import { memoryShareStore, setShareStore, type StoredReport } from '@/lib/share-store';
import { parseShareHash } from '@/lib/share-link';

/**
 * The end-to-end claim, exercised: a report goes in one side as a link and
 * comes out the other as a report, and what the store held in between was
 * unreadable.
 */

vi.mock('@/lib/share-store-supabase', () => ({
  installShareStore: async () => true,
  shareBackendReady: async () => true,
  supabaseShareStore: () => memoryShareStore(),
}));

const REPORT: SharedReport = {
  student: 'محمّد',
  instructor: 'الشيخ محمود',
  amount: '٣ أجزاء من القرآن الكريم',
  minutes: 22,
  at: 1_700_000_000_000,
  places: [{
    label: 'البقرة ٢١', kinds: ['خطأ حفظ'], detail: 'اختلط عليه',
    text: 'وإن كنتم في ريب مما نزلنا على عبدنا',
  }],
};

/** A store that also records everything it was handed, for inspection. */
function spyingStore() {
  const inner = memoryShareStore();
  const seen: StoredReport[] = [];
  setShareStore({
    async put(r) { seen.push(r); await inner.put(r); },
    get: id => inner.get(id),
  });
  return seen;
}

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

let seen: StoredReport[];
beforeEach(() => { seen = spyingStore(); });
afterEach(cleanup);

describe('sharing a report', () => {
  it('produces a link', async () => {
    const { container } = wrap(<ShareReportButton report={REPORT} />);
    await waitFor(() => expect(container.querySelector('[data-share-button]')).toBeTruthy());

    fireEvent.click(container.querySelector('[data-share-button]')!);
    await waitFor(() => expect(container.querySelector('[data-share-link]')).toBeTruthy());

    const link = (container.querySelector('[data-share-link]') as HTMLInputElement).value;
    expect(parseShareHash(new URL(link).hash)).not.toBeNull();
  });

  /** The claim the whole design rests on. */
  it('hands the store nothing it can read, and never the key', async () => {
    const { container } = wrap(<ShareReportButton report={REPORT} />);
    await waitFor(() => expect(container.querySelector('[data-share-button]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-share-button]')!);
    await waitFor(() => expect(seen).toHaveLength(1));

    const link = (container.querySelector('[data-share-link]') as HTMLInputElement).value;
    const { key } = parseShareHash(new URL(link).hash)!;

    const stored = JSON.stringify(seen[0]);
    expect(stored).not.toContain('محمّد');
    expect(stored).not.toContain('الشيخ محمود');
    expect(stored).not.toContain('البقرة');
    expect(stored).not.toContain('وإن كنتم');
    expect(stored).not.toContain(key);
  });

  it('says the report is still safe locally when sharing fails', async () => {
    setShareStore({
      async put() { throw new Error('offline'); },
      async get() { return null; },
    });
    const { container } = wrap(<ShareReportButton report={REPORT} />);
    await waitFor(() => expect(container.querySelector('[data-share-button]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-share-button]')!);
    await waitFor(() => expect(container.querySelector('[data-share-failed]')).toBeTruthy());
  });
});

describe('opening a shared link', () => {
  const shareThenOpen = async () => {
    const share = wrap(<ShareReportButton report={REPORT} />);
    await waitFor(() => expect(share.container.querySelector('[data-share-button]')).toBeTruthy());
    fireEvent.click(share.container.querySelector('[data-share-button]')!);
    await waitFor(() => expect(share.container.querySelector('[data-share-link]')).toBeTruthy());
    const link = (share.container.querySelector('[data-share-link]') as HTMLInputElement).value;
    cleanup();
    return wrap(<SharedReportView hash={new URL(link).hash} />);
  };

  it('shows the report the link was made from', async () => {
    const { container } = await shareThenOpen();
    await waitFor(() => expect(container.querySelector('[data-shared-report]')).toBeTruthy());
    expect(container.textContent).toContain('محمّد');
    expect(container.textContent).toContain('٣ أجزاء من القرآن الكريم');
    expect(container.querySelector('[data-place]')!.textContent).toContain('البقرة ٢١');
    // The words travel with the link, so the reader can review from it.
    expect(container.querySelector('[data-ayah-text]')!.textContent)
      .toContain('وإن كنتم في ريب');
  });

  /**
   * A bad key, a bad id and an expired row all end in one sentence: telling
   * somebody which part they got wrong only helps somebody guessing.
   */
  it('says the same thing for every kind of broken link', async () => {
    for (const hash of ['#nothing.here', '#justanid', '', '#.']) {
      const { container } = wrap(<SharedReportView hash={hash} />);
      await waitFor(() => expect(container.querySelector('[data-bad-link]')).toBeTruthy());
      cleanup();
    }
  });

  it('refuses a link whose key was altered', async () => {
    const share = wrap(<ShareReportButton report={REPORT} />);
    await waitFor(() => expect(share.container.querySelector('[data-share-button]')).toBeTruthy());
    fireEvent.click(share.container.querySelector('[data-share-button]')!);
    await waitFor(() => expect(share.container.querySelector('[data-share-link]')).toBeTruthy());
    const link = (share.container.querySelector('[data-share-link]') as HTMLInputElement).value;
    cleanup();

    const { id } = parseShareHash(new URL(link).hash)!;
    const { container } = wrap(<SharedReportView hash={`#${id}.YWJjZGVmZ2hpamtsbW5vcA`} />);
    await waitFor(() => expect(container.querySelector('[data-bad-link]')).toBeTruthy());
  });
});
