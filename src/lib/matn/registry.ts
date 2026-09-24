/**
 * Which memorised poems the tool can hear recited.
 *
 * The muṣḥaf registry keeps riwaya and printed edition apart because one
 * riwaya has many prints. A matn has the same shape of problem for the same
 * reason: **the printed edition owns the line numbers**. Al-Muqaddima
 * al-Jazariyya is set in 107 abyāt in some prints and 109 in others, and a
 * student who memorised from one and is followed in the other loses the very
 * thing this tool exists to keep steady — the boundaries the memorisation was
 * built on.
 *
 * So a matn here is metadata only: who wrote it, how it divides, and which
 * print its numbering belongs to. The text itself is **supplied**, never
 * derived — see `load.ts`.
 */

import { displayLang, isArabic, type DisplayLang } from '../display-lang';

export type MatnId =
  | 'tuhfa' | 'jazariyya' | 'salsabil' | 'laali'
  | 'durra' | 'shatibiyya' | 'tayyiba';

/** Which half of the line. A note is fixed to one; the reader shows both. */
export type Shatr = 'sadr' | 'ajz';

export interface MatnDefinition {
  id: MatnId;
  nameAr: string;
  nameEn: string;
  authorAr: string;
  authorEn: string;
  /**
   * The count the declared edition prints.
   *
   * Carried here as well as in the data file so that a file which lost lines
   * in transit fails against the registry instead of quietly becoming a
   * shorter matn — the same guard `MushafIndexFile.totalPages` gives.
   */
  totalAbyat: number;
  /** How many chapters that edition divides it into. */
  totalAbwab: number;
  /**
   * The print whose numbering these abyāt are in.
   *
   * Empty until an edition is settled, and `load.ts` refuses a matn whose
   * edition is unnamed: an unnamed numbering is exactly the ambiguity this
   * registry exists to remove, and shipping one would be worse than shipping
   * nothing.
   */
  editionAr: string;
  editionEn: string;
}

export const MATN_REGISTRY: Record<MatnId, MatnDefinition> = {
  tuhfa: {
    id: 'tuhfa',
    nameAr: 'تحفة الأطفال',
    nameEn: "Tuhfat al-Atfal",
    authorAr: 'سليمان الجمزوري',
    authorEn: 'Sulayman al-Jamzuri',
    totalAbyat: 61,
    // Ten, counted off the supplied text: the opening five abyāt stand as a
    // muqaddima of their own before «النون الساكنة والتنوين». The figure was
    // eight here on an assumption, and the text corrected it — which is the
    // whole reason this number is kept as a third opinion.
    totalAbwab: 10,
  /*
   * A website, named as one — not a print.
   *
   * The site states no editor and no edition, so this is a **source** rather
   * than a verified text. It is enough for the thing this field exists for:
   * a reciter reading «bayt 55» in a report can go to that page and check
   * which bayt 55 is meant, which is exactly the ambiguity being removed.
   *
   * It is not enough to call the text checked. Both matns were compared
   * against a second source and against the loader's structural rules, and
   * both passed; neither has been read by a shaykh. Replace this with a
   * printed edition the moment one is verified against, and the numbering
   * carried in the files must be re-checked when that happens.
   */
    editionAr: 'نصّ موقع surahquran.com',
    editionEn: 'Text from surahquran.com',
  },
  jazariyya: {
    id: 'jazariyya',
    nameAr: 'المقدّمة الجزريّة',
    nameEn: 'Al-Muqaddima al-Jazariyya',
    authorAr: 'ابن الجزري',
    authorEn: 'Ibn al-Jazari',
    /*
     * 109, counted off the supplied text — and the number is worth a note,
     * because the poem states its own.
     *
     * Bayt 107 reads «أَبْيَاتُهَا قَافٌ وَزَاىٌ فِي الْعَدَدْ»: qāf (100)
     * and zāy (7), so **the author counted 107**. The two lines after it are a
     * closing doxology that this print carries and the count does not. Neither
     * is wrong; they are a fact about the print, which is precisely what
     * `editionAr` exists to pin down.
     *
     * The figure here was 107 on an assumption and 12 abwāb likewise — the
     * text corrected both, as the Tuhfa text corrected its own. That is the
     * whole reason these are kept as a third opinion rather than derived.
     */
    totalAbyat: 109,
    totalAbwab: 19,
    // The same website, and the same caveat — see `tuhfa` above.
    editionAr: 'نصّ موقع surahquran.com',
    editionEn: 'Text from surahquran.com',
  },

  /*
   * ## The five below, and why their editions read differently
   *
   * The two above name a website, because a website is all their text has. The
   * three qirāʾāt matns name a **printed critical edition** — all three edited
   * by Muḥammad Tamīm az-Zaʿbī — because that is what was transcribed, and the
   * print states its own chapter divisions and the length of each, which is a
   * second account of the structure that the build checks the first against.
   * That is a materially stronger footing, and the field says so rather than
   * flattening the difference.
   *
   * None of the five has been read by a shaykh either. The difference is in
   * what a reader can check: «bayt 700 of az-Zaʿbī's fourth printing» names
   * something a person can hold, and an unnamed web page does not.
   */
  salsabil: {
    id: 'salsabil',
    nameAr: 'السلسبيل الشافي',
    nameEn: 'As-Salsabīl ash-Shāfī',
    authorAr: 'عثمان بن سليمان مراد',
    authorEn: 'ʿUthmān b. Sulaymān Murād',
    // 265, counted off the text — the figure usually quoted for this nazm.
    totalAbyat: 265,
    totalAbwab: 35,
    editionAr: 'نصّ موقع ketabonline.com (جامع الكتب الإسلامية)',
    editionEn: 'Text from ketabonline.com (Jāmiʿ al-Kutub al-Islāmiyya)',
  },
  laali: {
    id: 'laali',
    nameAr: 'لآلئ البيان',
    nameEn: 'Laʾāliʾ al-Bayān',
    authorAr: 'إبراهيم علي شحاتة السمنودي',
    authorEn: 'Ibrāhīm ʿAlī Shiḥāta as-Samannūdī',
    /*
     * 201. Not to be confused with **تلخيص لآلئ البيان**, the author's own
     * abridgement of it in about seventy abyāt — a different poem with a
     * different numbering, and the one a student is likelier to have met.
     */
    totalAbyat: 201,
    totalAbwab: 33,
    editionAr: 'نصّ موقع ketabonline.com (جامع الكتب الإسلامية)',
    editionEn: 'Text from ketabonline.com (Jāmiʿ al-Kutub al-Islāmiyya)',
  },
  durra: {
    id: 'durra',
    nameAr: 'الدرّة المضيّة',
    nameEn: 'Ad-Durra al-Muḍiyya',
    authorAr: 'ابن الجزري',
    authorEn: 'Ibn al-Jazari',
    /*
     * 241, and the print gets there only after a correction: it numbers two
     * consecutive lines 238 and has no 239. The build renumbers the second and
     * says so — see `REPAIRS` in the build script.
     */
    totalAbyat: 241,
    totalAbwab: 37,
    editionAr: 'تحقيق محمد تميم الزعبي، دار الهدى، الطبعة الثانية ١٤٢١هـ',
    editionEn: 'Ed. Muḥammad Tamīm az-Zaʿbī, Dār al-Hudā, 2nd ed. 1421 AH',
  },
  shatibiyya: {
    id: 'shatibiyya',
    nameAr: 'الشاطبيّة (حرز الأماني)',
    nameEn: 'Ash-Shāṭibiyya (Ḥirz al-Amānī)',
    authorAr: 'القاسم بن فيرّه الشاطبي',
    authorEn: 'Al-Qāsim b. Fīrruh ash-Shāṭibī',
    totalAbyat: 1173,
    totalAbwab: 78,
    editionAr: 'تحقيق محمد تميم الزعبي، مكتبة دار الهدى ودار الغوثاني، الطبعة الرابعة ١٤٢٦هـ',
    editionEn: 'Ed. Muḥammad Tamīm az-Zaʿbī, Dār al-Hudā & Dār al-Ghawthānī, 4th ed. 1426 AH',
  },
  tayyiba: {
    id: 'tayyiba',
    nameAr: 'طيّبة النشر',
    nameEn: 'Ṭayyibat an-Nashr',
    authorAr: 'ابن الجزري',
    authorEn: 'Ibn al-Jazari',
    /*
     * 1015 in this print, where the figure usually quoted is 1014 — a one-line
     * difference between printings, of exactly the kind `editionAr` exists to
     * pin down. The number here is what the shipped text actually holds.
     */
    totalAbyat: 1015,
    totalAbwab: 64,
    editionAr: 'تحقيق محمد تميم الزعبي، دار الهدى بجدة، الطبعة الأولى ١٤١٤هـ',
    editionEn: 'Ed. Muḥammad Tamīm az-Zaʿbī, Dār al-Hudā, Jeddah, 1st ed. 1414 AH',
  },
};

export const MATN_IDS = Object.keys(MATN_REGISTRY) as MatnId[];

export function getMatn(id: string): MatnDefinition | undefined {
  return MATN_REGISTRY[id as MatnId];
}

export function matnName(id: MatnId, lang: DisplayLang = displayLang()): string {
  const m = MATN_REGISTRY[id];
  return isArabic(lang) ? m.nameAr : m.nameEn;
}

export function matnAuthor(id: MatnId, lang: DisplayLang = displayLang()): string {
  const m = MATN_REGISTRY[id];
  return isArabic(lang) ? m.authorAr : m.authorEn;
}

/**
 * The print, named — for the setup screen, the report and the certificate.
 *
 * Returns undefined while no edition has been settled, so a caller has to
 * decide what to say rather than printing an empty string where the source
 * should be.
 */
export function matnEdition(id: MatnId, lang: DisplayLang = displayLang()): string | undefined {
  const m = MATN_REGISTRY[id];
  const name = isArabic(lang) ? m.editionAr : m.editionEn;
  return name || undefined;
}

/** Whether this matn has a settled edition, and so may be offered at all. */
export function isMatnReady(id: MatnId): boolean {
  return !!MATN_REGISTRY[id].editionAr && !!MATN_REGISTRY[id].editionEn;
}
