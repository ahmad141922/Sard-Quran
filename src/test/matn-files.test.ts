import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

import { MATN_IDS, MATN_REGISTRY } from '@/lib/matn/registry';
import { matnFromFile } from '@/lib/matn/load';

/**
 * The texts the app actually ships, put through the loader that guards them.
 *
 * A matn is recited from memory against what is on the screen. A line dropped
 * in transit, a chapter that does not cover the lines it claims, a numbering
 * that skips — each of those turns «you missed bayt 34» into a sentence about
 * a different bayt. The loader refuses all of them; these tests are what say
 * the shipped files pass rather than that the loader compiles.
 */

const file = (id: string) => `sard/public/matn-${id}.json`;
const read = (id: string) => JSON.parse(readFileSync(file(id), 'utf8'));

describe('every matn in the registry ships a file', () => {
  it.each(MATN_IDS)('%s', id => {
    expect(existsSync(file(id))).toBe(true);
  });
});

describe.each(MATN_IDS)('%s', id => {
  const raw = read(id);
  const def = MATN_REGISTRY[id];

  it('agrees with the registry on how many abyāt there are', () => {
    expect(raw.totalAbyat).toBe(def.totalAbyat);
    expect(raw.abyat).toHaveLength(def.totalAbyat);
  });

  it('agrees with the registry on how many abwāb there are', () => {
    expect(raw.abwab).toHaveLength(def.totalAbwab);
  });

  it('numbers its abyāt from one, in order, with none missing', () => {
    expect(raw.abyat.map((b: { n: number }) => b.n))
      .toEqual(Array.from({ length: raw.totalAbyat }, (_, i) => i + 1));
  });

  /** A bayt is two halves. One half is a line somebody cannot recite against. */
  it('gives every bayt both of its halves', () => {
    for (const bayt of raw.abyat as { n: number; sadr: string; ajz: string }[]) {
      expect(bayt.sadr.trim(), `bayt ${bayt.n} sadr`).not.toBe('');
      expect(bayt.ajz.trim(), `bayt ${bayt.n} ajz`).not.toBe('');
    }
  });

  /**
   * The abwāb must tile the poem exactly: a gap loses lines from every
   * chapter view, and an overlap puts one line in two chapters.
   */
  it('has abwāb that cover every bayt exactly once', () => {
    const seen = new Map<number, number>();
    for (const bab of raw.abwab as { n: number; from: number; to: number }[]) {
      expect(bab.to, `bab ${bab.n}`).toBeGreaterThanOrEqual(bab.from);
      for (let n = bab.from; n <= bab.to; n++) {
        expect(seen.has(n), `bayt ${n} in two abwāb`).toBe(false);
        seen.set(n, bab.n);
      }
    }
    expect(seen.size).toBe(raw.totalAbyat);
    expect([...seen.keys()].sort((a, b) => a - b))
      .toEqual(Array.from({ length: raw.totalAbyat }, (_, i) => i + 1));
  });

  it('names each bāb in both languages', () => {
    for (const bab of raw.abwab as { titleAr: string; titleEn: string }[]) {
      expect(bab.titleAr.trim()).not.toBe('');
      expect(bab.titleEn.trim()).not.toBe('');
    }
  });

  it('puts every bayt in the bāb its own number falls in', () => {
    for (const bayt of raw.abyat as { n: number; bab: number }[]) {
      const bab = raw.abwab.find((b: { n: number }) => b.n === bayt.bab);
      expect(bab, `bayt ${bayt.n} names bāb ${bayt.bab}`).toBeTruthy();
      expect(bayt.n).toBeGreaterThanOrEqual(bab.from);
      expect(bayt.n).toBeLessThanOrEqual(bab.to);
    }
  });

  /**
   * The last gate, and the reason both texts sit finished but unoffered: the
   * loader reads the edition from the **registry**, not from the file, so no
   * data drop can talk its way past it. A note on «bayt 34» means nothing
   * until somebody can say whose bayt 34.
   *
   * When an edition is named this flips to loading, and every check above
   * already says the file behind it is sound.
   */
  it('is refused by the loader for exactly one reason: no edition named', () => {
    const named = !!def.editionAr && !!def.editionEn;
    if (named) {
      expect(() => matnFromFile(raw)).not.toThrow();
      return;
    }
    expect(() => matnFromFile(raw)).toThrow(/edition/i);
  });
});
