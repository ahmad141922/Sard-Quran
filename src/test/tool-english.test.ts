import { describe, it, expect, afterEach } from 'vitest';
import { setDisplayLang } from '@/lib/display-lang';
import {
  SURAH_NAMES_EN, SURAH_NAMES_FR, SURAH_NAMES_DE, SURAH_NAMES_ES,
  localeDigits, surahName, surahNameAr, surahNameVariants,
} from '@/lib/quran-data';
import { countryByCode, countryName, searchCountries } from '@/lib/countries';
import { AYAH_COUNTING, countingName, getMushaf, mushafName, riwayaName } from '@/lib/mushaf/registry';
import { formatVolumeEn, formatDuration } from '@/lib/recitation-session';
import { juzPhraseEn, pagesPhraseEn, decodeCertificate, encodeCertificate, type CertificateFields } from '@/lib/recitation-certificate';

/**
 * The tool speaks Arabic and English. These tests are about the second one —
 * that every name a reader sees has a form in it, and that nothing which was
 * issued in Arabic quietly turns into English later.
 */
afterEach(() => setDisplayLang('ar'));

describe('names answer in the language on screen', () => {
  it('gives a surah its Arabic name in Arabic and its transliteration otherwise', () => {
    expect(surahName(1, 'ar')).toBe('الفاتحة');
    expect(surahName(1, 'en')).toBe('Al-Fatihah');
    expect(surahName(114, 'en')).toBe('An-Nas');
  });

  it('spells the name the way each language spells the sound', () => {
    // Sūrat ash-Shams, 91. One sound, four spellings — because `sh` says
    // nothing to a French reader and `sch` is how a German one writes it.
    expect(surahName(91, 'en')).toBe('Ash-Shams');
    expect(surahName(91, 'fr')).toBe('Ach-Chams');
    expect(surahName(91, 'de')).toBe('Asch-Schams');
    expect(surahName(91, 'es')).toBe('Ash-Shams');
    // The jīm: `dj` in French, `dsch` in German, `y` in Spanish, which already
    // has that sound and that letter for it.
    expect(surahName(72, 'fr')).toBe('Al-Djinn');
    expect(surahName(72, 'de')).toBe('Al-Dschinn');
    expect(surahName(72, 'es')).toBe('Al-Yinn');
    // A language with no list of its own keeps the English spelling rather
    // than falling through to a number.
    expect(surahName(1, 'tr' as never)).toBe('Al-Fatihah');
  });

  it('offers every spelling for matching, so search ignores the menu', () => {
    const variants = surahNameVariants(91);
    expect(variants).toContain('Ash-Shams');
    expect(variants).toContain('Ach-Chams');
    expect(variants).toContain('Asch-Schams');
    expect(variants).toContain('الشمس');
    // Spanish and English agree here; the list says it once.
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('names all 114 in every language, with no gaps and no duplicates', () => {
    for (const names of [SURAH_NAMES_EN, SURAH_NAMES_FR, SURAH_NAMES_DE, SURAH_NAMES_ES]) {
      expect(names).toHaveLength(114);
      expect(names.filter(n => !n.trim())).toEqual([]);
      expect(new Set(names).size).toBe(114);
    }
  });

  it('keeps an Arabic-only name for the muṣḥaf page itself', () => {
    setDisplayLang('en');
    expect(surahNameAr(1)).toBe('الفاتحة');
    expect(surahName(1)).toBe('Al-Fatihah');
  });

  it('follows the display language when none is passed', () => {
    setDisplayLang('en');
    expect(surahName(18)).toBe('Al-Kahf');
    setDisplayLang('ar');
    expect(surahName(18)).toBe('الكهف');
  });

  it('writes digits in the script of the language', () => {
    expect(localeDigits(604, 'ar')).toBe('٦٠٤');
    expect(localeDigits(604, 'en')).toBe('604');
  });

  it('translates the riwaya, the edition and the counting scheme', () => {
    expect(riwayaName('hafs', 'ar')).toBe('حفص عن عاصم');
    expect(riwayaName('hafs', 'en')).toBe("Hafs from 'Asim");
    const madinah = getMushaf('hafs-madinah') ?? getMushaf('hafs-kfqc');
    expect(mushafName(madinah!, 'en')).toContain('Madinah');
    expect(countingName(AYAH_COUNTING.kufi, 'en')).toBe('Kufan counting');
  });

  it('names every country in both, and finds them either way', () => {
    for (const c of searchCountries('')) {
      expect(c.nameAr.trim().length, c.code).toBeGreaterThan(0);
      expect(c.nameEn.trim().length, c.code).toBeGreaterThan(0);
    }
    expect(countryName(countryByCode('EG')!, 'en')).toBe('Egypt');
    expect(countryName(countryByCode('EG')!, 'ar')).toBe('مصر');
    // An English query works while the interface is Arabic, and vice versa.
    expect(searchCountries('egypt').map(c => c.code)).toEqual(['EG']);
    expect(searchCountries('مصر').map(c => c.code)).toEqual(['EG']);
  });
});

describe('counted phrases in English', () => {
  it('counts juz and pages without inventing a plural for juz', () => {
    expect(juzPhraseEn(1)).toBe("one juz'");
    expect(juzPhraseEn(5)).toBe("5 juz'");
    expect(pagesPhraseEn(1)).toBe('one page');
    expect(pagesPhraseEn(12)).toBe('12 pages');
  });

  it('writes a volume the way the Arabic one is written', () => {
    expect(formatVolumeEn({ ayahs: 1, pages: 1, fullJuz: 0, extraPages: 0 })).toBe('1 page · 1 ayah');
    expect(formatVolumeEn({ ayahs: 240, pages: 23, fullJuz: 1, extraPages: 3 })).toBe("1 juz' and 3 pages · 240 ayahs");
  });

  it('keeps the short duration form for English', () => {
    expect(formatDuration(2 * 3600_000 + 34 * 60_000, 'en')).toBe('2h 34m');
    expect(formatDuration(0, 'en')).toBe('<1m');
  });
});

describe('a certificate keeps the language it was issued in', () => {
  const fields: CertificateFields = {
    id: 'rs_1', name: 'Ahmad', amount: "5 juz' of the Holy Qur'an", riwaya: "Hafs from 'Asim",
    durationMs: 3600_000, at: 1_700_000_000_000, lang: 'en',
  };

  it('carries the language through the link', () => {
    expect(decodeCertificate(encodeCertificate(fields))?.lang).toBe('en');
    expect(decodeCertificate(encodeCertificate({ ...fields, lang: 'ar' }))?.lang).toBe('ar');
  });

  it('reads a link printed before the tool spoke English as Arabic', () => {
    // The old shape: same payload, no `l`.
    const packed = { i: 'rs_1', n: 'أحمد', a: 'جزءًا واحدًا من القرآن الكريم', r: 'حفص عن عاصم', d: 60_000, t: 1 };
    const bytes = new TextEncoder().encode(JSON.stringify(packed));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const legacy = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeCertificate(legacy)?.lang).toBe('ar');
  });

  it('does not translate what was already phrased', () => {
    // `amount` is a sentence-object, fixed at issue. Decoding must not touch it.
    setDisplayLang('ar');
    expect(decodeCertificate(encodeCertificate(fields))?.amount).toBe("5 juz' of the Holy Qur'an");
  });
});
