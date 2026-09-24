/**
 * Dialling codes, so a WhatsApp number can name its own country.
 *
 * Deliberately not a complete ISO list. It is what a number typed into this
 * tool actually starts with: the Arab world in full, then the countries with
 * the largest Arabic-speaking or Qur'an-teaching communities beyond it. A code
 * that is not here is not an error — the number is kept as typed and the
 * country is left to the teacher, which is also what happens for +1, where the
 * dialling code alone cannot tell the United States from Canada.
 *
 * No flag emoji: Windows ships no font for regional-indicator pairs, so they
 * render as bare letters — worse than nothing beside an Arabic name.
 */
import { displayLang, isArabic, type DisplayLang } from './display-lang';

export interface Country {
  /** ISO 3166-1 alpha-2, as a stable key. */
  code: string;
  /** International dialling code, without the +. */
  dial: string;
  nameAr: string;
  nameEn: string;
}

export const COUNTRIES: Country[] = [
  // ── العالم العربي ──
  { code: 'EG', dial: '20', nameAr: 'مصر', nameEn: 'Egypt' },
  { code: 'SA', dial: '966', nameAr: 'السعودية', nameEn: 'Saudi Arabia' },
  { code: 'AE', dial: '971', nameAr: 'الإمارات', nameEn: 'United Arab Emirates' },
  { code: 'KW', dial: '965', nameAr: 'الكويت', nameEn: 'Kuwait' },
  { code: 'QA', dial: '974', nameAr: 'قطر', nameEn: 'Qatar' },
  { code: 'BH', dial: '973', nameAr: 'البحرين', nameEn: 'Bahrain' },
  { code: 'OM', dial: '968', nameAr: 'عُمان', nameEn: 'Oman' },
  { code: 'YE', dial: '967', nameAr: 'اليمن', nameEn: 'Yemen' },
  { code: 'IQ', dial: '964', nameAr: 'العراق', nameEn: 'Iraq' },
  { code: 'JO', dial: '962', nameAr: 'الأردن', nameEn: 'Jordan' },
  { code: 'LB', dial: '961', nameAr: 'لبنان', nameEn: 'Lebanon' },
  { code: 'SY', dial: '963', nameAr: 'سوريا', nameEn: 'Syria' },
  { code: 'PS', dial: '970', nameAr: 'فلسطين', nameEn: 'Palestine' },
  { code: 'LY', dial: '218', nameAr: 'ليبيا', nameEn: 'Libya' },
  { code: 'TN', dial: '216', nameAr: 'تونس', nameEn: 'Tunisia' },
  { code: 'DZ', dial: '213', nameAr: 'الجزائر', nameEn: 'Algeria' },
  { code: 'MA', dial: '212', nameAr: 'المغرب', nameEn: 'Morocco' },
  { code: 'MR', dial: '222', nameAr: 'موريتانيا', nameEn: 'Mauritania' },
  { code: 'SD', dial: '249', nameAr: 'السودان', nameEn: 'Sudan' },
  { code: 'SO', dial: '252', nameAr: 'الصومال', nameEn: 'Somalia' },
  { code: 'DJ', dial: '253', nameAr: 'جيبوتي', nameEn: 'Djibouti' },
  { code: 'KM', dial: '269', nameAr: 'جزر القمر', nameEn: 'Comoros' },

  // ── آسيا الإسلامية ──
  { code: 'TR', dial: '90', nameAr: 'تركيا', nameEn: 'Türkiye' },
  { code: 'IR', dial: '98', nameAr: 'إيران', nameEn: 'Iran' },
  { code: 'PK', dial: '92', nameAr: 'باكستان', nameEn: 'Pakistan' },
  { code: 'AF', dial: '93', nameAr: 'أفغانستان', nameEn: 'Afghanistan' },
  { code: 'IN', dial: '91', nameAr: 'الهند', nameEn: 'India' },
  { code: 'BD', dial: '880', nameAr: 'بنغلاديش', nameEn: 'Bangladesh' },
  { code: 'LK', dial: '94', nameAr: 'سريلانكا', nameEn: 'Sri Lanka' },
  { code: 'ID', dial: '62', nameAr: 'إندونيسيا', nameEn: 'Indonesia' },
  { code: 'MY', dial: '60', nameAr: 'ماليزيا', nameEn: 'Malaysia' },
  { code: 'BN', dial: '673', nameAr: 'بروناي', nameEn: 'Brunei' },
  { code: 'SG', dial: '65', nameAr: 'سنغافورة', nameEn: 'Singapore' },
  { code: 'PH', dial: '63', nameAr: 'الفلبين', nameEn: 'Philippines' },
  { code: 'TH', dial: '66', nameAr: 'تايلاند', nameEn: 'Thailand' },
  { code: 'AZ', dial: '994', nameAr: 'أذربيجان', nameEn: 'Azerbaijan' },
  { code: 'UZ', dial: '998', nameAr: 'أوزبكستان', nameEn: 'Uzbekistan' },
  { code: 'TJ', dial: '992', nameAr: 'طاجيكستان', nameEn: 'Tajikistan' },
  { code: 'TM', dial: '993', nameAr: 'تركمانستان', nameEn: 'Turkmenistan' },
  { code: 'KG', dial: '996', nameAr: 'قيرغيزستان', nameEn: 'Kyrgyzstan' },
  // Longer than Russia's +7, so the prefix match must be longest-first.
  { code: 'KZ', dial: '77', nameAr: 'كازاخستان', nameEn: 'Kazakhstan' },
  { code: 'RU', dial: '7', nameAr: 'روسيا', nameEn: 'Russia' },
  { code: 'CN', dial: '86', nameAr: 'الصين', nameEn: 'China' },
  { code: 'JP', dial: '81', nameAr: 'اليابان', nameEn: 'Japan' },
  { code: 'KR', dial: '82', nameAr: 'كوريا الجنوبية', nameEn: 'South Korea' },

  // ── أفريقيا ──
  { code: 'NG', dial: '234', nameAr: 'نيجيريا', nameEn: 'Nigeria' },
  { code: 'SN', dial: '221', nameAr: 'السنغال', nameEn: 'Senegal' },
  { code: 'ML', dial: '223', nameAr: 'مالي', nameEn: 'Mali' },
  { code: 'NE', dial: '227', nameAr: 'النيجر', nameEn: 'Niger' },
  { code: 'TD', dial: '235', nameAr: 'تشاد', nameEn: 'Chad' },
  { code: 'ET', dial: '251', nameAr: 'إثيوبيا', nameEn: 'Ethiopia' },
  { code: 'ER', dial: '291', nameAr: 'إريتريا', nameEn: 'Eritrea' },
  { code: 'KE', dial: '254', nameAr: 'كينيا', nameEn: 'Kenya' },
  { code: 'TZ', dial: '255', nameAr: 'تنزانيا', nameEn: 'Tanzania' },
  { code: 'UG', dial: '256', nameAr: 'أوغندا', nameEn: 'Uganda' },
  { code: 'GH', dial: '233', nameAr: 'غانا', nameEn: 'Ghana' },
  { code: 'ZA', dial: '27', nameAr: 'جنوب أفريقيا', nameEn: 'South Africa' },

  // ── أوروبا وأمريكا وأستراليا ──
  { code: 'GB', dial: '44', nameAr: 'بريطانيا', nameEn: 'United Kingdom' },
  { code: 'FR', dial: '33', nameAr: 'فرنسا', nameEn: 'France' },
  { code: 'DE', dial: '49', nameAr: 'ألمانيا', nameEn: 'Germany' },
  { code: 'NL', dial: '31', nameAr: 'هولندا', nameEn: 'Netherlands' },
  { code: 'BE', dial: '32', nameAr: 'بلجيكا', nameEn: 'Belgium' },
  { code: 'ES', dial: '34', nameAr: 'إسبانيا', nameEn: 'Spain' },
  { code: 'IT', dial: '39', nameAr: 'إيطاليا', nameEn: 'Italy' },
  { code: 'SE', dial: '46', nameAr: 'السويد', nameEn: 'Sweden' },
  { code: 'NO', dial: '47', nameAr: 'النرويج', nameEn: 'Norway' },
  { code: 'DK', dial: '45', nameAr: 'الدنمارك', nameEn: 'Denmark' },
  { code: 'FI', dial: '358', nameAr: 'فنلندا', nameEn: 'Finland' },
  { code: 'AT', dial: '43', nameAr: 'النمسا', nameEn: 'Austria' },
  { code: 'CH', dial: '41', nameAr: 'سويسرا', nameEn: 'Switzerland' },
  { code: 'GR', dial: '30', nameAr: 'اليونان', nameEn: 'Greece' },
  { code: 'US', dial: '1', nameAr: 'الولايات المتحدة', nameEn: 'United States' },
  { code: 'AU', dial: '61', nameAr: 'أستراليا', nameEn: 'Australia' },
  { code: 'NZ', dial: '64', nameAr: 'نيوزيلندا', nameEn: 'New Zealand' },
  { code: 'BR', dial: '55', nameAr: 'البرازيل', nameEn: 'Brazil' },
];

/** Longest dialling code first, so +77 beats +7 and +970 beats +97. */
const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/** Digits only, and Arabic-Indic digits folded to Latin as they are typed. */
export function digitsOf(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(ch);
    if (arabic > -1) { out += String(arabic); continue; }
    const persian = '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch);
    if (persian > -1) { out += String(persian); continue; }
    if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
}

/**
 * Which country a number belongs to, or nothing.
 *
 * Only a number written with its international code can be placed: `01001…`
 * is a valid local number in a dozen countries at once, and guessing one of
 * them would put a wrong country in a record the owner will read later.
 */
export function countryOfNumber(raw: string): Country | undefined {
  const trimmed = raw.trim();
  // Without a leading + or 00 there is no country in the string to find.
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) return undefined;
  const digits = digitsOf(trimmed).replace(/^00/, '');
  if (!digits) return undefined;
  return BY_LENGTH.find(c => digits.startsWith(c.dial));
}

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

/** The country as the interface language names it. */
export function countryName(c: Country, lang: DisplayLang = displayLang()): string {
  return isArabic(lang) ? c.nameAr : c.nameEn;
}

/**
 * Folds an Arabic word to the shape people actually type.
 *
 * Nobody searching for the Emirates types «الإمارات» with its hamza, and half
 * of them leave off the «ال» altogether. Diacritics go, the alif family is
 * flattened, ة reads as ه and ى as ي, and the article is dropped — so
 * «الامارات», «إمارات» and «الإمارات» are one string by the time they are
 * compared.
 */
export function foldArabic(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/^ال/, '')
    .trim()
    .toLowerCase();
}

/**
 * Countries matching what was typed — by name, by dialling code, or by ISO
 * code. An empty query is the whole list, in the order the list is written:
 * the Arab world first, because that is who this is for.
 */
export function searchCountries(query: string): Country[] {
  const raw = query.trim();
  if (!raw) return COUNTRIES;
  const digits = digitsOf(raw);
  const folded = foldArabic(raw);
  const latin = raw.toLowerCase();
  return COUNTRIES.filter(c => {
    if (digits && c.dial.startsWith(digits)) return true;
    if (latin.length <= 3 && c.code.toLowerCase().startsWith(latin)) return true;
    if (c.nameEn.toLowerCase().includes(latin)) return true;
    return folded ? foldArabic(c.nameAr).includes(folded) : false;
  });
}

/**
 * Puts a country's dialling code on a number, keeping the subscriber digits.
 *
 * Three cases, and the third is the one people actually type: the number may
 * be bare (`1001234567`), already international (`+201001234567` — the old
 * code comes off before the new one goes on), or national with a trunk zero
 * (`01001234567`), which is dropped because no international number carries
 * it. Picking Saudi Arabia after typing an Egyptian number therefore yields
 * the same subscriber digits under +966, not a number with two codes.
 */
export function applyDialCode(raw: string, dial: string): string {
  const trimmed = raw.trim();
  // A code is only stripped from a number that was *written* as an
  // international one. Otherwise `1001234567` — a perfectly ordinary Egyptian
  // subscriber number — begins with "1", the United States, and loses its
  // first digits to a code it never carried.
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = digitsOf(trimmed);
  if (international) {
    digits = digits.replace(/^00/, '');
    const current = BY_LENGTH.find(c => digits.startsWith(c.dial));
    if (current) digits = digits.slice(current.dial.length);
  }
  return `+${dial}${digits.replace(/^0+/, '')}`;
}

/** Stored form: `+` and digits, nothing else. */
export function normalizeWhatsapp(raw: string): string {
  const digits = digitsOf(raw).replace(/^00/, '');
  return digits ? `+${digits}` : '';
}

/**
 * Enough of a number to be worth storing: a country code and a subscriber
 * number. Not a validity check — only the network can say that — but it does
 * catch the half-typed and the accidental.
 */
export function isPlausibleWhatsapp(raw: string): boolean {
  const digits = digitsOf(raw).replace(/^00/, '');
  return digits.length >= 8 && digits.length <= 15;
}
