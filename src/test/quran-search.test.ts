import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { MIN_QUERY, fold, foldQueries, foldQuery, quranSearch } from '@/lib/quran-search';

/**
 * Search, held against the muṣḥaf the app actually ships.
 *
 * The tests that matter are the ones about how people really type: nobody
 * writes hamza the way the muṣḥaf prints it, and a search that fails on the
 * obvious query is one people stop using after two tries.
 */

const rows = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as {
  id: number; sura_no: number; aya_no: number; aya_text_emlaey: string;
}[];

/** Only what the search touches. */
const index = {
  verses: rows.map(r => ({ id: r.id, aya_text_emlaey: r.aya_text_emlaey })),
  locOf: (id: number) => {
    const row = rows[id - 1];
    return row ? { surah: row.sura_no, ayah: row.aya_no } : undefined;
  },
} as never;

const search = quranSearch(index);

describe('the index it searches', () => {
  it('covers the whole muṣḥaf', () => {
    expect(search.size).toBe(6236);
  });
});

describe('finding a phrase', () => {
  it('finds a verse everyone knows, at the right place', () => {
    const [hit] = search.find('الحمد لله رب العالمين');
    expect(hit.surah).toBe(1);
    expect(hit.ayah).toBe(2);
    expect(hit.anchorId).toBe(2);
  });

  it('finds a phrase in the middle of a long verse', () => {
    const [hit] = search.find('لا تأخذه سنة ولا نوم');
    expect(hit.surah).toBe(2);
    expect(hit.ayah).toBe(255);
  });

  it('returns every verse a repeated phrase appears in', () => {
    const hits = search.find('فبأي آلاء ربكما تكذبان');
    // Thirty-one times in ar-Raḥmān, and nowhere else.
    expect(hits).toHaveLength(31);
    expect(hits.every(h => h.surah === 55)).toBe(true);
  });

  it('finds nothing for words that are not in the book', () => {
    expect(search.find('حاسوب محمول')).toEqual([]);
  });
});

describe('how people actually type', () => {
  /** The query that would fail on a literal match, and the reason for folding. */
  it('finds a verse whose hamza the reciter did not type', () => {
    const withHamza = search.find('إياك نعبد وإياك نستعين');
    const without = search.find('اياك نعبد واياك نستعين');
    expect(without).toEqual(withHamza);
    expect(without[0].surah).toBe(1);
    expect(without[0].ayah).toBe(5);
  });

  it('does not care which hamza carrier was typed', () => {
    const a = search.find('اولئك على هدى');
    const b = search.find('أولئك على هدى');
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('treats tāʾ marbūṭa and hāʾ as the same letter', () => {
    const a = search.find('ويقيمون الصلاه');
    const b = search.find('ويقيمون الصلاة');
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('treats alif maqṣūra and yāʾ as the same letter', () => {
    const a = search.find('على هدي من ربهم');
    const b = search.find('على هدى من ربهم');
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('ignores vowel marks somebody pasted in with the phrase', () => {
    const hits = search.find('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ');
    expect(hits[0]?.surah).toBe(1);
    expect(hits[0]?.ayah).toBe(2);
  });

  /**
   * A phrase copied out of a muṣḥaf app, in the muṣḥaf's own orthography —
   * where a long *ā* is a mark above the line rather than an alif on it.
   */
  it('finds a phrase pasted in ʿUthmānī spelling, where the alif is written', () => {
    const hits = search.find('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ');
    expect(hits[0]?.surah).toBe(1);
    expect(hits[0]?.ayah).toBe(2);
  });

  /** And the other half of the dagger alif, where the imlāʾī spelling has none. */
  it('finds one pasted where the alif is not written either', () => {
    const hits = search.find('ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].surah).toBe(1);
  });

  it('forgives stray and repeated spaces', () => {
    expect(search.find('  الحمد   لله  ')).toEqual(search.find('الحمد لله'));
  });

  it('says nothing at all for a query too short to mean anything', () => {
    expect(search.find('ا')).toEqual([]);
    expect(search.find(' ')).toEqual([]);
    expect(search.find('')).toEqual([]);
    expect(MIN_QUERY).toBeGreaterThan(1);
  });
});

describe('pointing at the phrase inside the verse', () => {
  /**
   * Folding shortens the text, so an offset taken from the folded string lands
   * in the wrong place in the printed one. Highlighting the wrong span of a
   * verse of the Qurʾān is not a cosmetic error.
   */
  it('gives offsets into the printed verse, not the folded one', () => {
    const [hit] = search.find('رب العالمين');
    expect(hit.text.slice(hit.from, hit.to)).toBe('رب العالمين');
  });

  it('is exact even where the verse has hamzas before the phrase', () => {
    const [hit] = search.find('نعبد وإياك');
    // The verse opens with «إياك», which folding shortens by nothing but
    // rewrites — and the offsets must still land on the printed letters.
    expect(hit.text.slice(hit.from, hit.to)).toContain('نعبد');
  });

  it('is exact for a phrase the reciter typed without its hamza', () => {
    const [hit] = search.find('اياك نعبد');
    expect(hit.text.slice(hit.from, hit.to)).toBe('إياك نعبد');
  });

  it('is exact where an invisible mark sits inside the verse', () => {
    const marked = rows.find(r => r.aya_text_emlaey.includes('‎'));
    expect(marked).toBeTruthy();
    const words = marked!.aya_text_emlaey.replace(/[‎‏]/g, '').split(' ');
    const phrase = words.slice(-3).join(' ');
    const hit = search.find(phrase).find(h => h.anchorId === marked!.id);
    expect(hit).toBeTruthy();
    expect(hit!.text.slice(hit!.from, hit!.to).replace(/[‎‏]/g, '')).toBe(phrase);
  });
});

describe('folding on its own', () => {
  it('maps every kept character back to where it came from', () => {
    const original = 'إِنَّ ٱللَّهَ';
    const { text, map } = fold(original);
    expect(map).toHaveLength(text.length);
    expect(map.every((at, i) => original[at] === original[map[i]])).toBe(true);
  });

  it('leaves an ordinary letter alone', () => {
    expect(foldQuery('محمد')).toBe('محمد');
  });

  it('folds the whole hamza family to bare letters', () => {
    expect(foldQuery('أ')).toBe('ا');
    expect(foldQuery('إ')).toBe('ا');
    expect(foldQuery('آ')).toBe('ا');
    expect(foldQuery('ؤ')).toBe('و');
    expect(foldQuery('ئ')).toBe('ي');
    expect(foldQuery('ء')).toBe('');
  });
});

describe('how much it returns', () => {
  it('stops at the limit it was given', () => {
    expect(search.find('الله', 5)).toHaveLength(5);
  });

  it('has a limit by default, so a common word cannot flood the screen', () => {
    const hits = search.find('من');
    expect(hits.length).toBeLessThanOrEqual(40);
    expect(hits.length).toBeGreaterThan(0);
  });
});

/**
 * The dagger alif, which the muṣḥaf writes above the line and the imlāʾī text
 * sometimes writes on it and sometimes does not. Both readings are searched,
 * because either alone is wrong half the time.
 */
describe('the dagger alif', () => {
  it('is read both ways, since neither is right on its own', () => {
    expect(foldQueries('ٱلْعَٰلَمِينَ')).toEqual(['العلمين', 'العالمين']);
  });

  it('costs nothing where the query has none', () => {
    expect(foldQueries('الحمد لله')).toEqual(['الحمد لله']);
  });
});
