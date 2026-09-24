import { describe, it, expect, vi, afterEach } from 'vitest';
import { withBase, mushafRoot, baseUrl } from '@/lib/asset-url';
import { getMushaf, manifestUrl, pageAssetUrl, pageIndexUrl } from '@/lib/mushaf/registry';
import { COUNTRIES, applyDialCode, countryOfNumber, searchCountries } from '@/lib/countries';

/**
 * The one thing that breaks silently when the app moves off the root: a path
 * written as a string. These are the strings.
 */
afterEach(() => { vi.unstubAllEnvs(); });

describe('asset paths follow the build', () => {
  it('serves from the root by default', () => {
    expect(baseUrl()).toBe('/');
    expect(withBase('logos/x.webp')).toBe('/logos/x.webp');
    expect(withBase('/logos/x.webp')).toBe('/logos/x.webp');
  });

  it('follows the base the app was built with', () => {
    vi.stubEnv('BASE_URL', '/app/');
    expect(withBase('cert/template.webp')).toBe('/app/cert/template.webp');
    expect(mushafRoot()).toBe('/app/mushafs');
  });

  it('sends the plates to their own host when one is configured', () => {
    // 1.6 جيجا من الصفحات لا تُرفع مع كل نشرة: عنوان واحد ينقلها كلّها.
    vi.stubEnv('VITE_MUSHAF_BASE_URL', 'https://mushaf.tajweedoo.com/');
    const hafs = getMushaf('hafs-kfqc')!;
    expect(mushafRoot()).toBe('https://mushaf.tajweedoo.com');
    expect(pageAssetUrl(hafs, 1)).toBe('https://mushaf.tajweedoo.com/hafs-kfqc/pages/001.svg');
    expect(manifestUrl(hafs)).toBe('https://mushaf.tajweedoo.com/hafs-kfqc/manifest.json');
    expect(pageIndexUrl(hafs)).toBe('https://mushaf.tajweedoo.com/hafs-kfqc/page-index.json');
  });

  it('keeps every edition under its own id, wherever they are served from', () => {
    for (const id of ['hafs-kfqc', 'warsh-kfqc', 'qalun-kfqc', 'duri-abu-amr-kfqc', 'shubah-kfqc']) {
      expect(manifestUrl(getMushaf(id)!)).toBe(`/mushafs/${id}/manifest.json`);
    }
  });
});

// ── الدول: القائمة تكتب الكود، والرقم يقول الدولة ──
describe('the country picker and the number lead each other', () => {
  it('puts a code on a bare number', () => {
    expect(applyDialCode('1001234567', '20')).toBe('+201001234567');
  });

  it('drops the national trunk zero — no international number carries it', () => {
    expect(applyDialCode('01001234567', '20')).toBe('+201001234567');
  });

  it('replaces a code rather than stacking a second one on it', () => {
    // معلّم كتب رقمًا مصريًّا ثم اختار السعودية: الأرقام هي هي، والكود يتبدّل.
    expect(applyDialCode('+201001234567', '966')).toBe('+9661001234567');
    expect(applyDialCode('00201001234567', '966')).toBe('+9661001234567');
  });

  it('reads a country back out of a number that carries its code', () => {
    expect(countryOfNumber('+201001234567')?.code).toBe('EG');
    expect(countryOfNumber('+966501234567')?.code).toBe('SA');
    // بلا كود دولي لا تُخمَّن دولة: الرقم المحلّي صالح في عشر دول معًا.
    expect(countryOfNumber('01001234567')).toBeUndefined();
  });

  it('knows the longest code wins', () => {
    expect(countryOfNumber('+970591234567')?.code).toBe('PS');
    expect(countryOfNumber('+77012345678')?.code).toBe('KZ');
    expect(countryOfNumber('+79012345678')?.code).toBe('RU');
  });
});

// ── البحث في الدول: يسامح ما يكتبه الناس فعلًا ──
describe('country search forgives Arabic spelling', () => {
  const codes = (q: string) => searchCountries(q).map(c => c.code);

  it('finds a country however its hamza is written, and without «ال»', () => {
    expect(codes('الإمارات')).toContain('AE');
    expect(codes('الامارات')).toContain('AE');
    expect(codes('امارات')).toContain('AE');
    expect(codes('إمارات')).toContain('AE');
  });

  it('reads ة as ه and ى as ي', () => {
    expect(codes('السعوديه')).toContain('SA');
    expect(codes('السعودية')).toContain('SA');
  });

  it('searches the dialling code for whoever knows the number, not the name', () => {
    expect(codes('966')).toEqual(['SA']);
    expect(codes('+20')).toEqual(['EG']);
    expect(codes('9')).toContain('SA');
  });

  it('matches a short ISO code', () => {
    expect(codes('eg')).toContain('EG');
  });

  it('gives the whole list for an empty query, Arab world first', () => {
    expect(searchCountries('  ')).toHaveLength(COUNTRIES.length);
    expect(searchCountries('')[0].code).toBe('EG');
  });

  it('says nothing rather than something wrong', () => {
    expect(searchCountries('زززز')).toHaveLength(0);
  });
});
