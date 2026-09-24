# تجربة جدوى: التعرّف على التلاوة في المتصفح

**السؤال:** هل يمكن تشغيل نموذج `zipformer_p_arabic_v3` — الذي يعمل اليوم في قشرة
Android وحدها — داخل المتصفح، ليجرّبه أيّ أحد من رابط؟

**الجواب حتى الآن: نعم تقنيًّا، مع شرط واحد لم يُستوفَ بعد:** تجربته بالنموذج الحقيقي
وتسجيل تلاوة حقيقي (لم يُتَح النموذج في بيئة البناء؛ انظر «ما بقي»).

## الطريقة

لا بناء لـsherpa-onnx للمتصفح: حزمة npm الرسمية مبنيّة لـNode وحده (`NODERAWFS`، ترمي
خطأً في الصفحة)، والبدائل على npm بناءات من أطراف ثالثة. فنُقلت القطع الثلاث التي
يستعملها `SardAsrPlugin.kt` إلى JavaScript فوق **onnxruntime-web** (من Microsoft):

| القطعة | الأصل في sherpa-onnx | هنا |
|---|---|---|
| خصائص fbank (كالدي) | `features.h` + kaldi-native-fbank | `Fbank` في `web-asr.js` |
| حلقة Zipformer2 CTC المتدفّقة وحالاتها | `online-zipformer2-ctc-model.cc`، `online-recognizer-ctc-impl.h` | `Recognizer` / `Stream` |
| البحث الجشع في CTC | `online-ctc-greedy-search-decoder.cc` | `Stream.greedy` |

المخرج بالشكل نفسه الذي يسلّمه الـplugin إلى `native-engine.ts`:
`{ symbol, confidence: null, atMs }` — فلا يتغيّر شيء فوق طبقة المحرّك.

## ما تحقّق (على نموذج بديل)

النموذج الحقيقي غير متاح هنا، فبُني بديلان (`make_models.py`):

- **نموذج الواجهة** — المفاتيح الوصفية نفسها، والحالات العشرون بأشكالها وترتيبها،
  و`processed_lens` من نوع int64، ومخرج على رموز `tokens.txt` الـ251. كل حالة تؤثّر
  في المخرج بأوزان خاصّة بها، فأيّ خلط في الحالات يغيّر الرموز.
- **نموذج الوزن** — نحو ٦٥ مليون معامل int8 (٦٣ م.ب، من فئة الملف الحقيقي ٦٩ م.ب)،
  لتقدير الكلفة فقط.

| الفحص | النتيجة |
|---|---|
| `compare.mjs`: المنفذ مقابل sherpa-onnx الرسمي (npm، نفس C++ الذي في أندرويد) | **متطابق**: ٣٥/٣٥ رمزًا بأزمنتها |
| `fbank-check.mjs`: الخصائص مقابل kaldi-native-fbank | فرق أقصى ‎1.7e-4‎ حيث يوجد صوت؛ ‎4.3e-3‎ قرب الصمت (تقريب float32 في كالدي) |
| هل الفحصان يكشفان الخطأ؟ (أخطاء متعمّدة) | خمسة أخطاء في الخصائص كُشفت كلّها؛ تبديل حالتين كُشف |
| `browser-check.mjs`: الصفحة في Chromium 141 | **متطابق** مع sherpa-onnx: ٣٥/٣٥ |

### الكلفة (نموذج الوزن، Chromium بلا واجهة، ٤ أنوية)

RTF = زمن المعالجة ÷ زمن الصوت؛ أقلّ من ١ يعني أسرع من التلاوة نفسها.
«٨/١٦ إطارًا» حدّان أدنى وأعلى تقريبيّان لما يقابل ٣٢٠ م.ث من الصوت.

| | ٤ خيوط | خيط واحد |
|---|---|---|
| سرعة كاملة | 0.04 – 0.07 | 0.11 – 0.17 |
| المعالج أبطأ ٤ مرّات (تقريب لهاتف متوسّط) | 0.14 – 0.21 | 0.46 – 0.75 |

إنشاء الجلسة ‎0.1–0.4‎ ث. **هذه كلفة وزن لا كلفة النموذج الحقيقي**: الانتباه والالتفاف
يضيفان ما لا يقيسه هذا البديل، والإبطاء المصطنع لا يمثّل هاتفًا حقيقيًّا تمامًا.

## ملاحظات خرجت بها التجربة

1. **ذيل التسجيل لا يُفكّ في أندرويد.** يستدعي الـplugin `inputFinished()` بلا حشو صمت،
   و`IsReady` في sherpa يشترط `processed + T < frames`؛ فآخر ‎(T − shift)‎ إلى T إطارًا
   لا تُعالَج أبدًا — ‎0.14–0.45‎ ث مع T=45 وshift=32 (القيم الحقيقية في metadata
   النموذج). المنفذ يطابق هذا السلوك افتراضيًّا، ويقبل `tailPaddingSeconds` لإصلاحه.
   يستحقّ الفحص: قد يظهر آخر التلاوة «حذفًا» لم يحدث.
2. **الخيوط تحتاج عزلًا بين الأصول** (`COOP: same-origin` + `COEP: require-corp` أو
   `credentialless`). بدونها خيط واحد، وهو ما زال أسرع من الزمن الحقيقي في كل القياسات
   أعلاه. لكنّ `require-corp` يمنع صفائح المصحف من R2 ما لم تُرسَل بترويسة CORP أو
   تُطلَب بـ`crossorigin` — يُختبر قبل تفعيله.
3. **٦٩ م.ب تُنزَّل مرّة** وتُحفظ في Cache API، وبعد موافقة المستخدم على شاشة تذكر الحجم
   (كما يشترط `SardAsrPlugin.prepare`). يلزم مكان لاستضافتها بـCORS (R2 مثلًا).
4. لم يُجرَّب Safari/iOS ولا Firefox — Chromium وحده.

## التشغيل

```bash
cd spikes/asr-web
npm install
pip install onnx onnxruntime numpy kaldi-native-fbank   # للنماذج البديلة وفحص الخصائص

python3 make_models.py models
node compare.mjs models/fake-zipformer2-ctc.onnx ../../sard/public/asr/tokens.txt
python3 fbank_ref.py models/synthetic.wav models/ref.f32 && node fbank-check.mjs models/synthetic.wav models/ref.f32
node browser-check.mjs            # يحتاج playwright مثبّتًا عامًّا
node serve.mjs                    # ثم http://localhost:8096/ للتجربة باليد
```

## ما بقي — وهو الحاسم

بالنموذج الحقيقي وتسجيل تلاوة (16 kHz أحادي):

```bash
node compare.mjs zipformer_p_arabic_v3.int8.onnx ../../sard/public/asr/tokens.txt recitation.wav
```

يجب أن يطبع `IDENTICAL`. ثم `node serve.mjs` وافتح الصفحة على **هاتف** (على الشبكة
نفسها)، حمّل النموذج، وسجّل من الميكروفون؛ السجلّ يطبع RTF. إن كان أقلّ من ~0.5 على
هاتف متوسّط فالطريق مفتوح، والخطوة التالية `src/lib/asr/web-engine.ts` يطبّق `AsrEngine`
فوق `web-asr.js` كما يطبّقه `native-engine.ts` فوق الـplugin.
