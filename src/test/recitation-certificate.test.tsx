import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { coverSpan } from '@/lib/recitation-session';
import {
  certificateFields, certificateUrl, decodeCertificate, encodeCertificate,
  juzPhraseAr, pagesPhraseAr, recitedAmountAr,
} from '@/lib/recitation-certificate';
import { render } from '@testing-library/react';
import { RecitationCertificate } from '@/components/board/RecitationCertificate';
import { testBooks, type TestBooks } from './session-helpers';

let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8')) as QuranVerse[];
  index = buildQuranIndex(raw);
  books = testBooks(index);
});

/** A session that has been credited a whole number of juz' from the start. */
function afterJuz(n: number) {
  const s = books.session({ goalKind: 'full', startAyahId: 1 });
  const last = index.juzRanges[n - 1].lastId;
  return coverSpan(s, 1, last);
}

describe('the certificate says one round thing', () => {
  it('counts the Arabic way: one, two, a few, many', () => {
    // العربية تفرد وتثنّي وتجمع، والشهادة تُقرأ بصوت عالٍ فلا تحتمل «1 أجزاء».
    expect(juzPhraseAr(1)).toBe('جزءًا واحدًا');
    expect(juzPhraseAr(2)).toBe('جزأين');
    expect(juzPhraseAr(3)).toBe('٣ أجزاء');
    expect(juzPhraseAr(10)).toBe('١٠ أجزاء');
    expect(juzPhraseAr(11)).toBe('١١ جزءًا');
    expect(juzPhraseAr(30)).toBe('٣٠ جزءًا');

    expect(pagesPhraseAr(1)).toBe('صفحةً واحدة');
    expect(pagesPhraseAr(2)).toBe('صفحتين');
    expect(pagesPhraseAr(6)).toBe('٦ صفحات');
    expect(pagesPhraseAr(15)).toBe('١٥ صفحةً');
  });

  it('names whole juz` as they are', () => {
    expect(recitedAmountAr(afterJuz(1), index)).toBe('جزءًا واحدًا من القرآن الكريم');
    expect(recitedAmountAr(afterJuz(2), index)).toBe('جزأين من القرآن الكريم');
    expect(recitedAmountAr(afterJuz(5), index)).toBe('٥ أجزاء من القرآن الكريم');
  });

  it('says the whole Book when the whole Book was recited', () => {
    const done = coverSpan(books.session({ goalKind: 'full', startAyahId: 1 }), 1, index.totalAyahs);
    expect(recitedAmountAr(done, index)).toBe('القرآنَ الكريمَ كاملًا');
  });

  it('falls back to pages rather than printing a zero', () => {
    // بضع صفحات مجلسٌ حقيقي، و«٠ أجزاء» خطأ وقسوة معًا.
    const short = coverSpan(books.session({ goalKind: 'juz1', startAyahId: 1 }), 1, 20);
    const said = recitedAmountAr(short, index);
    expect(said).not.toMatch(/جزء|أجزاء/);
    expect(said).toMatch(/صفح/);
  });

  it('never claims a juz` that was not recited', () => {
    // الجزء الأول كاملًا وصفحة واحدة بعده يبقى جزءًا واحدًا، لا جزأين.
    const oneAndABit = coverSpan(afterJuz(1), index.juzRanges[1].firstId, index.juzRanges[1].firstId + 3);
    expect(recitedAmountAr(oneAndABit, index)).toBe('جزءًا واحدًا من القرآن الكريم');
  });
});

describe('the certificate sheet', () => {
  it('carries the sentence, the sheet it is set on, and the du`a', () => {
    const session = { ...afterJuz(3), studentName: 'محمد', instructorName: 'الشيخ أحمد' };
    const fields = certificateFields(session, index, 'حفص عن عاصم');
    const { container } = render(<RecitationCertificate fields={fields} />);
    const text = container.textContent ?? '';

    // العنوان والشعارات مطبوعة في الورقة نفسها، فلا تُكتب مرّة ثانية فوقها.
    expect(text).not.toContain('شهادة سرد');
    expect(text).not.toContain('بمناسبة اليوم العالمي للسرد القرآني');
    // كل تاريخ يقول تقويمه بكلمة، لا باختصار يخرج مشوّهًا عند التصوير.
    expect(text).toContain('ميلادي');
    expect(text).toContain('هجري');
    expect(text).not.toContain('هـ');
    expect(text).toContain('محمد');
    // The muqri' is named only when the majlis recorded one.
    expect(text).toContain('الشيخ أحمد');
    expect(text).toContain('٣ أجزاء من القرآن الكريم');
    // الطبعة لا تُذكر على الشهادة، والرواية تُذكر بلفظها.
    expect(text).toContain('رواية');
    expect(text).toContain('حفص عن عاصم');
    // المسافات عند حدود الأسطر مسافاتٌ غير فاصلة، فلا يبتلعها التصوير:
    // «على المقرئ» واسمُه كلمتان، لا كلمة واحدة.
    expect(text).toMatch(new RegExp('على المقرئ' + String.fromCharCode(160) + 'الشيخ أحمد'));
    expect(text).toMatch(new RegExp('رواية' + String.fromCharCode(160) + 'حفص عن عاصم'));
    expect(text).not.toContain('مصحف المدينة');
    expect(text).toContain('رَبِيعَ قُلُوبِنَا');

    // الورقة صورة واحدة من أصلنا — html2canvas لا يقرأ صورة من أصل آخر —
    // وما عداها رمزُ التحقّق وحده.
    // والبصمة في آخر العنوان مقصودة: انظر `SHEET` في RecitationCertificate.
    const marks = Array.from(container.querySelectorAll('img')).map(i => i.getAttribute('src') ?? '');
    const sheets = marks.filter(src => !src.startsWith('data:'));
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatch(/^\/cert\/template\.webp(\?v=\d+)?$/);
  });

  it('leaves out the muqri` line when no one was recorded', () => {
    const solo = certificateFields(afterJuz(1), index, 'حفص عن عاصم');
    const { container } = render(<RecitationCertificate fields={solo} />);
    expect(container.textContent).not.toContain('على المقرئ');
  });
});

describe('the certificate that travels', () => {
  it('packs and unpacks without losing a word', () => {
    const fields = certificateFields(
      { ...afterJuz(2), studentName: 'أنس', instructorName: 'الشيخ سالم' },
      index,
      'ورش عن نافع',
    );
    const back = decodeCertificate(encodeCertificate(fields));
    expect(back).toEqual(fields);
  });

  it('carries the data in the fragment, on our own domain', () => {
    // الجزء بعد # لا يُرسل إلى خادم ولا يدخل سجلّ وصول: اسم على شهادة شأن
    // صاحبها وحده.
    const url = certificateUrl(certificateFields(afterJuz(1), index, 'حفص عن عاصم'));
    expect(url.startsWith('https://sard.tajweedoo.com/cert#')).toBe(true);
    expect(url).not.toContain('?');
    expect(decodeCertificate(url.split('#')[1])?.name).toBe('x');
  });

  it('reads nothing rather than guessing at rubbish', () => {
    expect(decodeCertificate('')).toBeNull();
    expect(decodeCertificate('not-base64-$$')).toBeNull();
    expect(decodeCertificate(btoa('{"i":"a"}'))).toBeNull();
  });
});
