# تجربة جدوى: التعرّف على التلاوة في المتصفح

**السؤال:** هل يمكن تشغيل نموذج `zipformer_p_arabic_v3` — الذي يعمل اليوم في قشرة
Android وحدها — داخل المتصفح، ليجرّبه أيّ أحد من رابط؟

**الجواب: نعم.** جُرِّب بالنموذج الحقيقي (`zipformer_p_arabic_v3.1.int8.onnx`، ٧٢ م.ب) في
Chromium: مخرجه مطابق لـsherpa-onnx — نفس المحرّك الذي في أندرويد — وأسرع من زمن التلاوة
في كل القياسات. بقي: تلاوة بشرية حقيقية، وهاتف حقيقي، وSafari.

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

## ما تحقّق

### بالنموذج الحقيقي

metadata النموذج: ‎T=61‎، ‎decode_chunk_len=48‎، ست طبقات مكدّسة (٩٨ موتّر حالة).
لا تسجيل بشريًّا في بيئة البناء، فالكلام مولَّد بصوت عربي (piper `ar_JO-kareem`، ليس تلاوة):
الفاتحة ١–٥ صحيحة، ونسخة فيها «الكريم» مكان «الرحيم» و«نعبد وإياك» محذوفة.

| الفحص | النتيجة |
|---|---|
| ما سمعه النموذج (الصحيحة) | `بِ س مِ هِ ررَ ح مَ اا نِ ررَ حِ ۦۦۦۦ م ل حَ م دُ لِ ل هِ رَ ببَ ل عَ اا لَ مِ ۦۦ ن …` |
| ما سمعه (الخاطئة) | `… ر ح مَ اا نِ ل كَ رِ ۦۦ م …` ثم `ءِ ييَ اا كَ نَ س تَ عِ ۦۦ ن` — الخطآن ظاهران |
| المنفذ مقابل sherpa-onnx في Node (الصحيحة) | **متطابق** ٦٥/٦٥ |
| (الخاطئة) | ٥٧/٥٨ متطابق؛ الفرق حركة آخر حرف («ن» / «نُ») عند الوقف |
| في Chromium 141 (الصحيحة) | **متطابق** ٦٥/٦٥ |

**الفرق الوحيد** إطار كان النموذج فيه متردّدًا بين رمزين بفارق ضئيل، فحسمه إصداران مختلفان
من onnxruntime (sherpa يضمّ إصداره) بطريقتين — كما يحدث بين هاتفين بمعالجين مختلفين.
وكان هناك فرق ثانٍ من هذا الجنس سببه حساب الخصائص بدقّة double؛ فصارت تُحسب بـfloat32
كما في كالدي، فزال.

### الكلفة في Chromium (١٤ ث من الكلام، ٤ أنوية)

RTF = زمن المعالجة ÷ زمن الصوت؛ أقلّ من ١ يعني أسرع من التلاوة نفسها.

| | ٤ خيوط | خيط واحد |
|---|---|---|
| سرعة كاملة | **0.10** | **0.15** |
| المعالج أبطأ ٤ مرّات (تقريب لهاتف متوسّط) | **0.38** | **0.65** |

إنشاء الجلسة مرّة واحدة: ‎1.3–2.2‎ ث، و‎6.5‎ ث مع الإبطاء.

### على نماذج بديلة (قبل توفّر الحقيقي)

`make_models.py` يبني نموذجًا بواجهة Zipformer2 CTC (كل حالة تؤثّر في المخرج بأوزانها،
فأيّ خلط يظهر) ونموذجًا بوزن ٦٥ مليون معامل int8 للكلفة. المنفذ طابق sherpa-onnx على
الأوّل في Node وChromium، و`fbank-check.mjs` يطابق kaldi-native-fbank (فرق ‎≤2e-4‎ حيث
يوجد صوت) ويكشف خمسة أخطاء متعمّدة في الخصائص.

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

## ما بقي

1. **تلاوة بشرية حقيقية** (والأفضل مع أخطاء مقصودة معروفة) — الكلام المولَّد ليس تلاوة:

   ```bash
   node compare.mjs zipformer_p_arabic_v3.1.int8.onnx ../../sard/public/asr/tokens.txt recitation.wav
   node browser-check.mjs models/model.onnx models/recitation.wav   # بعد نسخهما إلى models/
   ```
2. **هاتف حقيقي وSafari** — الميكروفون والخيوط يحتاجان https، فيُجرَّب من نشر معاينة
   لا من `localhost`.
3. **v3 أم v3.1؟** التطبيق كُتب لـv3؛ الذي جُرِّب هنا v3.1 (ضبط دقيق للمدود) بنفس رموز
   `tokens.txt` الـ251. يُختار واحد ويُثبَّت.
4. ثم `src/lib/asr/web-engine.ts` يطبّق `AsrEngine` فوق `web-asr.js` كما يطبّقه
   `native-engine.ts` فوق الـplugin، مع شاشة موافقة على تنزيل النموذج.
