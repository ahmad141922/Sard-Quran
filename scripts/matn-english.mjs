/**
 * English names for the chapters, composed rather than hand-typed.
 *
 * Two hundred and forty-seven titles, and most of them are one of a handful of
 * shapes: «sūrat X», «min sūrati X ilā sūrati Y», «bāb X». So the sura names
 * come from the app's own table — the same spellings the rest of the interface
 * uses, which is the point — and the technical vocabulary from the lexicon
 * below. Anything the composer cannot account for is reported rather than
 * guessed at, and gets an entry in `OVERRIDES`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';


/** The sura names, Arabic to English, out of the app's own data. */
function suraNames() {
  const src = readFileSync(join('src', 'lib', 'quran-data.ts'), 'utf8');
  const ar = [...src.matchAll(/\{n:(\d+),name:'([^']+)'/g)].map(m => [+m[1], m[2]]);
  const enBlock = src.slice(src.indexOf('SURAH_NAMES_EN'), src.indexOf('SURAH_NAMES_FR'));
  const en = [...enBlock.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const map = new Map();
  for (const [n, name] of ar) map.set(fold(name), en[n - 1]);
  // Spellings the prints use that the table does not.
  map.set(fold('أم القرآن'), 'Umm al-Qurʾān');
  map.set(fold('المؤمن'), 'Ghafir');
  map.set(fold('الشريعة'), 'Al-Jathiyah');
  map.set(fold('الامتحان'), 'Al-Mumtahanah');
  map.set(fold('المحتان'), 'Al-Mumtahanah');
  map.set(fold('ن'), 'Al-Qalam');
  map.set(fold('الحمد'), 'Al-Fatihah');
  map.set(fold('التطفيف'), 'Al-Mutaffifin');
  map.set(fold('المحتان'), 'Al-Mumtahanah');
  return map;
}

/**
 * A title reduced to what two prints of it would have in common: no \u1E0Dab\u1E6D, and
 * the hamza carriers, final y\u0101\u02BE and t\u0101\u02BE marb\u016B\u1E6Da spelled one way. Spaces are
 * kept, because the lexicon is keyed on whole phrases.
 */
export const key = (s) => s
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
  .replace(/[^\u0621-\u064A\s]/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** The same, with the spaces gone too \u2014 for matching a single name. */
export const fold = s => s
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[^\u0621-\u064A]/g, '');

const SURA = suraNames();

/** The vocabulary of the chapter headings themselves. */
const TERMS = new Map(Object.entries({
  'المقدمه': 'Introduction',
  'مقدمه': 'Introduction',
  'الخطبه': 'Preamble',
  'خاتمه': 'Conclusion',
  'الخاتمه': 'Conclusion',
  'الاستعاذه': 'The istiʿādha',
  'البسمله': 'The basmala',
  'الاستعاذه والبسمله': 'The istiʿādha and the basmala',
  'البسمله وام القران': 'The basmala and Umm al-Qurʾān',
  'الادغام الكبير': 'The greater idghām',
  'الادغام الصغير': 'The lesser idghām',
  'الادغام': 'Idghām',
  'تقسيم الادغام': 'The kinds of idghām',
  'ادغام الحرفين المتقاربين في كلمه وفي كلمتين': 'Idghām of two near letters, within a word and across two',
  'هاء الكنايه': 'The hāʾ of pronominal reference',
  'المد والقصر': 'Madd and qaṣr',
  'المد': 'Madd',
  'احكام المد': 'The rules of madd',
  'اقسام المد': 'The kinds of madd',
  'اقسام المد اللازم': 'The kinds of obligatory madd',
  'مراتب المدود': 'The degrees of madd',
  'الهمزتين من كلمه': 'Two hamzas in one word',
  'الهمزتان من كلمه': 'Two hamzas in one word',
  'الهمزتين من كلمتين': 'Two hamzas across two words',
  'الهمزتان من كلمتين': 'Two hamzas across two words',
  'الهمز المفرد': 'The single hamza',
  'نقل حركه الهمزه الي الساكن قبلها': 'Moving the hamza’s vowel onto the silent letter before it',
  'النقل والسكت والوقف علي الهمز': 'Naql, sakt and stopping on the hamza',
  'وقف حمزه وهشام علي الهمز': 'Ḥamza and Hishām stopping on the hamza',
  'السكت علي الساكن قبل الهمز وغيره': 'Sakt before a hamza and elsewhere',
  'الاظهار والادغام': 'Iẓhār and idghām',
  'الاظهار': 'Iẓhār',
  'اتفاقهم في ادغام اذ وقد وتاء التانيث وهل وبل': 'Where they agree on assimilating idh, qad, the tāʾ of the feminine, hal and bal',
  'ذكر ذال اذ': 'The dhāl of idh',
  'ذكر دال قد': 'The dāl of qad',
  'ذكر تاء التانيث': 'The tāʾ of the feminine',
  'ذكر لام هل وبل': 'The lām of hal and bal',
  'فصل ذال اذ': 'The dhāl of idh',
  'فصل دال قد': 'The dāl of qad',
  'فصل تاء التانيث': 'The tāʾ of the feminine',
  'فصل لام هل وبل': 'The lām of hal and bal',
  'حروف قربت مخارجها': 'Letters whose points of articulation are close',
  'احكام النون الساكنه والتنوين': 'The rules of the silent nūn and tanwīn',
  'النون الساكنه والتنوين': 'The silent nūn and tanwīn',
  'تعريف النون الساكنه والتنوين': 'What the silent nūn and tanwīn are',
  'التعريف': 'The definitions',
  'حكم النون والميم المشددتين': 'The doubled nūn and mīm',
  'احكام الميم الساكنه': 'The rules of the silent mīm',
  'الميم الساكنه': 'The silent mīm',
  'الغنه': 'Ghunna',
  'اقسام اللامات واحكامها': 'The kinds of lām and their rules',
  'اللامات': 'The lāms',
  'اللامات السواكن': 'The silent lāms',
  'مخارج الحروف': 'The points of articulation',
  'مخارج الحروف وصفاتها التي يحتاج القارئ اليها': 'The points of articulation and the qualities a reciter needs',
  'القاب الحروف': 'The names given to the letters',
  'فصل في الحرف والمخرج واقسام الحروف': 'The letter, its point of articulation, and the classes of letters',
  'تقسيم الحروف': 'The classes of letters',
  'صفات الحروف': 'The qualities of the letters',
  'صفات الحروف اللازمه المشهوره': 'The inherent qualities, as commonly given',
  'صفات الحروف العارضه': 'The contingent qualities',
  'تقسيم الصفات': 'The classes of quality',
  'معاني الصفات': 'What the qualities mean',
  'المثلين واخواته': 'Identical letters and their kin',
  'المتماثلان والمتجانسان والمتقاربان والمتباعدان': 'Identical, homogeneous, near and distant letters',
  'الفتح والاماله وبين اللفظين': 'Fatḥ, imāla, and between the two',
  'اماله هاء التانيث وما قبلها في الوقف': 'Imāla of the feminine hāʾ and what precedes it, in pausing',
  'مذهب الكسائي في اماله هاء التانيث في الوقف': 'Al-Kisāʾī on imāla of the feminine hāʾ in pausing',
  'مذاهبهم في الراءات': 'Their doctrines on the rāʾs',
  'الراءات واللامات والوقف علي المرسوم': 'The rāʾs, the lāms, and stopping on the written form',
  'الراء': 'The rāʾ',
  'مراتب التفخيم': 'The degrees of tafkhīm',
  'الترقيق': 'Tarqīq',
  'الترقيق والتفخيم': 'Tarqīq and tafkhīm',
  'الوقف علي اواخر الكلم': 'Stopping on the ends of words',
  'كيفيه الوقف علي اواخر الكلم': 'How to stop on the ends of words',
  'الوقف علي مرسوم الخط': 'Stopping on the written form',
  'مذاهبهم في ياءات الاضافه': 'Their doctrines on the yāʾs of annexation',
  'ياءات الاضافه': 'The yāʾs of annexation',
  'ياءات الزوائد': 'The added yāʾs',
  'الياءات الزوائد': 'The added yāʾs',
  'مذاهبهم في الزوائد': 'Their doctrines on the added yāʾs',
  'التكبير': 'The takbīr',
  'افراد القراءات وجمعها': 'Reading the qirāʾāt singly and together',
  'انواع العارض للوقف': 'The kinds of ending a pause creates',
  'وجوه العوارض المنفرده': 'The contingent endings, taken singly',
  'وجوه العوارض المجتمعه المختلفه': 'The contingent endings where several differ at once',
  'وجوه اللين مع العوارض': 'Līn together with the contingent endings',
  'وجوه الوقف علي المد اللازم': 'Ways of stopping on the obligatory madd',
  'تحديد حفص في نوعي المد اللازم': 'What Ḥafṣ fixes for the two obligatory madds',
  'التجويد ومراتبه': 'Tajwīd and its degrees',
  'حد التجويد': 'What tajwīd is',
  'مراتب القراءه': 'The degrees of recitation',
  'بيان اللحن والواجب في علم التجويد': 'Laḥn, and what tajwīd requires',
  'اركان القرءان': 'The pillars of Qurʾānic reading',
  'استعمال الحروف': 'Using the letters',
  'الوقوف': 'The pauses',
  'الوقف والابتداء والقطع والسكت': 'Waqf, ibtidāʾ, qaṭʿ and sakt',
  'معرفه المقطوع والموصول': 'Words written apart and written joined',
  'المقطوع والموصول': 'Words written apart and written joined',
  'التاءات': 'The tāʾs',
  'التاءات المفتوحه': 'The open tāʾs',
  'المحذوف والثابت من حروف المد': 'Which letters of madd are dropped and which stand',
  'الاثبات والحذف': 'What stands and what is dropped',
  'الابتداء بهمز الوصل': 'Beginning with a hamzat al-waṣl',
  'كيفيه الابتداء بهمزه الوصل': 'How to begin with a hamzat al-waṣl',
  'فصل في احرف فواتح السور': 'The disjoined letters that open the suras',
  'تنبيهات لمن يقرا بروايه حفص من طريق الشاطبيه': 'Notes for readers of Ḥafṣ by way of ash-Shāṭibiyya',
  'ما يراعي لحفص': 'What to observe for Ḥafṣ',
  'فرش الحروف': 'Farsh al-ḥurūf',
  'ذال اذ': 'The dhāl of idh',
  'دال قد': 'The dāl of qad',
  'تاء التانيث': 'The tāʾ of the feminine',
  'لام هل وبل': 'The lām of hal and bal',
  'في الحرف والمخرج واقسام الحروف': 'The letter, its point of articulation, and the classes of letters',
  'في احرف فواتح السور': 'The disjoined letters that open the suras',
  'الفتح والاماله': 'Fatḥ and imāla',
}));

/** Titles the composer cannot reach, given outright. */
const OVERRIDES = new Map(Object.entries({}));

/** Drops the word that only says «this is a chapter». */
const clean = t => key(t).replace(/^(?:باب|فصل|ذكر)\s+/, '').trim();

/** The English name of one chapter, or null if nothing could be composed. */
export function englishTitle(titleAr) {
  const whole = key(titleAr);
  if (OVERRIDES.has(whole)) return OVERRIDES.get(whole);

  const body = clean(titleAr);
  if (TERMS.has(body)) return TERMS.get(body);

  const sura = suraTitle(titleAr, lookup);
  if (sura) return sura;
  return null;
}

function lookup(name) {
  const k = fold(name.replace(/^(سُ?و?َ?رَ?ةِ?|سوره)\s*/, ''));
  return SURA.get(k) || SURA.get(k.replace(/^ال/, '')) || SURA.get('ال' + k) || null;
}

/* ─── sura names in a heading ────────────────────────────────────────── */

/** Honorifics and editorial asides: true of the sura, not part of its name. */
const HONORIFIC = new RegExp([
  'صلي الله عليه وسلم',
  'عليهما الصلاه والسلام', 'عليه الصلاه والسلام', 'عليهم الصلاه والسلام',
  'عليهما السلام', 'عليها السلام', 'عليهم السلام', 'عليه السلام',
  'عز وجل', 'تعالي', 'اي',
].join('|'), 'g');

export const strip = titleAr => key(titleAr).replace(HONORIFIC, ' ').replace(/\s+/g, ' ').trim();

/**
 * The English for «sūrat X» and its relatives, or null.
 *
 * `lookup` turns one normalised sura name into English; it is passed in so this
 * knows nothing about where the name table comes from.
 */
export function suraTitle(titleAr, lookup) {
  const t = strip(titleAr);

  const range = t.match(/^و?من سوره (.+?) الي (?:اخر القران|سوره (.+))$/);
  if (range) {
    const from = names(range[1], lookup);
    const to = range[2] ? names(range[2], lookup) : ['the end of the Qurʾān'];
    if (from && to) return `From ${listOf(from)} to ${listOf(to)}`;
    return null;
  }

  const plain = t.match(/^(?:فرش )?سوره (.+)$/);
  if (!plain) return null;

  // «wa-ukhtayhā» — the two suras that follow, which the print does not name.
  const sisters = plain[1].match(/^(.+?) واخت(يها|ها)(?: و(.+))?$/);
  if (sisters) {
    const head = names(sisters[1], lookup);
    if (!head) return null;
    return `${listOf(head)} and the ${sisters[2] === 'يها' ? 'two suras' : 'sura'} after it`;
  }
  const list = names(plain[1], lookup);
  return list ? listOf(list) : null;
}

/** «al-Baqara», «Yūnus wa-Hūd», «ar-Rūm wa-Luqmān wa-as-Sajda». */
function names(text, lookup) {
  const parts = text.split(/\s+و(?=[ء-ي])/).map(s => s.trim()).filter(Boolean);
  const out = parts.map(lookup);
  return out.every(Boolean) ? out : null;
}

const listOf = list =>
  list.length <= 1 ? list[0]
    : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
