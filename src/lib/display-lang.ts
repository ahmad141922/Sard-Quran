/**
 * The language names are written in, outside React.
 *
 * Surah names, riwaya names, country names and counted phrases ("خمس صفحات" /
 * "5 pages") are produced by plain modules — data and pure functions that no
 * hook can reach. Threading a language argument through every one of their
 * callers would touch a hundred call sites to say the same thing each time, so
 * the provider publishes the current language here and those functions read it
 * as their default.
 *
 * It is a default, never a lock: every one of them still takes an explicit
 * language, which is what tests pass and what the certificate uses when it must
 * be produced in the language it was issued in rather than the one on screen.
 */
export type DisplayLang = 'ar' | 'en' | 'fr' | 'de' | 'es';

let current: DisplayLang = 'ar';

export function setDisplayLang(lang: DisplayLang): void {
  current = lang;
}

export function displayLang(): DisplayLang {
  return current;
}

/**
 * Arabic is the only language of the five whose script the names are written
 * in; the other four read the transliteration. So the whole question these
 * modules ever ask is "Arabic or not".
 */
export function isArabic(lang: DisplayLang = current): boolean {
  return lang === 'ar';
}
