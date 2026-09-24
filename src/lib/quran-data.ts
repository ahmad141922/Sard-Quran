// Shared Quran text source.
//
// The Hafs mushaf JSON is 4.2 MB. QuranModal (canvas insert) and the recitation
// session both need it, so the fetch, the cache and the font load live here —
// downloading it twice on a classroom tablet is not acceptable.
//
// The file is precached by the service worker (`json` is in globPatterns in
// vite.config.ts and the file is under the 15 MB cap), so everything here works
// offline after the first install.

import { withBase } from './asset-url';
import { displayLang, isArabic, type DisplayLang } from './display-lang';

export type Qiraah = 'hafs' | 'warsh';

/** One record of `public/hafs_smart_v8.json`. */
export interface QuranVerse {
  /** Global ayah index, 1..6236 — the key the recitation session tracks positions with. */
  id: number;
  /** Juz' number, 1..30. */
  jozz: number;
  sura_no: number;
  sura_name_ar: string;
  sura_name_en: string;
  /** Mushaf page, 1..604. */
  page: number;
  line_start: number;
  line_end: number;
  aya_no: number;
  /** Uthmani text in the HafsSmart private-use encoding — needs the bundled font. */
  aya_text: string;
  /** Plain imlaa'i text — readable in any Arabic font, used for search and fallback. */
  aya_text_emlaey: string;
}

export const QIRAAH_CONFIG: Record<Qiraah, { url: string; label: string; sublabel: string }> = {
  hafs: { url: withBase('hafs_smart_v8.json'), label: 'حفص عن عاصم', sublabel: 'الرسم العثماني' },
  warsh: { url: withBase('quran-warsh.json'), label: 'ورش عن نافع', sublabel: 'من طريق الأزرق - رسم المصحف' },
};

/** The 114 surahs with their ayah counts. */
export const SURAHS: { n: number; name: string; ayahs: number }[] = [
  {n:1,name:'الفاتحة',ayahs:7},{n:2,name:'البقرة',ayahs:286},{n:3,name:'آل عمران',ayahs:200},{n:4,name:'النساء',ayahs:176},
  {n:5,name:'المائدة',ayahs:120},{n:6,name:'الأنعام',ayahs:165},{n:7,name:'الأعراف',ayahs:206},{n:8,name:'الأنفال',ayahs:75},
  {n:9,name:'التوبة',ayahs:129},{n:10,name:'يونس',ayahs:109},{n:11,name:'هود',ayahs:123},{n:12,name:'يوسف',ayahs:111},
  {n:13,name:'الرعد',ayahs:43},{n:14,name:'إبراهيم',ayahs:52},{n:15,name:'الحجر',ayahs:99},{n:16,name:'النحل',ayahs:128},
  {n:17,name:'الإسراء',ayahs:111},{n:18,name:'الكهف',ayahs:110},{n:19,name:'مريم',ayahs:98},{n:20,name:'طه',ayahs:135},
  {n:21,name:'الأنبياء',ayahs:112},{n:22,name:'الحج',ayahs:78},{n:23,name:'المؤمنون',ayahs:118},{n:24,name:'النور',ayahs:64},
  {n:25,name:'الفرقان',ayahs:77},{n:26,name:'الشعراء',ayahs:227},{n:27,name:'النمل',ayahs:93},{n:28,name:'القصص',ayahs:88},
  {n:29,name:'العنكبوت',ayahs:69},{n:30,name:'الروم',ayahs:60},{n:31,name:'لقمان',ayahs:34},{n:32,name:'السجدة',ayahs:30},
  {n:33,name:'الأحزاب',ayahs:73},{n:34,name:'سبأ',ayahs:54},{n:35,name:'فاطر',ayahs:45},{n:36,name:'يس',ayahs:83},
  {n:37,name:'الصافات',ayahs:182},{n:38,name:'ص',ayahs:88},{n:39,name:'الزمر',ayahs:75},{n:40,name:'غافر',ayahs:85},
  {n:41,name:'فصلت',ayahs:54},{n:42,name:'الشورى',ayahs:53},{n:43,name:'الزخرف',ayahs:89},{n:44,name:'الدخان',ayahs:59},
  {n:45,name:'الجاثية',ayahs:37},{n:46,name:'الأحقاف',ayahs:35},{n:47,name:'محمد',ayahs:38},{n:48,name:'الفتح',ayahs:29},
  {n:49,name:'الحجرات',ayahs:18},{n:50,name:'ق',ayahs:45},{n:51,name:'الذاريات',ayahs:60},{n:52,name:'الطور',ayahs:49},
  {n:53,name:'النجم',ayahs:62},{n:54,name:'القمر',ayahs:55},{n:55,name:'الرحمن',ayahs:78},{n:56,name:'الواقعة',ayahs:96},
  {n:57,name:'الحديد',ayahs:29},{n:58,name:'المجادلة',ayahs:22},{n:59,name:'الحشر',ayahs:24},{n:60,name:'الممتحنة',ayahs:13},
  {n:61,name:'الصف',ayahs:14},{n:62,name:'الجمعة',ayahs:11},{n:63,name:'المنافقون',ayahs:11},{n:64,name:'التغابن',ayahs:18},
  {n:65,name:'الطلاق',ayahs:12},{n:66,name:'التحريم',ayahs:12},{n:67,name:'الملك',ayahs:30},{n:68,name:'القلم',ayahs:52},
  {n:69,name:'الحاقة',ayahs:52},{n:70,name:'المعارج',ayahs:44},{n:71,name:'نوح',ayahs:28},{n:72,name:'الجن',ayahs:28},
  {n:73,name:'المزمل',ayahs:20},{n:74,name:'المدثر',ayahs:56},{n:75,name:'القيامة',ayahs:40},{n:76,name:'الإنسان',ayahs:31},
  {n:77,name:'المرسلات',ayahs:50},{n:78,name:'النبأ',ayahs:40},{n:79,name:'النازعات',ayahs:46},{n:80,name:'عبس',ayahs:42},
  {n:81,name:'التكوير',ayahs:29},{n:82,name:'الانفطار',ayahs:19},{n:83,name:'المطففين',ayahs:36},{n:84,name:'الانشقاق',ayahs:25},
  {n:85,name:'البروج',ayahs:22},{n:86,name:'الطارق',ayahs:17},{n:87,name:'الأعلى',ayahs:19},{n:88,name:'الغاشية',ayahs:26},
  {n:89,name:'الفجر',ayahs:30},{n:90,name:'البلد',ayahs:20},{n:91,name:'الشمس',ayahs:15},{n:92,name:'الليل',ayahs:21},
  {n:93,name:'الضحى',ayahs:11},{n:94,name:'الشرح',ayahs:8},{n:95,name:'التين',ayahs:8},{n:96,name:'العلق',ayahs:19},
  {n:97,name:'القدر',ayahs:5},{n:98,name:'البينة',ayahs:8},{n:99,name:'الزلزلة',ayahs:8},{n:100,name:'العاديات',ayahs:11},
  {n:101,name:'القارعة',ayahs:11},{n:102,name:'التكاثر',ayahs:8},{n:103,name:'العصر',ayahs:3},{n:104,name:'الهمزة',ayahs:9},
  {n:105,name:'الفيل',ayahs:5},{n:106,name:'قريش',ayahs:4},{n:107,name:'الماعون',ayahs:7},{n:108,name:'الكوثر',ayahs:3},
  {n:109,name:'الكافرون',ayahs:6},{n:110,name:'النصر',ayahs:3},{n:111,name:'المسد',ayahs:5},{n:112,name:'الإخلاص',ayahs:4},
  {n:113,name:'الفلق',ayahs:5},{n:114,name:'الناس',ayahs:6},
];

const SURAH_BY_NUMBER = new Map(SURAHS.map(s => [s.n, s]));

/**
 * The surahs as a non-Arabic reader names them.
 *
 * Transliteration, not translation: a reciter and a listener saying the name
 * aloud must land on the same sound, and "The Opening" does not survive being
 * read back to a teacher. Kept in mushaf order, so the index is the number
 * minus one — the same list, in another script.
 */
export const SURAH_NAMES_EN: string[] = [
  "Al-Fatihah", "Al-Baqarah", "Aal-'Imran", "An-Nisa", "Al-Ma'idah", "Al-An'am",
  "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf",
  "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra", "Al-Kahf",
  "Maryam", "Ta-Ha", "Al-Anbiya", "Al-Hajj", "Al-Mu'minun", "An-Nur",
  "Al-Furqan", "Ash-Shu'ara", "An-Naml", "Al-Qasas", "Al-'Ankabut", "Ar-Rum",
  "Luqman", "As-Sajdah", "Al-Ahzab", "Saba", "Fatir", "Ya-Sin",
  "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura",
  "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath",
  "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar",
  "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadilah", "Al-Hashr", "Al-Mumtahanah",
  "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim",
  "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn",
  "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba",
  "An-Nazi'at", "'Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq",
  "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad",
  "Ash-Shams", "Al-Layl", "Ad-Duha", "Ash-Sharh", "At-Tin", "Al-'Alaq",
  "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-'Adiyat", "Al-Qari'ah", "At-Takathur",
  "Al-'Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar",
  "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas",
];

/**
 * French spelling. `ch` for the sheen, `dj` for the jeem, `ou` for the long u -
 * and a silent `e` after a final n or m, without which French nasalises it and
 * "Luqman" comes out through the nose.
 */
export const SURAH_NAMES_FR: string[] = [
  "Al-Fatiha", "Al-Baqara", "Âl-'Imrâne", "An-Nissâ", "Al-Mâ'ida", "Al-An'âme",
  "Al-A'râf", "Al-Anfâl", "At-Tawba", "Younous", "Houd", "Youssouf",
  "Ar-Ra'd", "Ibrâhîme", "Al-Hidjr", "An-Nahl", "Al-Isrâ", "Al-Kahf",
  "Mariame", "Tâ-Hâ", "Al-Anbiyâ", "Al-Hadjj", "Al-Mou'minoune", "An-Nour",
  "Al-Fourqâne", "Ach-Chou'arâ", "An-Naml", "Al-Qasas", "Al-'Ankaboute", "Ar-Roume",
  "Louqmâne", "As-Sadjda", "Al-Ahzâb", "Saba", "Fâtir", "Yâ-Sîne",
  "As-Sâffât", "Sâd", "Az-Zoumar", "Ghâfir", "Foussilat", "Ach-Choûrâ",
  "Az-Zoukhrouf", "Ad-Doukhâne", "Al-Djâthiya", "Al-Ahqâf", "Mouhammad", "Al-Fath",
  "Al-Houdjourât", "Qâf", "Adh-Dhâriyât", "At-Tour", "An-Nadjm", "Al-Qamar",
  "Ar-Rahmâne", "Al-Wâqi'a", "Al-Hadîd", "Al-Moujâdila", "Al-Hachr", "Al-Moumtahana",
  "As-Saff", "Al-Djoumou'a", "Al-Mounâfiqoune", "At-Taghâboune", "At-Talâq", "At-Tahrîme",
  "Al-Moulk", "Al-Qalame", "Al-Hâqqa", "Al-Ma'âridj", "Nouh", "Al-Djinn",
  "Al-Mouzzammil", "Al-Mouddaththir", "Al-Qiyâma", "Al-Insâne", "Al-Moursalât", "An-Naba",
  "An-Nâzi'ât", "'Abassa", "At-Takwîr", "Al-Infitâr", "Al-Moutaffifîne", "Al-Inchiqâq",
  "Al-Bouroudj", "At-Târiq", "Al-A'lâ", "Al-Ghâchiya", "Al-Fadjr", "Al-Balad",
  "Ach-Chams", "Al-Layl", "Ad-Douhâ", "Ach-Charh", "At-Tîne", "Al-'Alaq",
  "Al-Qadr", "Al-Bayyina", "Az-Zalzala", "Al-'Âdiyât", "Al-Qâri'a", "At-Takâthour",
  "Al-'Asr", "Al-Houmaza", "Al-Fîl", "Qouraych", "Al-Mâ'oune", "Al-Kawthar",
  "Al-Kâfiroune", "An-Nasr", "Al-Masad", "Al-Ikhlâs", "Al-Falaq", "An-Nâs",
];

/**
 * German spelling, following Bubenheim & Elyas - the edition most German
 * Muslims read. `sch` for the sheen, `dsch` for the jeem, `ch` for the khaa,
 * `au` for the aw diphthong.
 */
export const SURAH_NAMES_DE: string[] = [
  "Al-Fatiha", "Al-Baqara", "Al-Imran", "An-Nisa", "Al-Maida", "Al-Anam",
  "Al-Araf", "Al-Anfal", "At-Tauba", "Yunus", "Hud", "Yusuf",
  "Ar-Rad", "Ibrahim", "Al-Hidschr", "An-Nahl", "Al-Isra", "Al-Kahf",
  "Maryam", "Ta-Ha", "Al-Anbiya", "Al-Hadschdsch", "Al-Muminun", "An-Nur",
  "Al-Furqan", "Asch-Schuara", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum",
  "Luqman", "As-Sadschda", "Al-Ahzab", "Saba", "Fatir", "Ya-Sin",
  "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Asch-Schura",
  "Az-Zuchruf", "Ad-Duchan", "Al-Dschathiya", "Al-Ahqaf", "Muhammad", "Al-Fath",
  "Al-Hudschurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Nadschm", "Al-Qamar",
  "Ar-Rahman", "Al-Waqia", "Al-Hadid", "Al-Mudschadila", "Al-Haschr", "Al-Mumtahana",
  "As-Saff", "Al-Dschumua", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim",
  "Al-Mulk", "Al-Qalam", "Al-Haqqa", "Al-Maaridsch", "Nuh", "Al-Dschinn",
  "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyama", "Al-Insan", "Al-Mursalat", "An-Naba",
  "An-Naziat", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inschiqaq",
  "Al-Burudsch", "At-Tariq", "Al-Ala", "Al-Ghaschiya", "Al-Fadschr", "Al-Balad",
  "Asch-Schams", "Al-Lail", "Ad-Duha", "Asch-Scharh", "At-Tin", "Al-Alaq",
  "Al-Qadr", "Al-Bayyina", "Az-Zalzala", "Al-Adiyat", "Al-Qaria", "At-Takathur",
  "Al-Asr", "Al-Humaza", "Al-Fil", "Quraisch", "Al-Maun", "Al-Kauthar",
  "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ichlas", "Al-Falaq", "An-Nas",
];

/**
 * Spanish spelling. `y` for the jeem and `j` for the khaa - Spanish already has
 * both sounds and spells them this way - plus the accent that puts the stress
 * where the Arabic puts it.
 */
export const SURAH_NAMES_ES: string[] = [
  "Al-Fátiha", "Al-Báqara", "Al-Imrán", "An-Nisá", "Al-Máida", "Al-Anám",
  "Al-Aráf", "Al-Anfál", "At-Tauba", "Yúnus", "Hud", "Yúsuf",
  "Ar-Rad", "Ibrahím", "Al-Hiyr", "An-Nahl", "Al-Isrá", "Al-Kahf",
  "Máriam", "Ta-Ha", "Al-Anbiyá", "Al-Hayy", "Al-Muminún", "An-Nur",
  "Al-Furqán", "Ash-Shuará", "An-Naml", "Al-Qásas", "Al-Ankabút", "Ar-Rum",
  "Luqmán", "As-Sayda", "Al-Ahzáb", "Saba", "Fátir", "Ya-Sin",
  "As-Sáffat", "Sad", "Az-Zúmar", "Gáfir", "Fussilat", "Ash-Shúra",
  "Az-Zujruf", "Ad-Dujan", "Al-Yáthiya", "Al-Ahqáf", "Muhámmad", "Al-Fath",
  "Al-Huyurát", "Qaf", "Adh-Dháriyat", "At-Tur", "An-Naym", "Al-Qámar",
  "Ar-Rahmán", "Al-Wáqia", "Al-Hadíd", "Al-Muyádila", "Al-Hashr", "Al-Mumtáhana",
  "As-Saff", "Al-Yumua", "Al-Munafiqún", "At-Tagábun", "At-Taláq", "At-Tahrím",
  "Al-Mulk", "Al-Qálam", "Al-Háqqa", "Al-Maáriy", "Nuh", "Al-Yinn",
  "Al-Muzzámmil", "Al-Muddáththir", "Al-Qiyáma", "Al-Insán", "Al-Mursalát", "An-Naba",
  "An-Náziat", "Abasa", "At-Takwír", "Al-Infitár", "Al-Mutaffifín", "Al-Inshiqáq",
  "Al-Buruy", "At-Táriq", "Al-Alá", "Al-Gáshiya", "Al-Fayr", "Al-Bálad",
  "Ash-Shams", "Al-Lail", "Ad-Duha", "Ash-Sharh", "At-Tin", "Al-Álaq",
  "Al-Qadr", "Al-Bayyina", "Az-Zalzala", "Al-Ádiyat", "Al-Qária", "At-Takáthur",
  "Al-Asr", "Al-Humaza", "Al-Fil", "Quraish", "Al-Maún", "Al-Kauthar",
  "Al-Kafirún", "An-Nasr", "Al-Másad", "Al-Ijlás", "Al-Fálaq", "An-Nas",
];

/**
 * The surah's name in the language on screen. Arabic reads its own script;
 * every other interface language reads the transliteration.
 */
const SURAH_NAMES_BY_LANG: Record<string, string[]> = {
  fr: SURAH_NAMES_FR,
  de: SURAH_NAMES_DE,
  es: SURAH_NAMES_ES,
};

export function surahName(n: number, lang: DisplayLang = displayLang()): string {
  if (!isArabic(lang)) {
    const names = SURAH_NAMES_BY_LANG[lang] ?? SURAH_NAMES_EN;
    return names[n - 1] ?? SURAH_NAMES_EN[n - 1] ?? String(n);
  }
  return SURAH_BY_NUMBER.get(n)?.name ?? String(n);
}

/**
 * Every spelling of a surah's name, for matching what someone typed.
 *
 * A search must not depend on which language the interface happens to be in:
 * someone who learnt the name as "Ash-Shams" should still find it while the
 * board is in French, and "Ach-Chams" should still find it in English.
 */
export function surahNameVariants(n: number): string[] {
  const arabic = SURAH_BY_NUMBER.get(n)?.name;
  const all = [SURAH_NAMES_EN[n - 1], SURAH_NAMES_FR[n - 1], SURAH_NAMES_DE[n - 1], SURAH_NAMES_ES[n - 1], arabic];
  return [...new Set(all.filter((x): x is string => !!x))];
}

/** The Arabic name regardless of interface language — for the muṣḥaf itself. */
export function surahNameAr(n: number): string {
  return SURAH_BY_NUMBER.get(n)?.name ?? String(n);
}

export function surahAyahCount(n: number): number {
  return SURAH_BY_NUMBER.get(n)?.ayahs ?? 0;
}

/**
 * Digits in the script of the language on screen: Arabic-Indic for Arabic,
 * plain Latin for the rest. Numbers printed *inside* a muṣḥaf page keep
 * `toArabicIndic` directly — those belong to the book, not to the interface.
 */
export function localeDigits(n: number, lang: DisplayLang = displayLang()): string {
  return isArabic(lang) ? toArabicIndic(n) : String(n);
}

/** Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) — mushaf numbering. */
export function toArabicIndic(n: number): string {
  const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(n).split('').map(d => map[+d] ?? d).join('');
}

/** U+06DD wraps the ayah number into the mushaf circle in proper Quran fonts. */
export function ayahEndMarker(ayah: number): string {
  return '۝' + toArabicIndic(ayah);
}

// ── Data loading ────────────────────────────────────────────────

const quranDataCache: Partial<Record<Qiraah, QuranVerse[]>> = {};
const quranDataPromises: Partial<Record<Qiraah, Promise<QuranVerse[]>>> = {};

export function loadQuranData(qiraah: Qiraah): Promise<QuranVerse[]> {
  const cached = quranDataCache[qiraah];
  if (cached) return Promise.resolve(cached);
  const pending = quranDataPromises[qiraah];
  if (pending) return pending;
  const p = fetch(QIRAAH_CONFIG[qiraah].url)
    .then(r => r.json())
    .then((data: QuranVerse[]) => { quranDataCache[qiraah] = data; return data; });
  quranDataPromises[qiraah] = p;
  return p;
}

/** Synchronous peek — null until `loadQuranData` has resolved at least once. */
export function getLoadedQuranData(qiraah: Qiraah): QuranVerse[] | null {
  return quranDataCache[qiraah] ?? null;
}

// ── Fonts ───────────────────────────────────────────────────────

const fontPromises: Partial<Record<Qiraah, Promise<void>>> = {};

export function injectGoogleFont(family: string) {
  const id = `gfont-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Loads the qira'ah's font. Registering through `document.fonts.add` makes the
 * family available to CSS as well as to canvas, so the recitation reading pane
 * can render the same Uthmani text as plain DOM text.
 */
export function loadQuranFont(qiraah: Qiraah): Promise<void> {
  const pending = fontPromises[qiraah];
  if (pending) return pending;
  const p = (async () => {
    if (qiraah === 'hafs') {
      const font = new FontFace('HafsSmartCanvas', 'url(/fonts/HafsSmart_08.ttf)');
      const loaded = await font.load();
      document.fonts.add(loaded);
      await document.fonts.load('44px HafsSmartCanvas');
    } else {
      // Warsh uses standard Unicode — load Amiri Quran from Google Fonts
      injectGoogleFont('Amiri Quran');
      for (let i = 0; i < 30; i++) {
        try {
          await document.fonts.load('44px "Amiri Quran"');
          if (document.fonts.check('44px "Amiri Quran"')) break;
        } catch { /* font not ready yet */ }
        await new Promise(r => setTimeout(r, 100));
      }
    }
  })();
  fontPromises[qiraah] = p;
  return p;
}

export function getFontFamily(qiraah: Qiraah): string {
  return qiraah === 'hafs'
    ? 'HafsSmartCanvas, HafsSmart, sans-serif'
    : '"Amiri Quran", "Amiri", "Traditional Arabic", serif';
}
