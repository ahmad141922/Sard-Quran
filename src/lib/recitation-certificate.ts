import { displayLang, isArabic, type DisplayLang } from './display-lang';
import { toArabicIndic } from './quran-data';
import type { QuranIndex } from './quran-index';
import {
  activeMs, canIssueCertificate, coveredCount, isKhatmah, volumeSummary,
  type RecitationSession,
} from './recitation-session';
import type { MatnSession } from './matn/session';

/**
 * What the certificate says was recited.
 *
 * The report already carries the exact figures — ayahs, pages, per-surah
 * pressure. A certificate is a different document: it is handed to a student
 * and read aloud, so it says one round thing. Juz' is the unit a memoriser
 * measures in, and it is given **to the nearest one**; the fractions live in
 * the report.
 *
 * Nothing here rounds upward on its own: 10 leftover pages is half a juz' and
 * rounds to one, 9 rounds to none. A certificate that inflates is worse than
 * no certificate.
 */

/** Pages in one juz' of the Madinah layout — the unit the rounding uses. */
const PAGES_PER_JUZ = 20;

/** جزء واحد · جزآن · ٣–١٠ أجزاء · ١١ فأكثر جزءًا — العربية تفرد وتثنّي وتجمع. */
export function juzPhraseAr(n: number): string {
  if (n === 1) return 'جزءًا واحدًا';
  if (n === 2) return 'جزأين';
  if (n <= 10) return `${toArabicIndic(n)} أجزاء`;
  return `${toArabicIndic(n)} جزءًا`;
}

export function pagesPhraseAr(n: number): string {
  if (n === 1) return 'صفحةً واحدة';
  if (n === 2) return 'صفحتين';
  if (n <= 10) return `${toArabicIndic(n)} صفحات`;
  return `${toArabicIndic(n)} صفحةً`;
}

/**
 * The same counts for a reader of English.
 *
 * "Juz'" is left as it is: a memoriser says juz' in every language, and "part"
 * or "thirtieth" would be a translation of the word rather than of the thing.
 */
export function juzPhraseEn(n: number): string {
  return n === 1 ? "one juz'" : `${n} juz'`;
}

export function pagesPhraseEn(n: number): string {
  return n === 1 ? 'one page' : `${n} pages`;
}

/**
 * The sentence's object: «القرآنَ الكريمَ كاملًا» or «ثلاثة أجزاء…».
 *
 * Below a whole juz' it falls back to pages rather than printing a zero: a
 * majlis of six pages is a real majlis, and "٠ أجزاء" would be both wrong and
 * unkind.
 */
export function recitedAmountAr(session: RecitationSession, index: QuranIndex): string {
  if (isKhatmah(session, index)) return 'القرآنَ الكريمَ كاملًا';
  const volume = volumeSummary(session, index);
  const juz = volume.fullJuz + Math.round(volume.extraPages / PAGES_PER_JUZ);
  if (juz >= 1) return `${juzPhraseAr(juz)} من القرآن الكريم`;
  if (volume.pages > 0) return `${pagesPhraseAr(volume.pages)} من القرآن الكريم`;
  return 'من القرآن الكريم';
}

/** The same sentence-object, in English. */
export function recitedAmountEn(session: RecitationSession, index: QuranIndex): string {
  if (isKhatmah(session, index)) return 'the entire Holy Qur\'an';
  const volume = volumeSummary(session, index);
  const juz = volume.fullJuz + Math.round(volume.extraPages / PAGES_PER_JUZ);
  if (juz >= 1) return `${juzPhraseEn(juz)} of the Holy Qur'an`;
  if (volume.pages > 0) return `${pagesPhraseEn(volume.pages)} of the Holy Qur'an`;
  return "from the Holy Qur'an";
}

/** Whichever of the two the certificate is being issued in. */
export function recitedAmount(
  session: RecitationSession,
  index: QuranIndex,
  lang: DisplayLang = displayLang(),
): string {
  return isArabic(lang) ? recitedAmountAr(session, index) : recitedAmountEn(session, index);
}

/** بيتًا واحدًا · بيتين · ٣–١٠ أبيات · ١١ فأكثر بيتًا — كـ`juzPhraseAr` حرفًا بحرف. */
export function baytPhraseAr(n: number): string {
  if (n === 1) return 'بيتًا واحدًا';
  if (n === 2) return 'بيتين';
  if (n <= 10) return `${toArabicIndic(n)} أبيات`;
  return `${toArabicIndic(n)} بيتًا`;
}

export function baytPhraseEn(n: number): string {
  return n === 1 ? 'one line' : `${n} lines`;
}

/**
 * The sentence's object for a matn: the whole poem, or a count of its lines.
 *
 * Nothing here rounds. A juzʾ is a unit a memoriser thinks in, so the Qur'an
 * side rounds to it; abyāt are already the unit, and «٣٥ بيتًا» is exactly what
 * the reciter and the shaykh both counted.
 */
export function recitedMatnAmountAr(nameAr: string, abyat: number, whole: boolean): string {
  return whole ? `${nameAr} كاملةً` : `${baytPhraseAr(abyat)} من ${nameAr}`;
}

export function recitedMatnAmountEn(nameEn: string, abyat: number, whole: boolean): string {
  return whole ? `the whole of ${nameEn}` : `${baytPhraseEn(abyat)} of ${nameEn}`;
}

/**
 * Where a scanned certificate opens.
 *
 * One constant, and the page it points at ships with the tool (`/cert`). The
 * data travels in the **fragment**, not the query: a fragment is never sent to
 * the server, never lands in an access log, and the page renders the
 * certificate from it with no backend at all. A name on a certificate is the
 * point of the certificate, but it is nobody's business but the holder's.
 */
export const CERT_PAGE_URL = 'https://sard.tajweedoo.com/cert';

/**
 * Everything printed on the certificate, and nothing else.
 *
 * The component used to take a whole session and the Qur'an index to work the
 * amount out. That is fine inside the app and impossible on a page opened from
 * a QR code, which has neither. So the reckoning happens once, here, and both
 * the app and the shared page render the same handful of strings.
 */
export interface CertificateFields {
  id: string;
  name: string;
  /** «٥ أجزاء من القرآن الكريم» — already rounded and already phrased. */
  amount: string;
  instructor?: string;
  riwaya: string;
  /** Listening time. Formatted where it is shown, so the page can localise. */
  durationMs: number;
  /**
   * The language the certificate was issued in.
   *
   * Not the reader's language: `amount` is already a phrase, printed in one
   * language and kept in it. A certificate handed out in Arabic stays Arabic
   * when it is scanned in London, the way a paper one would.
   */
  lang: 'ar' | 'en';
  /** When the majlis ended; both dates are derived from it, not carried. */
  at: number;
}

export function certificateFields(
  session: RecitationSession,
  index: QuranIndex,
  riwaya: string,
  lang: DisplayLang = displayLang(),
): CertificateFields {
  const at = session.endedAt ?? session.lastSeenAt ?? Date.now();
  const issued = isArabic(lang) ? 'ar' as const : 'en' as const;
  return {
    id: session.id,
    name: session.studentName,
    amount: recitedAmount(session, index, lang),
    lang: issued,
    instructor: session.instructorName || undefined,
    riwaya,
    durationMs: activeMs(session, at),
    at,
  };
}

/**
 * The same fields, for a session of matn.
 *
 * No new shape and no new encoding: `amount` is already a finished phrase, and
 * `riwaya` is already just "which book this was recited in" — for a matn that
 * is the declared print, which owns its line numbers exactly as a riwaya owns
 * its verse numbers. So a matn certificate scans, verifies and prints through
 * the machinery that already exists, and an older `/cert` page renders it
 * without knowing a matn is a thing.
 *
 * Refuses a solo session outright rather than leaving that to the caller: a
 * certificate's whole worth is that somebody other than the reciter heard it.
 */
export function matnCertificateFields(
  session: MatnSession,
  names: { name: string; edition: string },
  lang: DisplayLang = displayLang(),
): CertificateFields | null {
  if (!canIssueCertificate(session)) return null;
  const at = session.endedAt ?? session.lastSeenAt ?? Date.now();
  const abyat = coveredCount(session.covered);
  const whole = abyat >= session.totalAbyat;
  return {
    id: session.id,
    name: session.studentName,
    amount: isArabic(lang)
      ? recitedMatnAmountAr(names.name, abyat, whole)
      : recitedMatnAmountEn(names.name, abyat, whole),
    lang: isArabic(lang) ? 'ar' : 'en',
    instructor: session.instructorName || undefined,
    riwaya: names.edition,
    durationMs: activeMs(session, at),
    at,
  };
}

/** Short keys because every byte is a module in the printed square. */
interface PackedCertificate {
  i: string; n: string; a: string; m?: string; r: string; d: number; t: number; l?: 'ar' | 'en';
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
};

export function encodeCertificate(f: CertificateFields): string {
  const packed: PackedCertificate = {
    i: f.id, n: f.name, a: f.amount, r: f.riwaya, d: Math.round(f.durationMs), t: f.at, l: f.lang,
  };
  if (f.instructor) packed.m = f.instructor;
  return toBase64Url(new TextEncoder().encode(JSON.stringify(packed)));
}

/** Anything malformed reads as nothing: the page then says so rather than guessing. */
export function decodeCertificate(text: string): CertificateFields | null {
  try {
    const packed = JSON.parse(new TextDecoder().decode(fromBase64Url(text))) as PackedCertificate;
    if (!packed?.i || !packed?.n || !packed?.a) return null;
    return {
      id: packed.i,
      name: packed.n,
      amount: packed.a,
      instructor: packed.m || undefined,
      riwaya: packed.r ?? '',
      durationMs: Number(packed.d) || 0,
      at: Number(packed.t) || Date.now(),
      // Links printed before the tool spoke English carry no language, and
      // every one of them is Arabic.
      lang: packed.l === 'en' ? 'en' : 'ar',
    };
  } catch { return null; }
}

export function certificateUrl(f: CertificateFields): string {
  return `${CERT_PAGE_URL}#${encodeCertificate(f)}`;
}

/**
 * Waits for a node to be safe to rasterise: its fonts loaded, its images
 * decoded.
 *
 * html2canvas draws whatever the DOM holds at the instant it runs. A font
 * still in flight is drawn in the fallback face — which for Arabic means a
 * different shape and a different line — and an image still in flight is drawn
 * as a blank box. Failures resolve rather than reject: a certificate with one
 * mark missing still beats no certificate at all.
 */
export async function waitForPaintable(node: HTMLElement): Promise<void> {
  await (document.fonts?.ready ?? Promise.resolve());
  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(images.map(img => (
    img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : img.decode().catch(() => undefined)
  )));
}
