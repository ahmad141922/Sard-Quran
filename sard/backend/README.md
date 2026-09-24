# خلفيّة أداة السرد — مشروع سوبابيز مستقلّ

مشروع منفصل عن مشروع السبورة عمدًا. الجدول هنا يحمل **أسماء أطفال وأرقام
واتساب**، ومشروع السبورة فيه عشرون دالّة طرفية وتسع وعشرون هجرة سابقة لهذا
المستودع — فأي خطأ في أيٍّ منها كان سيصل إلى هذه البيانات.

وفصله ربح ثانٍ: سجلّ هجرات نظيف. الأوامر كلّها تعمل من هنا بـ`--workdir`،
فلا تختلط بهجرات السبورة ولا تُدفع إليها.

```
sard/backend/supabase/
  migrations/   ← الجدول وأعمدته، ثلاث هجرات مرقّمة
  functions/
    sard-admin/ ← فعلان: قراءة المجالس وحذف واحد. لا شيء غيرهما.
```

## المشروع الحيّ

```
Sard's Project · alzsjurcstjpqqwscpfi
```

مربوط، والهجرات الثلاث مدفوعة، ودالّة `sard-admin` منشورة. الباقي سرّ
`SARD_ADMIN_EMAIL` وحساب الإدارة في Authentication → Users.

## الأوامر

الربط مرّة واحدة بمرجع المشروع الجديد:

```bash
npx supabase link --project-ref <SARD_PROJECT_REF> --workdir sard/backend
```

```bash
npx supabase db push --workdir sard/backend
```

```bash
npx supabase secrets set SARD_ADMIN_EMAIL=<بريدك> --workdir sard/backend
```

```bash
npx supabase functions deploy sard-admin --workdir sard/backend
```

**`SARD_ADMIN_EMAIL` ليس اختياريًّا**: الدالّة ترفض كل طلب إداري إن لم يُضبط.
البريد الذي تضعه هو الحساب الوحيد الذي يقرأ المجالس، وأنشئه في
Authentication → Users في المشروع نفسه.

## ما لا يوجد هنا

لا `subscribers` ولا `notifications` ولا `shared_boards` ولا أرصدة ولا تجارب —
تلك كلّها للسبورة في مشروعها. ولو احتاجت الأداة جدولًا جديدًا فهجرة جديدة هنا،
ولا تُلمس هجرات السبورة أبدًا.
