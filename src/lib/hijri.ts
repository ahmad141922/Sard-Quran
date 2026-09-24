/**
 * Hijri (Umm al-Qura) date helpers.
 *
 * Primary path uses Intl with the `islamic-umalqura` calendar — the same
 * calendar Saudi Arabia publishes and the one most Islamic apps align with.
 * Older webviews that don't ship that calendar fall back to the tabular
 * ("Kuwaiti") arithmetic conversion, which stays within a day of Umm al-Qura.
 */

export interface HijriDate {
  day: number;
  month: number; // 1..12
  year: number;
}

/** Rabi' al-Awwal — the month this board feature is built around. */
export const RABI_AWWAL = 3;

export const HIJRI_MONTH_NAMES: { ar: string; en: string; fr: string }[] = [
  { ar: 'محرّم', en: 'Muharram', fr: 'Mouharram' },
  { ar: 'صفر', en: 'Safar', fr: 'Safar' },
  { ar: 'ربيع الأول', en: "Rabi' al-Awwal", fr: "Rabi' al-Awwal" },
  { ar: 'ربيع الآخر', en: "Rabi' al-Thani", fr: "Rabi' al-Thani" },
  { ar: 'جمادى الأولى', en: 'Jumada al-Ula', fr: 'Joumada al-Oula' },
  { ar: 'جمادى الآخرة', en: 'Jumada al-Akhirah', fr: 'Joumada al-Akhira' },
  { ar: 'رجب', en: 'Rajab', fr: 'Rajab' },
  { ar: 'شعبان', en: "Sha'ban", fr: 'Chaabane' },
  { ar: 'رمضان', en: 'Ramadan', fr: 'Ramadan' },
  { ar: 'شوّال', en: 'Shawwal', fr: 'Chawwal' },
  { ar: 'ذو القعدة', en: "Dhu al-Qi'dah", fr: 'Dhou al-Qida' },
  { ar: 'ذو الحجة', en: 'Dhu al-Hijjah', fr: 'Dhou al-Hijja' },
];

/* ------------------------------------------------------------------ *
 * Intl path
 * ------------------------------------------------------------------ */

let intlFmt: Intl.DateTimeFormat | null | undefined;

function getIntlFormatter(): Intl.DateTimeFormat | null {
  if (intlFmt !== undefined) return intlFmt;
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    // Guard against engines that silently ignore the calendar extension.
    intlFmt = fmt.resolvedOptions().calendar === 'islamic-umalqura' ? fmt : null;
  } catch {
    intlFmt = null;
  }
  return intlFmt;
}

/* ------------------------------------------------------------------ *
 * Tabular fallback (Kuwaiti algorithm)
 * ------------------------------------------------------------------ */

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * m2 + 2) / 5) +
    365 * y2 +
    Math.floor(y2 / 4) -
    Math.floor(y2 / 100) +
    Math.floor(y2 / 400) -
    32045
  );
}

function jdnToHijri(jdn: number): HijriDate {
  const l0 = jdn - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  let l = l0 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month, year };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Convert a Gregorian `Date` to its Hijri (Umm al-Qura) equivalent. */
export function toHijri(date: Date = new Date()): HijriDate {
  const fmt = getIntlFormatter();
  if (fmt) {
    const parts = fmt.formatToParts(date);
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const day = pick('day');
    const month = pick('month');
    const year = pick('year');
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      return { day, month, year };
    }
  }
  return jdnToHijri(gregorianToJdn(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/** Strip the time component so day arithmetic stays stable across DST. */
function atNoon(date: Date): Date {
  const d = new Date(date.getTime());
  d.setHours(12, 0, 0, 0);
  return d;
}

/** True when the given date falls inside Rabi' al-Awwal. */
export function isRabiAwwal(date: Date = new Date()): boolean {
  return toHijri(date).month === RABI_AWWAL;
}

/**
 * Gregorian date on which the given Hijri month begins.
 *
 * When `from` already sits inside that month we walk straight back to day 1;
 * otherwise we scan forward for the next occurrence (bounded to ~13 months).
 */
export function findHijriMonthStart(month: number, from: Date = new Date()): Date {
  const base = atNoon(from);
  const here = toHijri(base);
  if (here.month === month) return addDays(base, -(here.day - 1));

  let cursor = base;
  for (let i = 0; i < 400; i++) {
    cursor = addDays(cursor, 1);
    const h = toHijri(cursor);
    if (h.month === month && h.day === 1) return cursor;
  }
  return base; // unreachable in practice
}

/** Number of days (29 or 30) in the Hijri month starting at `start`. */
export function hijriMonthLength(start: Date): number {
  const month = toHijri(start).month;
  for (let i = 28; i <= 30; i++) {
    if (toHijri(addDays(start, i)).month !== month) return i;
  }
  return 30;
}

export interface HijriMonthCell {
  /** Hijri day of month, 1-based. */
  day: number;
  /** Gregorian date this Hijri day maps onto. */
  gregorian: Date;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

export interface HijriMonthView {
  /** Hijri year the month belongs to. */
  year: number;
  month: number;
  /** Gregorian date of day 1. */
  start: Date;
  /** 29 or 30. */
  length: number;
  cells: HijriMonthCell[];
  /** Weekday (0-6) that day 1 lands on — used to pad the calendar grid. */
  startWeekday: number;
  /**
   * Current Hijri day of month when `reference` sits inside this month,
   * otherwise `null` (e.g. previewing the month ahead of time).
   */
  currentDay: number | null;
}

/** Build a full day-by-day view of a Hijri month, aligned to Gregorian weekdays. */
export function buildHijriMonthView(month: number, reference: Date = new Date()): HijriMonthView {
  const start = findHijriMonthStart(month, reference);
  const length = hijriMonthLength(start);
  const cells: HijriMonthCell[] = [];
  for (let i = 0; i < length; i++) {
    const gregorian = addDays(start, i);
    cells.push({ day: i + 1, gregorian, weekday: gregorian.getDay() });
  }
  const here = toHijri(reference);
  return {
    year: toHijri(start).year,
    month,
    start,
    length,
    cells,
    startWeekday: start.getDay(),
    currentDay: here.month === month ? here.day : null,
  };
}

/**
 * Moon-phase glyphs in waxing → full → waning order, used to label the days of
 * a Hijri month. The lunar month genuinely runs new → full → new, so the
 * calendar reads as the sky does across the month.
 */
export const MOON_PHASES = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'] as const;

/**
 * Moon phase for a given day of a Hijri month.
 * Day 1 is the new moon and roughly the middle of the month is full.
 */
export function moonPhaseForDay(day: number, monthLength: number): string {
  const length = monthLength > 0 ? monthLength : 29;
  const clamped = Math.min(Math.max(day, 1), length);
  const index = Math.min(
    MOON_PHASES.length - 1,
    Math.round(((clamped - 1) / length) * MOON_PHASES.length),
  );
  return MOON_PHASES[index];
}

/** Localised Hijri month name. */
export function hijriMonthName(month: number, lang: string): string {
  const entry = HIJRI_MONTH_NAMES[month - 1] ?? HIJRI_MONTH_NAMES[0];
  return lang === 'ar' ? entry.ar : lang === 'fr' ? entry.fr : entry.en;
}

/** e.g. "12 ربيع الأول 1448" */
export function formatHijri(date: Date, lang: string): string {
  const h = toHijri(date);
  return `${h.day} ${hijriMonthName(h.month, lang)} ${h.year}`;
}
