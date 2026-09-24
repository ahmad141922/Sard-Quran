import { describe, it, expect } from 'vitest';

import type { DisplayLang } from '@/lib/display-lang';
import { WIZARD_TEXT } from '../../sard/src/SardWizard';

/**
 * The wizard's own string table, checked the way `i18n-parity.test.ts` checks
 * the shared one.
 *
 * These strings live beside their component rather than in `useI18n`, which
 * buys tidiness and costs the parity test that guards everything else. This
 * file buys it back. It matters more here than almost anywhere: this is the
 * first screen of the app, seen once, by somebody who has no idea yet what any
 * of it is for — an untranslated or half-written line here is the whole first
 * impression.
 *
 * Nothing is compared against a hand-typed string. Every assertion is a
 * property of the table — completeness, script, shape — so the test cannot
 * quietly agree with a typo.
 */

const LANGS: DisplayLang[] = ['ar', 'en', 'fr', 'de', 'es'];

/**
 * Arabic script, including the presentation forms nothing here should use.
 *
 * Written as escapes rather than as the characters themselves: the range ends
 * on a zero-width no-break space, which is invisible in an editor and which
 * every tool between here and the file would be entitled to eat.
 */
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

describe('the wizard speaks every language the board does', () => {
  it('has a table for each of the five', () => {
    for (const lang of LANGS) expect(WIZARD_TEXT[lang], lang).toBeTruthy();
    expect(Object.keys(WIZARD_TEXT).sort()).toEqual([...LANGS].sort());
  });

  const keys = Object.keys(WIZARD_TEXT.ar) as (keyof typeof WIZARD_TEXT.ar)[];

  it('asks enough to be worth a screen, and few enough to be worth reading', () => {
    expect(keys.length).toBeGreaterThan(15);
  });

  for (const lang of LANGS) {
    it(`${lang} defines every string, and none of them empty`, () => {
      const theirs = WIZARD_TEXT[lang];
      const missing = keys.filter(k => !theirs[k] || !theirs[k].trim());
      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
      const extra = Object.keys(theirs).filter(k => !keys.includes(k as never));
      expect(extra, `${lang} has stray keys: ${extra.join(', ')}`).toEqual([]);
    });

    it(`${lang} keeps both halves of the step counter`, () => {
      // The label is built by substitution; a translation that dropped either
      // placeholder would read "Step of" to a screen reader and nothing else.
      expect(WIZARD_TEXT[lang].step, lang).toContain('{n}');
      expect(WIZARD_TEXT[lang].step, lang).toContain('{total}');
    });
  }
});

describe('the Arabic is Arabic, and the rest is not', () => {
  it('is written in the script, not transliterated into it', () => {
    for (const key of Object.keys(WIZARD_TEXT.ar) as (keyof typeof WIZARD_TEXT.ar)[]) {
      expect(ARABIC.test(WIZARD_TEXT.ar[key]), `ar.${key}`).toBe(true);
    }
  });

  it('has not let an Arabic line slip into another language’s column', () => {
    for (const lang of LANGS.filter(l => l !== 'ar')) {
      for (const key of Object.keys(WIZARD_TEXT[lang]) as (keyof typeof WIZARD_TEXT.ar)[]) {
        expect(ARABIC.test(WIZARD_TEXT[lang][key]), `${lang}.${key}`).toBe(false);
      }
    }
  });

  /**
   * The same guard `i18n-parity.test.ts` puts on the recitation strings. A
   * teacher reads this screen; colloquial Egyptian in it would be the first
   * thing to tell them the tool was not written for them.
   */
  it('is فصحى, with no colloquial markers', () => {
    const COLLOQUIAL = [' ليه ', ' إزاي', ' إيه ', 'عايز', 'دلوقتي', ' كده', ' مش ', ' بتاع', ' علشان', ' عشان'];
    for (const key of Object.keys(WIZARD_TEXT.ar) as (keyof typeof WIZARD_TEXT.ar)[]) {
      const padded = ` ${WIZARD_TEXT.ar[key]} `;
      for (const token of COLLOQUIAL) {
        expect(padded.includes(token), `ar.${key} contains "${token.trim()}"`).toBe(false);
      }
    }
  });

  it('carries no replacement characters from a mangled write', () => {
    for (const lang of LANGS) {
      for (const value of Object.values(WIZARD_TEXT[lang])) {
        expect(value.includes('�'), `${lang}: ${value}`).toBe(false);
      }
    }
  });
});
