import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { anyMatnReady, useMatns } from '@/lib/matn/use-matns';
import { MATN_IDS } from '@/lib/matn/registry';

/**
 * When the matn texts are fetched, and when they are not.
 *
 * Seven poems, two of them a thousand-odd abyāt, come to about 150 KB
 * compressed. Most sittings are muṣḥaf sittings and never open a matn at all,
 * so fetching them to decide whether to draw one button would charge every
 * reciter for a feature they did not ask for. The entry is decided from the
 * registry, which is already in the bundle, and the texts are fetched when one
 * is actually wanted.
 */

const fetched: string[] = [];

beforeEach(() => {
  fetched.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetched.push(String(url));
    const id = String(url).match(/matn-([a-z]+)\.json/)?.[1];
    const body = readFileSync(`sard/public/matn-${id}.json`, 'utf8');
    return { ok: true, json: async () => JSON.parse(body) } as unknown as Response;
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('deciding whether to offer matns at all', () => {
  it('answers from the registry, without a single request', () => {
    expect(anyMatnReady()).toBe(true);
    expect(fetched).toHaveLength(0);
  });
});

describe('fetching the texts', () => {
  it('fetches nothing until a matn is wanted', async () => {
    const { result } = renderHook(() => useMatns(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetched).toHaveLength(0);
    expect(result.current.matns).toHaveLength(0);
  });

  it('fetches every matn once one is wanted', async () => {
    const { result } = renderHook(() => useMatns(true));
    await waitFor(() => expect(result.current.matns).toHaveLength(MATN_IDS.length));
    expect(new Set(fetched).size).toBe(MATN_IDS.length);
  });

  /** Opening the screen twice is not a reason to download them twice. */
  it('does not fetch them again once it has them', async () => {
    const { result, rerender } = renderHook(({ on }) => useMatns(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.matns).toHaveLength(MATN_IDS.length));
    const first = fetched.length;

    rerender({ on: false });
    rerender({ on: true });
    await waitFor(() => expect(result.current.matns).toHaveLength(MATN_IDS.length));
    expect(fetched).toHaveLength(first);
  });

  /**
   * A matn whose file the deploy dropped is left out rather than offered, and
   * the rest still load — one bad file must not take the feature down.
   */
  it('leaves out one whose file is missing and keeps the others', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = String(url).match(/matn-([a-z]+)\.json/)?.[1];
      if (id === 'tuhfa') return { ok: false } as unknown as Response;
      const body = readFileSync(`sard/public/matn-${id}.json`, 'utf8');
      return { ok: true, json: async () => JSON.parse(body) } as unknown as Response;
    }));

    const { result } = renderHook(() => useMatns(true));
    await waitFor(() => expect(result.current.matns).toHaveLength(MATN_IDS.length - 1));
    expect(result.current.matns.map(m => m.id)).not.toContain('tuhfa');
  });
});
