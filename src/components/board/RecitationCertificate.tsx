import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { withBase } from '@/lib/asset-url';
import { toArabicIndic } from '@/lib/quran-data';
import { formatDuration } from '@/lib/recitation-session';
import { certificateUrl, type CertificateFields } from '@/lib/recitation-certificate';
import { toHijri, HIJRI_MONTH_NAMES } from '@/lib/hijri';

/**
 * The certificate — one sentence, a du'a and a code, set on a printed sheet.
 *
 * The sheet itself is artwork: the frame, the ornament, the title, the seal
 * and «أداة السرد القرآني من [تجويدوو]» are all in the image, drawn once and
 * never re-typeset. What this component adds is only what changes — who
 * recited, how much, to whom, in how long, when, and the code that verifies
 * it — placed over the empty middle the sheet leaves for exactly that.
 *
 * Everything is positioned as a fraction of the sheet, never in pixels: the
 * same layout then holds whether it is rasterised at 840 wide for a chat or
 * zoomed to a phone's width on the page a scanned code opens.
 *
 * It takes finished strings, not a session: the same component renders inside
 * the app, where the whole session is at hand, and on the page a scanned code
 * opens, where nothing is at hand but the fields themselves.
 *
 * Its words come from `fields.lang`, not from the interface. A certificate is
 * issued once, in one language, and stays in it — the way a paper one would.
 *
 * And no letter-spacing anywhere: Arabic is a joined script, and tracking is
 * what breaks a word into loose letters when it is rasterised.
 */

const INK = '#1f2421';
const MUTED = '#6b7269';
const GREEN = '#0e5b4c';

/** The landing page's face, so the printed piece belongs to the same family. */
const FACE = "'IBM Plex Sans Arabic', 'Tajawal', system-ui, sans-serif";

/**
 * The sheet, and the room it leaves.
 *
 * 1491 × 1055 in the original; everything below is a fraction of that, so the
 * numbers stay true at any render width. The empty middle runs from just under
 * the printed title (≈25%) to where the bottom band curves up (≈73% at the
 * sides), and the two lower corners are spoken for — Tajweedoo's mark on one,
 * the seal in the middle — which is why the code sits on the other.
 */
/**
 * اللوح، وبصمةٌ في آخر عنوانه.
 *
 * اسم الملفّ ثابت ومحتواه يتغيّر، وCloudflare خزّنه على الحافّة أسبوعًا: فلمّا
 * استُبدل الشعار بقي المنشور يخدم اللوح القديم عشرين ساعة بعد النشر، وكان
 * يبقى إلى سبعة أيّام. والحلّ عنوانٌ جديد — الحافّة تفتقده فتذهب إلى الأصل.
 *
 * فارفع الرقم كلّما تغيّرت الصورة. و`scripts/build-deploy.mjs` يقصّر عمر
 * `/app/cert/*` كذلك، فمن نسي الرقم لا ينتظر أسبوعًا.
 */
const SHEET = withBase('cert/template.webp?v=2');
const SHEET_RATIO = 1055 / 1491;

/** أرقام عربية في كل الوثيقة: التاريخ يكتبها هكذا، فالمدّة لا تُكتب لاتينية بجانبه. */
const arabicNumerals = (text: string) => text.replace(/[0-9]/g, d => toArabicIndic(Number(d)));

/**
 * The certificate's own words, in the two languages it is issued in.
 *
 * Not `useI18n`: this document is rendered for its own language, which is a
 * property of the certificate rather than of whoever is looking at it. The
 * title is not here — it is printed on the sheet.
 */
const WORDS = {
  ar: {
    weCertify: 'نشهد أنّ القارئ',
    hasRecited: 'قد سَرَدَ',
    toListener: 'على المقرئ',
    inDuration: 'في مدّة',
    riwaya: 'رواية',
    scanHint: 'امسح لعرض توثيق الشهادة',
  },
  en: {
    weCertify: 'We certify that the reciter',
    hasRecited: 'has recited',
    toListener: 'to',
    inDuration: 'in',
    riwaya: 'riwaya',
    scanHint: 'Scan to verify this certificate',
  },
} as const;

/**
 * The closing supplication.
 *
 * The Arabic stands on every certificate — it is what is said at the end of a
 * majlis, and a transliteration would be neither the words nor their meaning.
 * An English certificate carries its meaning underneath, smaller, the way a
 * printed ijaza glosses what it quotes.
 */
const DUA_AR = ['اللَّهُمَّ اجْعَلِ الْقُرْآنَ الْعَظِيمَ رَبِيعَ قُلُوبِنَا،', 'وَنُورَ صُدُورِنَا، وَجِلَاءَ أَحْزَانِنَا، وَذَهَابَ هُمُومِنَا'];
const DUA_EN = 'O Allah, make the Mighty Qur\'an the springtime of our hearts, the light of our breasts, the lifting of our sorrows and the going of our cares.';

/**
 * The space that survives being rasterised.
 *
 * A plain space between two inline elements is whitespace, and whitespace at
 * the edge of a run is what html2canvas drops — which is how «على المقرئ» and
 * a name came to be printed as one word. A non-breaking space is a character:
 * it belongs to the run, and it is drawn.
 */
const NBSP = '\u00A0';

/** The sheet is 840 wide wherever it is rasterised; type is sized against that. */
const WIDTH = 840;
const HEIGHT = Math.round(WIDTH * SHEET_RATIO);
/** A fraction of the sheet's height, in the pixels this render uses. */
const down = (fraction: number) => Math.round(HEIGHT * fraction);
const across = (fraction: number) => Math.round(WIDTH * fraction);

interface Props {
  fields: CertificateFields;
}

export const RecitationCertificate = React.forwardRef<HTMLDivElement, Props>(({ fields }, ref) => {
  const ar = fields.lang !== 'en';
  const w = ar ? WORDS.ar : WORDS.en;

  // A certificate is read aloud, so it says the time in words. The report's
  // terse «2h 34m» is right for a table and wrong on a sheet handed to a
  // reciter — and «<1m» is not something anyone says.
  const spoken = formatDuration(fields.durationMs, ar ? 'ar' : 'en');
  const duration = ar
    ? arabicNumerals(spoken)
    : (fields.durationMs < 60_000 ? 'less than a minute' : spoken.replace(/(\d+)h/, '$1 hr').replace(/(\d+)m/, '$1 min'));

  const date = new Date(fields.at);
  const h = toHijri(date);
  // Each date names its own calendar in words. «هـ» is a two-glyph abbreviation
  // that rasterises badly beside a numeral, and it saves nobody anything.
  const gregorian = `${date.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${NBSP}${ar ? 'ميلادي' : 'Gregorian'}`;
  const hijri = ar
    ? `${toArabicIndic(h.day)} ${HIJRI_MONTH_NAMES[h.month - 1].ar} ${toArabicIndic(h.year)}${NBSP}هجري`
    : `${h.day} ${HIJRI_MONTH_NAMES[h.month - 1].en} ${h.year}${NBSP}Hijri`;

  /** The code opens the certificate itself, on our own domain. */
  const link = useMemo(() => certificateUrl(fields), [fields]);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 0, scale: 6, color: { dark: '#1f2421', light: '#fdf8ef' } })
      .then(url => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [link]);

  /**
   * Centred on the sheet, not on the sentence.
   *
   * Physical `left`, deliberately: `inset-inline-start` mirrors with the text
   * direction, and the paper does not mirror — its seal is in the middle and
   * Tajweedoo's mark on the left whatever language is written over it.
   */
  const centred: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: across(0.74),
    textAlign: 'center',
  };

  return (
    <div
      ref={ref}
      dir={ar ? 'rtl' : 'ltr'}
      style={{
        position: 'relative',
        width: WIDTH,
        height: HEIGHT,
        color: INK,
        fontFamily: FACE,
        // A background image is not rasterised by html2canvas on every browser;
        // an <img> underneath always is.
        overflow: 'hidden',
      }}
    >
      <img
        src={SHEET}
        alt=""
        width={WIDTH}
        height={HEIGHT}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />

      {/* The two dates, in the corner the sheet leaves empty. */}
      <div
        style={{
          position: 'absolute',
          top: down(0.115),
          right: across(0.1),
          textAlign: 'center',
          fontSize: 11,
          color: MUTED,
          lineHeight: 1.9,
        }}
      >
        <div>{gregorian}</div>
        <div>{hijri}</div>
      </div>

      {/* The one sentence: who, how much, to whom, in how long. */}
      <div style={{ ...centred, top: down(0.30), fontSize: 15, color: MUTED }}>{w.weCertify}</div>
      <div
        style={{
          ...centred,
          top: down(0.365),
          fontSize: 34,
          fontWeight: 700,
          color: GREEN,
          lineHeight: 1.5,
        }}
      >
        {fields.name}
      </div>
      <div style={{ ...centred, top: down(0.48), fontSize: 17, lineHeight: 1.9 }}>
        <span>{w.hasRecited}{NBSP}</span><strong>{fields.amount}</strong>{fields.instructor
          ? <><span>{NBSP}{w.toListener}{NBSP}</span><strong>{fields.instructor}</strong></>
          : null}
      </div>
      <div style={{ ...centred, top: down(0.555), fontSize: 14, color: MUTED, lineHeight: 1.8 }}>
        <span>{w.inDuration}{NBSP}</span><strong style={{ color: INK }}>{duration}</strong>{fields.riwaya
          ? <><span>{NBSP}·{NBSP}{w.riwaya}{NBSP}</span><strong style={{ color: INK }}>{fields.riwaya}</strong></>
          : null}
      </div>

      {/* The du'a — narrower than the sentence above it, so it clears the code. */}
      <div
        style={{
          // Centred on the paper. Narrower than the sentence above it so the
          // two lines stop short of the code rather than beside it.
          position: 'absolute',
          // الإنجليزية تحمل سطرَي المعنى تحت الدعاء، فكتلتها أطول بنحو ٣٪ من
          // ارتفاع اللوح. وتُركا على ٦٣٫٥٪ معًا فنزل آخر سطرٍ منها على الخاتم:
          // الفراغ الأوسط ينتهي عند ٧٦٪، وكانت تبلغ ٧٧٫٥٪. فترتفع وحدها.
          top: down(ar ? 0.635 : 0.61),
          left: '50%',
          transform: 'translateX(-50%)',
          width: across(0.56),
          textAlign: 'center',
        }}
      >
        <div dir="rtl" style={{ fontSize: ar ? 16 : 14, fontWeight: 700, lineHeight: 1.95, color: GREEN }}>
          {DUA_AR[0]}
          <br />
          {DUA_AR[1]}
        </div>
        {!ar && (
          <div style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>{DUA_EN}</div>
        )}
      </div>

      {/* The code, in the corner opposite Tajweedoo's mark. */}
      <div
        style={{
          position: 'absolute',
          top: down(0.63),
          right: across(0.09),
          width: 84,
          textAlign: 'center',
        }}
      >
        {qr && <img src={qr} alt="" width={72} height={72} style={{ display: 'block', margin: '0 auto' }} />}
        <div style={{ fontSize: 8.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{w.scanHint}</div>
      </div>
    </div>
  );
});
RecitationCertificate.displayName = 'RecitationCertificate';

export default RecitationCertificate;
