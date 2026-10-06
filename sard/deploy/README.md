# نشر أداة السرد القرآني وصفحة التعريف

نطاق واحد، مشروع Pages واحد، وثلاثة أشياء عليه:

| المسار | ما يُخدَم | من أين |
|---|---|---|
| `/` | صفحة التعريف | `landing/` كما هي، بلا بناء |
| `/app/` | الأداة | `dist-sard/` مبنيّة بقاعدة `/app/` |
| `/cert` | صفحة الشهادة | `cert.html` — قشرة الأداة نفسها |

والمصاحف **ليست** على Pages: خمس طبعات = ١٫٦ ج.ب من الصفحات المتجهة، مكانها دلو
R2 بنطاقه، والأداة تُبنى وهي تعرف عنوانه.

الترتيب مقصود: قاعدة البيانات، ثم الدالّة، ثم المصاحف، ثم البناء، ثم الرفع.

## الحسابات الحيّة

| | |
|---|---|
| سوبابيز | `Sard's Project` · `alzsjurcstjpqqwscpfi` — **الجدول والدالّة والسرّ جاهزة** |
| Cloudflare | حساب المالك · معرّف الحساب في لوحة Cloudflare (نطاق tajweedoo.com فيه) |
| دلو R2 | `sard` — **أُنشئ**، وينتظر الرفع والنطاق وCORS |

الحساب فيه حسابان على الدخول نفسه، فكل أمر لـwrangler يحتاج:

```bash
export CLOUDFLARE_ACCOUNT_ID=<معرّف حساب Cloudflare>
```

(في PowerShell: `$env:CLOUDFLARE_ACCOUNT_ID="<معرّف حساب Cloudflare>"`)

---

## ١ — سوبابيز: **مشروع مستقلّ** (مرّة واحدة)

الأداة لم تعد تشارك مشروع السبورة. الجدول يحمل أسماء أطفالٍ وأرقام واتساب،
ومشروع السبورة فيه عشرون دالّة طرفية وتسع وعشرون هجرة سابقة لهذا المستودع.
وكل ما يخصّ الخلفيّة الجديدة في **`sard/backend/`**.

### أ) أنشئ المشروع

من لوحة سوبابيز: **New project** باسم مثل `tajweedoo-sard`. احفظ:

- **Project ref** (من العنوان أو Project Settings → General)
- **Project URL** و**anon public key** (Project Settings → API)

### ب) الجدول

```bash
npx supabase link --project-ref <SARD_PROJECT_REF> --workdir sard/backend
```

```bash
npx supabase db push --workdir sard/backend
```

سجلّ المشروع الجديد فارغ، فالهجرات الثلاث تُطبَّق كما هي. و`--workdir` هو ما
يمنع خلطها بهجرات السبورة.

> تعثّر `db push` لأي سبب؟ افتح **SQL Editor** والصق
> `supabase/manual/recitation-setup.sql` — يفعل الشيء نفسه وصالح للتكرار.

### ج) حساب الإدارة والدالّة

في المشروع الجديد: **Authentication → Users → Add user** ببريدك وكلمة مرور.
هذا البريد وحده هو الذي سيقرأ المجالس:

```bash
npx supabase secrets set SARD_ADMIN_EMAIL=<بريدك> --workdir sard/backend
```

```bash
npx supabase functions deploy sard-admin --workdir sard/backend
```

**الدالّة ترفض كل طلب إن لم يُضبط السرّ** (٥٠٣) — سوء الإعداد على جدول كهذا
قراءته الآمنة «لا أحد».

### د) اربط الأداة به

في `.env`:

```bash
VITE_SARD_SUPABASE_URL=https://<ref>.supabase.co
```

```bash
VITE_SARD_SUPABASE_ANON_KEY=<anon public key>
```

فارغَين ترتدّ الأداة إلى مشروع السبورة كما كانت — مقصود، لئلّا ينكسر بناء
نصف مضبوط. املأهما **قبل** خطوة البناء.

### هـ) تحقّق

في **Table Editor** الجدول موجود، وفي **Policies** ثلاث سياسات و`rec_no_public_read`
مفعّلة. هي ما يمنع قراءة الأسماء بالمفتاح العام المنشور في الحزمة — لا تعطّلها.

---

## ٢ — المصاحف على R2 (مرّة واحدة، ثم عند إضافة طبعة)

الدلو `sard` أُنشئ بالفعل. من R2 → **Manage API tokens** أنشئ مفتاحًا بصلاحية **Object Read & Write**،
واضبط الأربعة في الطرفية:

```bash
set R2_ACCOUNT_ID=<من عنوان لوحة Cloudflare>
```

```bash
set R2_ACCESS_KEY_ID=<من المفتاح>
```

```bash
set R2_SECRET_ACCESS_KEY=<من المفتاح>
```

```bash
npm run mushaf:upload -- --dry-run
```

التجربة الجافّة تطبع ما سيُرفع ولا ترفع شيئًا: ٣٠٣٨ ملفًّا، ١٥٣٣ م.ب، ومفاتيح
مثل `hafs-kfqc/pages/001.svg`. فإن كانت صحيحة:

```bash
npm run mushaf:upload
```

يرفع باثني عشر طلبًا متوازيًا ويطبع تقدّمه، ويعيد الكتابة بلا ضرر إن أُعيد
تشغيله — فأي فشل جزئي يُعالَج بإعادة الأمر. (`--edition hafs-kfqc` يرفع طبعة
واحدة.)

ثم في لوحة R2:

1. **Custom Domain** → `mushaf.tajweedoo.com`.
2. **CORS**: الأداة تقرأ صفحات SVG **نصًّا** (لتُحقن طبقة المضلّعات)، فبلا
   ترويسة CORS لن تُقرأ أصلًا:

```json
[{ "AllowedOrigins": ["https://sard.tajweedoo.com"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }]
```

> السياسة الحيّة اليوم أوسع من هذا السطر: تطبيق أندرويد يقرأ من الدلو بأصله
> الخاصّ، ونطاق Pages يقرأ منه أيضًا. الأصول الأربعة كلّها في
> `sard/deploy/r2-cors.json` (بصيغة wrangler لا صيغة اللوحة)، وهو **المصدر** —
> والأمر يستبدل السياسة كلّها لا يضيف إليها، فأصلٌ يسقط من الملفّ يسقط من
> الدلو. التفصيل في `docs/android.md`.

3. الصفحات لا تتغيّر أبدًا، فأعطها عمرًا طويلًا:
   `Cache-Control: public, max-age=31536000, immutable`.

---

## ٣ — البناء

```bash
set VITE_MUSHAF_BASE_URL=https://mushaf.tajweedoo.com
```

```bash
npm run deploy:build
```

يبني الأداة بقاعدة `/app/` ثم يجمّع `dist-deploy/`: صفحة التعريف على الجذر،
والأداة تحت `/app/`، و`cert.html` للشهادة، و`_headers` و`_redirects` في الجذر
(Pages لا يقرؤهما من مكان آخر).

**الناتج ~٧ م.ب و٤٤ ملفًّا.** لو رأيته بالجيجابايت فالمصاحف دخلت الحزمة، ومعناه
أن المتغيّر لم يُضبط.

> مفاتيح سوبابيز تُخبَز في الحزمة وقت البناء من `.env` المحلّي. لا حاجة لضبطها في
> لوحة Cloudflare ما دام الرفع مباشرًا لا من مستودع.

---

## ٤ — الرفع إلى Cloudflare Pages

```bash
npx wrangler pages project create sard-tajweedoo --production-branch=main
```

```bash
npx wrangler pages deploy dist-deploy --project-name=sard-tajweedoo
```

ثم **Custom domain** → `sard.tajweedoo.com`.

---

## ٥ — بعد الرفع: خمسة فحوص

1. `sard.tajweedoo.com` → صفحة التعريف، وأزرارها تذهب إلى `/app/`.
2. `sard.tajweedoo.com/app/` → الأداة تفتح، وزرّ «ابدأ مجلس سرد» ليس معطّلًا
   (معناه أن `hafs_smart_v8.json` وصل).
3. ابدأ مجلسًا: صفحة المصحف تظهر — وهي القادمة من R2. لو ظهرت «تعذّر تحميل
   صفحة» فالسبب CORS أو عنوان الدلو.
4. أنهِ المجلس، ثم `#/admin` بحساب الإدارة: المجلس في الجدول ومعه رقم الواتساب.
5. صدّر شهادة، وامسح رمزها بالهاتف: يفتح `sard.tajweedoo.com/cert#…` ويعرضها.

---

## ما يتغيّر عند إضافة طبعة جديدة

`npm run mushaf:upload -- --edition <id>` للطبعة الجديدة وحدها، ثم
`npm run deploy:build` ورفع `dist-deploy`. لا شيء في الكود يتغيّر:
`VITE_MUSHAF_BASE_URL` هو كل ما يعرفه التطبيق عن مكان الصفحات.
