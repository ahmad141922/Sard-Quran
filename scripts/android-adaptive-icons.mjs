/**
 * يصحّح مقاسات أيقونة أندرويد التكيّفيّة، ويعطي شاشة إقلاع أندرويد ١٢ أيقونتها.
 *
 *   npm run android:icons
 *
 * ويُشغَّل **بعد** `npx capacitor-assets generate` لا قبله، لأنه يكتب فوق ما
 * تكتبه — انظر `docs/android.md`.
 *
 * ── لماذا يوجد هذا الملفّ ──────────────────────────────────────────────
 *
 * في `@capacitor/assets@3` خطأ: طبقتا الأيقونة التكيّفيّة تُولَّدان بمقاسات
 * الأيقونة **القديمة** لا التكيّفيّة. الشيفرة عنده:
 *
 *     const icons = Object.values(AndroidAssetTemplates)
 *       .filter(a => a.kind === 'icon');        // ← 36 · 48 · 72 · 96 · 144 · 192
 *
 * بينما في الجدول نفسه `kind === 'adaptive-icon'` وهو ٨١ · ١٠٨ · ١٦٢ · ٢١٦ ·
 * ٣٢٤ · ٤٣٢ — لأنّ لوح الأيقونة التكيّفيّة ١٠٨dp لا ٤٨dp. فيخرج
 * `ic_launcher_foreground.png` عند xxxhdpi ١٩٢ بكسل ومطلوبه ٤٣٢، أي أنّ
 * أندرويد يكبّر ٢٫٢٥ ضعفًا قبل أن يرسم شيئًا.
 *
 * ويظهر ذلك في الشاشة الأولى أوضح ما يكون: `targetSdk 35` يعني أنّ أندرويد ١٢
 * فصاعدًا يرسم شاشة إقلاعه هو، وأيقونتها هي أيقونة المشغّل مكبَّرةً من ١٠٨dp
 * إلى ٢٤٠dp — فيجتمع تكبيران على صورة صغيرة أصلًا، والنتيجة حوافّ مسنّنة.
 *
 * فهنا شيئان:
 *
 *   ١) الطبقتان بمقاساتهما الصحيحة، فتُرسم الأيقونة بلا تكبير في المشغّل.
 *   ٢) `splash_icon` — أيقونة مرسومة لمقاس شاشة الإقلاع نفسه (٢٤٠dp)، تشير
 *      إليها `values-v31/styles.xml`. وبها لا يكبّر أندرويد شيئًا البتّة.
 *
 * والمصدر واحد: `assets/sard-mark.png` — الشعار شفّاف الخلفيّة بلا لوح.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const MARK = join(ROOT, 'assets', 'sard-mark.png');

/** كريم اللوح الذي يقف عليه الشعار — نفسه في `assets/icon.png`. */
const CREAM = { r: 255, g: 247, b: 237, alpha: 1 };
/** كريم الخلفيّة التكيّفيّة — نفسه في `assets/icon-background.png`. */
const CREAM_BG = { r: 253, g: 248, b: 239, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** كثافات أندرويد ومضاعِفاتها. */
const DENSITIES = [
  ['ldpi', 0.75],
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

/** لوح الأيقونة التكيّفيّة، بالـdp. */
const ADAPTIVE_DP = 108;
/**
 * ارتفاع الشعار داخل الطبقة، نسبةً إليها.
 *
 * ٦٢٪ — وهو ما كانت `capacitor-assets` تخرجه، فالحجم لا يتغيّر وإنّما دقّته.
 * (و`ic_launcher.xml` يزيح الطبقة ١٦٫٧٪ فتقع في منطقة الأمان ٧٢dp، فيصير
 * الشعار ٦٢٪ من الدائرة التي تراها العين.)
 */
const MARK_IN_LAYER = 0.62;

/** لوح أيقونة شاشة إقلاع أندرويد ١٢، بالـdp — ودائرتها المرئيّة ١٦٠dp. */
const SPLASH_ICON_DP = 240;
/** الشعار نفسه بمقياس تلك الشاشة: ٦٢٪ من دائرة ١٦٠ في لوح ٢٤٠. */
const MARK_IN_SPLASH = MARK_IN_LAYER * (160 / SPLASH_ICON_DP);

// ── الشعار مقصوصًا على حوافّه هو ─────────────────────────────────────────
const { data, info } = await sharp(MARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const MARK_W = maxX - minX + 1;
const MARK_H = maxY - minY + 1;
const TRIMMED = await sharp(MARK)
  .extract({ left: minX, top: minY, width: MARK_W, height: MARK_H })
  .png()
  .toBuffer();

/** الشعار وسط مربّع، بارتفاعٍ نسبته `fraction` منه. */
const tile = async (size, fraction, background) => {
  const h = Math.round(size * fraction);
  const w = Math.round(h * (MARK_W / MARK_H));
  const layer = await sharp(TRIMMED).resize(w, h).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: layer, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png();
};

const write = async (pipeline, ...parts) => {
  const dest = join(RES, ...parts);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline.toFile(dest);
  return parts.join('/');
};

const done = [];
for (const [density, scale] of DENSITIES) {
  const px = Math.round(ADAPTIVE_DP * scale);

  // الواجهة: اللوح الكريميّ وعليه الشعار — نفس ما كان، بدقّته الصحيحة.
  done.push(`${await write(await tile(px, MARK_IN_LAYER, CREAM), `mipmap-${density}`, 'ic_launcher_foreground.png')}  ${px}px`);

  // الخلفيّة: لون واحد، فمقاسها لا يغيّر مظهرها — لكنّ الطبقتين يجب أن
  // تتّفقا في اللوح وإلّا رسم أندرويد إحداهما على مقاس الأخرى.
  done.push(`${await write(
    sharp({ create: { width: px, height: px, channels: 4, background: CREAM_BG } }).png(),
    `mipmap-${density}`, 'ic_launcher_background.png',
  )}  ${px}px`);

  // أيقونة شاشة إقلاع أندرويد ١٢: شفّافة، ودائرتها الكريميّة يرسمها النظام
  // من `windowSplashScreenIconBackgroundColor`. وldpi لا شاشة إقلاع لها.
  if (density !== 'ldpi') {
    const spx = Math.round(SPLASH_ICON_DP * scale);
    done.push(`${await write(await tile(spx, MARK_IN_SPLASH, CLEAR), `drawable-${density}`, 'splash_icon.png')}  ${spx}px`);
  }
}

for (const line of done) console.log('  ', line);
console.log(`[android-icons] ${done.length} ملفًّا — الأيقونة التكيّفيّة على ١٠٨dp، وأيقونة الإقلاع على ٢٤٠dp`);
