import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `t()` falls back to Arabic when a key is missing, so an untranslated string
 * ships silently. These tests read the source rather than the module because
 * the translations object is not exported.
 */
const SOURCE = readFileSync(resolve(process.cwd(), 'src/hooks/useI18n.tsx'), 'utf8');
const LANGS = ['ar', 'en', 'fr', 'de', 'es'] as const;

function blockOf(lang: string): string {
  const start = SOURCE.indexOf(`\n  ${lang}: {`);
  if (start < 0) throw new Error(`no ${lang} block`);
  const end = SOURCE.indexOf('\n  },', start);
  return SOURCE.slice(start, end);
}

function keysOf(lang: string): Set<string> {
  const keys = new Set<string>();
  for (const line of blockOf(lang).split('\n')) {
    const m = /^\s{4}([A-Za-z][A-Za-z0-9_]*)\s*:/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

describe('translation key parity', () => {
  const ar = keysOf('ar');

  it('finds the Arabic block', () => {
    expect(ar.size).toBeGreaterThan(400);
  });

  for (const lang of LANGS.filter(l => l !== 'ar')) {
    it(`${lang} defines every Arabic key`, () => {
      const missing = [...ar].filter(k => !keysOf(lang).has(k));
      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${lang} defines no key Arabic lacks`, () => {
      const extra = [...keysOf(lang)].filter(k => !ar.has(k));
      expect(extra, `${lang} has stray keys: ${extra.join(', ')}`).toEqual([]);
    });
  }
});

describe('recitation strings are written in fusha', () => {
  // Colloquial markers that must not reach material a teacher reads aloud.
  // Padded where the token is a substring of valid fusha words.
  const COLLOQUIAL = [' ليه ', ' إزاي', ' إيه ', 'عايز', 'دلوقتي', ' كده', ' مش ', ' بتاع', ' علشان', ' عشان'];

  it('keeps colloquial tokens out of the Arabic recitation keys', () => {
    for (const line of blockOf('ar').split('\n')) {
      const m = /^\s{4}(rec[A-Za-z0-9_]*)\s*:\s*'(.*)',?$/.exec(line);
      if (!m) continue;
      const text = ` ${m[2]} `;
      for (const token of COLLOQUIAL) {
        expect(text.includes(token), `${m[1]} contains "${token.trim()}"`).toBe(false);
      }
    }
  });

  it('translates every recitation key into all five languages', () => {
    const recKeys = [...keysOf('ar')].filter(k => k.startsWith('rec'));
    expect(recKeys.length).toBeGreaterThan(60);
    for (const lang of LANGS) {
      const keys = keysOf(lang);
      const missing = recKeys.filter(k => !keys.has(k));
      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
    }
  });
});
