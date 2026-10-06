import { describe, it, expect } from 'vitest';

import { asrSupportsRiwaya } from '@/lib/asr/engine';
import { MUSHAF_REGISTRY } from '@/lib/mushaf/registry';

/**
 * The phoneme index is Ḥafṣ. A recitation in another riwāya is never checked
 * against it — every legitimate difference would read as a slip.
 */
describe('which riwāyāt the recogniser checks', () => {
  it('checks every Ḥafṣ muṣḥaf the app ships', () => {
    const hafs = MUSHAF_REGISTRY.filter(m => m.riwayaId === 'hafs');
    expect(hafs.length).toBeGreaterThan(0);
    for (const m of hafs) expect(asrSupportsRiwaya(m.riwayaId)).toBe(true);
  });

  it('checks no other riwāya', () => {
    const others = MUSHAF_REGISTRY.filter(m => m.riwayaId !== 'hafs');
    expect(others.map(m => m.riwayaId)).toEqual(expect.arrayContaining(['warsh', 'qalun']));
    for (const m of others) expect(asrSupportsRiwaya(m.riwayaId)).toBe(false);
  });
});
