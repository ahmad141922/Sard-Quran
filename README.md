# أداة السرد القرآني — Sard

مجلس سرد القرآن: المصحف + أزرار ملاحظة بلا مقاطعة السرد، ثم تقرير المجلس وخطة مراجعة.
تعمل بلا إنترنت (PWA)، ولها قشرتا Android وiOS عبر Capacitor. منشورة على
`sard.tajweedoo.com` (Cloudflare Pages).

فُصلت من مستودع TajweedooBoard في 2026-09-24 بحالة شجرة العمل آنذاك.

## البنية

| المسار | ما فيه |
|---|---|
| `sard/src/` | قشرة التطبيق (الشاشات، المعالج، المعلّم، الإدارة) |
| `src/lib/`, `src/components/board/`, `src/hooks/` | المنطق والمكوّنات المشتركة (المصحف، الجلسة، ASR، المتون) — تُستورد بـ`@/` |
| `sard/public/mushafs/` | صفائح المصحف (SVG) لكل رواية — المصدر الأصلي، وتُرفع إلى R2 |
| `sard/public/*.json` | نصوص المتون، الفونيمات، المتشابهات، أسطر المدينة |
| `public/` | الملفات التي ينسخها `npm run sard:assets` إلى `sard/public/` |
| `sard/backend/` | مشروع Supabase المستقل (هجرات + دالّة `sard-admin`) |
| `sard/deploy/` | `_headers`, `_redirects`, وسياسة CORS لـR2 |
| `landing/` | صفحة الهبوط الثابتة |
| `android/`, `ios/` | قشرتا Capacitor |
| `scripts/` | البناء والنشر وأدوات المصحف والمتون |
| `docs/` | دلائل إضافة مصحف/متن، والمحرّك، وAndroid/iOS |

## التشغيل

```bash
npm install
cp .env.example .env   # ثم املأ القيم
npm run dev            # المنفذ 8095
```

## التحقّق

```bash
npm run typecheck      # tsc -p tsconfig.app.json — الجذر لا يفحص شيئًا
npx vitest run
VITE_MUSHAF_BASE_URL=https://mushaf.tajweedoo.com npm run build
```

## النشر

`npm run deploy:build` يبني `dist-deploy/` (الهبوط في الجذر، والأداة تحت `/app/`)، ثم:

```bash
npx wrangler pages deploy dist-deploy --project-name=sard-tajweedoo
```

المشروع **Direct Upload**: كل نشر يستبدل السابق كله، فلا تنشر مجلدًا ناقصًا.

## الجوّال

`npm run android:build` ثم `cd android && ./gradlew assembleDebug` — انظر `docs/android.md` و`docs/ios.md`.
نموذج ASR (`zipformer_p_arabic_v3.int8.onnx`) لا يُحزَم ويُحمَّل جانبيًا على الجهاز.
