# الحسابات والبريد: Google، والبريد وكلمة السر، ورسائل info@sard.tajweedoo.com

الحساب في الأداة **اختياري**: السرد كله يعمل بلا حساب. يحتاجه المقرئ فقط ليضيف
«المشاركين في الجلسة» ويتابع مجالسهم. والدخول بطريقتين لا ثالث لهما:

- **المتابعة بحساب Google**.
- **البريد وكلمة السر**، ولا يعمل الحساب حتى يُؤكَّد البريد برسالة تصل من
  `info@sard.tajweedoo.com`.

والكود في `src/lib/teacher-auth.ts` و`sard/src/teacher/TeacherScreen.tsx`،
وقراءة الروابط القادمة من خارج الأداة (دعوة، رجوع من Google، رابط من بريد) في
`src/lib/auth-return.ts`.

## الحسابات القديمة لا تضيع

قبل هذا كان الدخول برمز من ستة أرقام يصل البريد، فكل حساب قديم مسجَّل ببريده
**بلا كلمة سر**. لم يُحذف شيء ولم يُنقل شيء: الحساب نفسه، بالمعرّف نفسه،
والمشاركون ومجالسهم مربوطة بهذا المعرّف. وصاحبه يدخل بإحدى طريقتين:

1. **Google** بالبريد نفسه: يربط Supabase الدخول بالحساب الموجود تلقائيًا لأن
   Google يؤكّد البريد، فيدخل على بياناته كما هي.
2. **«نسيت كلمة السر؟»**: يصله رابط يضبط منه كلمة سر لحسابه نفسه.

وإن حاول «إنشاء حساب» ببريد له حساب، لا يُنشأ حساب ثانٍ؛ تقول له الشاشة إن
للبريد حسابًا وتدلّه على الطريقين السابقين. وما على الجهاز نفسه (المجالس
المحفوظة محليًّا، والإعدادات) لا يمسّه تسجيل الدخول ولا الخروج أصلًا.

## ١) Amazon SES: الإرسال من info@sard.tajweedoo.com

1. ادخل **Amazon SES** في المنطقة (Region) التي فيها حسابك، ولاحظ اسمها
   (حسابنا على `eu-north-1`، ستوكهولم)؛ ستحتاجه في عنوان الخادم.
2. **Identities ← Create identity ← Domain**، واكتب `sard.tajweedoo.com`، وفعّل
   **Easy DKIM** (RSA 2048).
   - إن كان `tajweedoo.com` كله موثَّقًا عندك في SES من قبل، فالإرسال من
     النطاقات الفرعية مسموح، ويمكنك تخطّي هذه الخطوة. ومع ذلك فتوثيق النطاق
     الفرعي بمفاتيحه أفضل لسمعة الرسائل.
3. يعطيك SES **ثلاثة سجلّات CNAME**. أضفها في **Cloudflare ← tajweedoo.com ←
   DNS** كما هي، مع جعل **Proxy status = DNS only** (السحابة رمادية). وبعد دقائق
   تصير الهوية **Verified**.
4. سجلّ DMARC (يحسّن الوصول للبريد الوارد بدل الـSpam). في Cloudflare أضف:
   - النوع `TXT`، والاسم `_dmarc.sard`، والقيمة `v=DMARC1; p=none; rua=mailto:info@tajweedoo.com`
5. (اختياري ومستحسن) **Custom MAIL FROM**: من صفحة الهوية ← *Custom MAIL FROM
   domain* ← `mail.sard.tajweedoo.com`، وأضف سجلّي MX وTXT اللذين يعطيكهما.
6. **SMTP settings ← Create SMTP credentials**: يُنشئ مستخدم IAM ويعطيك
   **SMTP username** و**SMTP password**. احفظهما؛ لا يظهران مرّة ثانية.
7. إن كان الحساب ما زال في **Sandbox** فلن يرسل إلا لعناوين موثَّقة. من
   **Account dashboard ← Request production access** اطلب الخروج منه (اذكر أنها
   رسائل تأكيد حساب واستعادة كلمة سر فقط).

## ٢) Supabase: البريد

في لوحة المشروع `alzsjurcstjpqqwscpfi`:

1. **Authentication ← Emails ← SMTP Settings** ← فعّل *Enable custom SMTP*:
   - Sender email: `info@sard.tajweedoo.com`
   - Sender name: `تطبيق السرد القرآني`
   - Host: `email-smtp.<المنطقة>.amazonaws.com` (لحسابنا: `email-smtp.eu-north-1.amazonaws.com`)
   - Port: `587`
   - Username / Password: من الخطوة ٦ أعلاه.
2. **Authentication ← Emails ← Templates**: الصق قوالب الرسائل العربية:

   | القالب | الموضوع (Subject) | المحتوى |
   |---|---|---|
   | Confirm signup | `أكّد بريدك — تطبيق السرد القرآني` | `sard/backend/supabase/templates/confirmation.html` |
   | Reset password | `اختر كلمة سر جديدة — تطبيق السرد القرآني` | `sard/backend/supabase/templates/recovery.html` |
   | Change email address | `أكّد بريدك الجديد — تطبيق السرد القرآني` | `sard/backend/supabase/templates/email_change.html` |

3. **Authentication ← Rate Limits**: ارفع *emails sent per hour* (مثلًا 100).

## ٣) Supabase: طرق الدخول والروابط

1. **Authentication ← Sign In / Providers**:
   - **Email**: مفعّل، و**Confirm email: ON**، و*Minimum password length* = 8.
   - **Allow anonymous sign-ins: ON**. هذا ما يُدخل هاتف المشارك حين ينضمّ برمز
     أو رابط دعوة؛ بدونه لا ينضمّ أحد.
2. **Authentication ← URL Configuration**:
   - Site URL: `https://sard.tajweedoo.com/app/`
   - Redirect URLs: أضف `https://sard.tajweedoo.com/**` و`com.tajweedoo.sard://auth`

## ٤) Google

1. **Google Cloud Console** ← اختر مشروعًا أو أنشئ واحدًا.
2. **APIs & Services ← OAuth consent screen** (أو *Google Auth Platform ←
   Branding*):
   - App name: `تطبيق السرد القرآني`، وشعاره، وبريد الدعم.
   - Authorized domains: `tajweedoo.com` و`supabase.co`.
   - Privacy policy: `https://sard.tajweedoo.com/privacy.html`
   - ثم **Publish app** (In production) ليدخل به أيّ أحد، لا المختبِرون وحدهم.
3. **Credentials ← Create credentials ← OAuth client ID ← Web application**:
   - Authorized redirect URIs: `https://alzsjurcstjpqqwscpfi.supabase.co/auth/v1/callback`
   - انسخ **Client ID** و**Client secret**.
4. في Supabase: **Authentication ← Sign In / Providers ← Google** ← فعّله والصق
   القيمتين.

> شاشة Google تذكر عنوان الرجوع (`alzsjurcstjpqqwscpfi.supabase.co`). لتظهر
> باسم نطاقك بدلها يلزم *Custom Domain* في Supabase (إضافة مدفوعة، مثل
> `auth.tajweedoo.com`) أو توثيق العلامة (Brand verification) في Google، فيظهر
> اسم التطبيق وشعاره. كلاهما اختياري؛ الدخول يعمل بدونهما.

## ٥) التطبيق على الهاتف

Google لا يقبل الدخول من داخل عارض التطبيق، فالتطبيق يفتح المتصفّح، ويعود
Google إلى `com.tajweedoo.sard://auth` المعرَّف في `AndroidManifest.xml`
و`Info.plist`. وهذا يحتاج نسخة جديدة من التطبيق: شغّل **بناء تطبيق الأندرويد**
من تبويب Actions برقم إصدار أكبر من السابق.

وروابط البريد (التأكيد، واستعادة كلمة السر) تُفتح في المتصفّح على
`sard.tajweedoo.com` حتى لو أُنشئ الحساب من التطبيق: يُؤكَّد البريد أو تُضبط
كلمة السر هناك، ثم يدخل صاحبها في التطبيق ببريده وكلمة سره.

## ٦) دعوة المشاركين

من «المشاركون في الجلسة» يضيف المقرئ مشاركًا ويضغط «دعوة للانضمام»، فيظهر رمز
كبير يُقرأ في المجلس، وزرّا **إرسال عبر واتساب** و**نسخ الدعوة**. والدعوة رسالة
فيها رابط `https://sard.tajweedoo.com/app/#/join/<الرمز>`: من يفتحه تنفتح له
شاشة الانضمام والرمز مكتوب، فيضغط «انضمام». والرمز صالح نصف ساعة، ويسقط بمجرّد
استعماله.
