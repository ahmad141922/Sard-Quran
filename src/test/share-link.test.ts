import { describe, it, expect, beforeEach } from 'vitest';

import {
  DEFAULT_EXPIRY_DAYS, SHARE_PAGE_URL, hasExpired, openReport, parseShareHash, sealReport,
  shareUrl,
} from '@/lib/share-link';
import {
  fetchSealed, memoryShareStore, putSealed, setShareStore,
} from '@/lib/share-store';

/**
 * The claim this whole design rests on: the host stores bytes it cannot read.
 * Several of the tests below exist only to keep that true — if the key ever
 * ends up outside the fragment, they fail.
 */

const REPORT = {
  student: 'محمّد',
  amount: '٣ أجزاء من القرآن الكريم',
  minutes: 22,
  notes: [{ kind: 'memory', ref: '2:21' }],
};

describe('sealing a report', () => {
  it('comes back exactly as it went in', async () => {
    const sealed = await sealReport(REPORT);
    expect(await openReport(sealed.payload, sealed.key)).toEqual(REPORT);
  });

  /** The one thing that must never be true. */
  it('leaves nothing readable in what the host receives', async () => {
    const sealed = await sealReport(REPORT);
    expect(sealed.payload).not.toContain('محمّد');
    expect(sealed.payload).not.toContain('22');
    // The key is returned to the caller, never folded into the payload.
    expect(sealed.payload).not.toContain(sealed.key);
  });

  it('draws the id and the key separately, so neither yields the other', async () => {
    const sealed = await sealReport(REPORT);
    expect(sealed.id).not.toBe(sealed.key);
    expect(sealed.key.length).toBeGreaterThan(sealed.id.length);
  });

  it('never repeats an id or a key', async () => {
    const a = await sealReport(REPORT);
    const b = await sealReport(REPORT);
    expect(a.id).not.toBe(b.id);
    expect(a.key).not.toBe(b.key);
    // Same plaintext, different ciphertext — the IV is fresh each time.
    expect(a.payload).not.toBe(b.payload);
  });

  it('refuses the wrong key rather than yielding rubbish', async () => {
    const sealed = await sealReport(REPORT);
    const other = await sealReport(REPORT);
    expect(await openReport(sealed.payload, other.key)).toBeNull();
  });

  /** AES-GCM authenticates: an altered byte fails, it does not decrypt oddly. */
  it('refuses a payload that was tampered with', async () => {
    const sealed = await sealReport(REPORT);
    const broken = sealed.payload.slice(0, -4) + 'AAAA';
    expect(await openReport(broken, sealed.key)).toBeNull();
  });

  it('refuses a truncated link', async () => {
    const sealed = await sealReport(REPORT);
    expect(await openReport(sealed.payload.slice(0, 20), sealed.key)).toBeNull();
  });

  it('dies on its own, a month out by default', async () => {
    const now = 1_700_000_000_000;
    const sealed = await sealReport(REPORT, undefined, now);
    expect(sealed.expiresAt).toBe(now + DEFAULT_EXPIRY_DAYS * 86_400_000);
    expect(hasExpired(sealed.expiresAt, now)).toBe(false);
    expect(hasExpired(sealed.expiresAt, sealed.expiresAt + 1)).toBe(true);
  });
});

describe('the link', () => {
  it('carries the key in the fragment, never in the query', async () => {
    const sealed = await sealReport(REPORT);
    const url = shareUrl(sealed);
    const [before, fragment] = url.split('#');

    // Everything the server sees is to the left of the hash.
    expect(before).toBe(SHARE_PAGE_URL);
    expect(before).not.toContain(sealed.key);
    expect(before).not.toContain(sealed.id);
    expect(fragment).toContain(sealed.key);
  });

  it('reads its own link back', async () => {
    const sealed = await sealReport(REPORT);
    const parsed = parseShareHash(new URL(shareUrl(sealed)).hash);
    expect(parsed).toEqual({ id: sealed.id, key: sealed.key });
  });

  /**
   * An id without a key is a record nobody can read — and asking the host for
   * it would tell the host that somebody tried.
   */
  it('refuses half a link rather than asking the host about it', () => {
    expect(parseShareHash('#justanid')).toBeNull();
    expect(parseShareHash('#')).toBeNull();
    expect(parseShareHash('')).toBeNull();
  });
});

describe('the store', () => {
  beforeEach(() => setShareStore(memoryShareStore()));

  it('gives back what it was given', async () => {
    const sealed = await sealReport(REPORT);
    await putSealed({ id: sealed.id, payload: sealed.payload, expiresAt: sealed.expiresAt });
    const row = await fetchSealed(sealed.id);
    expect(await openReport(row!.payload, sealed.key)).toEqual(REPORT);
  });

  it('knows nothing about an id it was never given', async () => {
    expect(await fetchSealed('nothing-here')).toBeNull();
  });

  /**
   * Checked on the way out, not left to a sweep that may not have run: a link
   * is meant to stop working on the day it says it will.
   */
  it('refuses a row whose link has expired, even while the bytes remain', async () => {
    const now = 1_700_000_000_000;
    const sealed = await sealReport(REPORT, 1, now);
    await putSealed({ id: sealed.id, payload: sealed.payload, expiresAt: sealed.expiresAt });

    expect(await fetchSealed(sealed.id, now)).not.toBeNull();
    expect(await fetchSealed(sealed.id, sealed.expiresAt + 1)).toBeNull();
  });
});
