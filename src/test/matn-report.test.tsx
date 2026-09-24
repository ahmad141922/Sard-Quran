import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import MatnReportSheet, { groupedBaytLines } from '@/components/board/MatnReportSheet';
import {
  baytPhraseAr, baytPhraseEn, decodeCertificate, encodeCertificate, matnCertificateFields,
  recitedMatnAmountAr, recitedMatnAmountEn,
} from '@/lib/recitation-certificate';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { matnPosition } from '@/lib/matn/position';
import { MATN_REGISTRY } from '@/lib/matn/registry';
import { coverAbyat, createMatnSession, fullMatnGoal, type MatnSession } from '@/lib/matn/session';
import { makeNote } from '@/lib/recitation-session';

afterEach(cleanup);

const ABWAB = [
  { n: 1, titleAr: 'باب الأول', titleEn: 'First', from: 1, to: 2 },
  { n: 2, titleAr: 'باب الثاني', titleEn: 'Second', from: 3, to: 4 },
];

function fixtureFile(): MatnFile {
  return {
    id: 'tuhfa',
    editionAr: 'طبعة الاختبار',
    editionEn: 'Test print',
    totalAbyat: 4,
    abwab: ABWAB,
    abyat: Array.from({ length: 4 }, (_, i) => ({
      n: i + 1, sadr: `صدر ${i + 1}`, ajz: `عجز ${i + 1}`, bab: i < 2 ? 1 : 2,
    })),
  };
}

function withRelaxedRegistry<T>(run: (matn: Matn) => T): T {
  const f = fixtureFile();
  const def = MATN_REGISTRY[f.id];
  const saved = { ...def };
  Object.assign(def, {
    totalAbyat: f.totalAbyat, totalAbwab: f.abwab.length,
    editionAr: f.editionAr, editionEn: f.editionEn,
  });
  try { return run(matnFromFile(f)); } finally { Object.assign(def, saved); }
}

const at = (bayt: number, shatr: 'sadr' | 'ajz') =>
  matnPosition('tuhfa', 'طبعة الاختبار', bayt, shatr);

const session = (matn: Matn, over: Partial<MatnSession> = {}): MatnSession => ({
  ...createMatnSession({
    studentName: 'محمّد', instructorName: 'الشيخ محمود', matn,
    goal: fullMatnGoal(matn), now: 1_000,
  }),
  ...over,
});

/** العربية تفرد وتثنّي وتجمع — exactly as `juzPhraseAr` does. */
describe('counting abyāt in Arabic', () => {
  it('singles, duals and pluralises', () => {
    expect(baytPhraseAr(1)).toBe('بيتًا واحدًا');
    expect(baytPhraseAr(2)).toBe('بيتين');
    expect(baytPhraseAr(5)).toBe('٥ أبيات');
    expect(baytPhraseAr(35)).toBe('٣٥ بيتًا');
  });

  it('keeps English to its two forms', () => {
    expect(baytPhraseEn(1)).toBe('one line');
    expect(baytPhraseEn(35)).toBe('35 lines');
  });
});

describe('what the certificate says was recited', () => {
  it('says the whole matn when the whole matn was recited', () => {
    expect(recitedMatnAmountAr('المقدّمة الجزريّة', 107, true)).toBe('المقدّمة الجزريّة كاملةً');
    expect(recitedMatnAmountEn('Al-Muqaddima al-Jazariyya', 107, true))
      .toBe('the whole of Al-Muqaddima al-Jazariyya');
  });

  it('counts the lines otherwise, without rounding', () => {
    expect(recitedMatnAmountAr('المقدّمة الجزريّة', 60, false)).toBe('٦٠ بيتًا من المقدّمة الجزريّة');
  });
});

describe('issuing a certificate for a matn', () => {
  const names = { name: 'تحفة الأطفال', edition: 'طبعة الاختبار' };

  it('names the reciter, the listener and the print', () => {
    withRelaxedRegistry(matn => {
      const s = coverAbyat(session(matn), 1, 2);
      const f = matnCertificateFields(s, names, 'ar')!;
      expect(f.name).toBe('محمّد');
      expect(f.instructor).toBe('الشيخ محمود');
      expect(f.riwaya).toBe('طبعة الاختبار');
      expect(f.amount).toBe('بيتين من تحفة الأطفال');
    });
  });

  it('says «كاملةً» once every line has been recited', () => {
    withRelaxedRegistry(matn => {
      const s = coverAbyat(session(matn), 1, 4);
      expect(matnCertificateFields(s, names, 'ar')!.amount).toBe('تحفة الأطفال كاملةً');
    });
  });

  /** The rule the whole solo design turns on. */
  it('refuses outright when nobody was listening', () => {
    withRelaxedRegistry(matn => {
      const s = coverAbyat(session(matn, { mode: 'solo' }), 1, 4);
      expect(matnCertificateFields(s, names, 'ar')).toBeNull();
    });
  });

  /** No new encoding: it scans and verifies through what already exists. */
  it('survives the round trip through the QR payload', () => {
    withRelaxedRegistry(matn => {
      const f = matnCertificateFields(coverAbyat(session(matn), 1, 3), names, 'ar')!;
      const back = decodeCertificate(encodeCertificate(f));
      expect(back).toMatchObject({
        name: 'محمّد', instructor: 'الشيخ محمود',
        riwaya: 'طبعة الاختبار', amount: '٣ أبيات من تحفة الأطفال',
      });
    });
  });
});

describe('listing places in a report', () => {
  it('groups by bāb and keeps the half each note was taken in', () => {
    const lines = groupedBaytLines(
      [{ position: at(1, 'ajz') }, { position: at(2, 'sadr') }, { position: at(4, 'ajz') }],
      ABWAB, true,
    );
    expect(lines).toEqual(['باب الأول: 1 (ع) · 2 (ص)', 'باب الثاني: 4 (ع)']);
  });

  it('has nothing to say when nothing was noted', () => {
    expect(groupedBaytLines([], ABWAB, true)).toEqual([]);
  });
});

describe('the report sheet', () => {
  const draw = (matn: Matn, s: MatnSession) => render(
    <I18nProvider forceLang="ar"><MatnReportSheet session={s} abwab={ABWAB} /></I18nProvider>,
  );

  it('carries the reciter, the matn and its print', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn, coverAbyat(session(matn), 1, 2));
      expect(container.textContent).toContain('محمّد');
      expect(container.textContent).toContain('تحفة الأطفال');
      expect(container.textContent).toContain('طبعة الاختبار');
    });
  });

  it('lists a ḍabṭ error at its line and half', () => {
    withRelaxedRegistry(matn => {
      const s = session(matn, { notes: [makeNote('dabt', at(3, 'ajz'))] });
      const { container } = draw(matn, s);
      expect(container.textContent).toContain('خطأ ضبط');
      expect(container.textContent).toContain('3 (ع)');
    });
  });

  /** Reciting alone, the third row is the mark — never a ḍabṭ error. */
  it('swaps the third row for marks when nobody was listening', () => {
    withRelaxedRegistry(matn => {
      const s = session(matn, { mode: 'solo', marks: [{ id: 'm1', at: 2_000, position: at(2, 'sadr') }] });
      const { container } = draw(matn, s);
      expect(container.textContent).toContain('يحتاج مراجعة');
      expect(container.textContent).not.toContain('خطأ ضبط');
      expect(container.textContent).toContain('2 (ص)');
    });
  });
});
