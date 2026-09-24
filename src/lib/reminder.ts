/**
 * The reminder a memoriser sets for their own ward.
 *
 * ## Why it is local and not pushed
 *
 * A pushed reminder needs a server that knows who you are, when you recite and
 * whether you have recited today. All three are facts this tool deliberately
 * keeps on the device — the same rule that keeps recitation audio off the
 * network. A daily reminder is a clock and a string; it does not need to know
 * anybody, so it is scheduled by the device against its own clock and nothing
 * is sent anywhere.
 *
 * ## Why it skips a day that has already been recited
 *
 * The one thing that makes a person switch a reminder off is being nagged for
 * something they have already done. The tool knows when the last majlis
 * recited something, so a reminder that would land on a day already served
 * simply is not scheduled. Missing a reminder costs nothing; an untrue one
 * costs the reminder.
 *
 * ## Why several are scheduled at once
 *
 * Nothing here runs while the app is closed, which is precisely when a
 * reminder matters. So the app hands the system a run of concrete times
 * whenever it is open, and refreshes them next time. A week of them means the
 * reminder survives a week of not opening the app — and a week is also the
 * horizon past which «already recited today» stops being knowable.
 */

/** Days as `Date.getDay()` gives them: 0 is Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Reminder {
  on: boolean;
  /** Minutes after local midnight. `20 * 60` is eight in the evening. */
  at: number;
  /** Which days. Empty is never — the switch is `on`, not an empty list. */
  days: Weekday[];
}

export const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Off, at eight in the evening, every day.
 *
 * Chosen rather than left blank: a reminder somebody has to design before they
 * can use it is one they do not use. Turning the switch on has to be enough,
 * and after ʿishāʾ is when most people sit to their ward.
 */
export const DEFAULT_REMINDER: Reminder = { on: false, at: 20 * 60, days: EVERY_DAY };

/** How many days ahead the system is given at once. */
export const SCHEDULE_DAYS = 7;

const DAY_MS = 86_400_000;

/** Local midnight of the day `at` falls in. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whether two moments are the same local day. */
export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/**
 * When the reminder would next sound, strictly after `from`.
 *
 * Null where it is off or set to no days at all. The search is bounded by a
 * week because a weekday recurs within one, and an unbounded loop over a
 * malformed list is how a settings screen freezes a phone.
 */
export function nextAfter(r: Reminder, from: number): number | null {
  if (!r.on || !r.days.length) return null;
  const day0 = startOfDay(from);
  for (let i = 0; i <= 7; i++) {
    const at = day0 + i * DAY_MS + r.at * 60_000;
    if (at <= from) continue;
    if (r.days.includes(new Date(at).getDay() as Weekday)) return at;
  }
  return null;
}

/**
 * The next several times it would sound — what the system is actually given.
 *
 * `recitedAt` is when something was last recited. A reminder that would land on
 * a day already served is dropped rather than moved: the point of the day is
 * gone, not postponed.
 */
export function upcoming(
  r: Reminder,
  from: number,
  { days = SCHEDULE_DAYS, recitedAt = null as number | null } = {},
): number[] {
  const out: number[] = [];
  let cursor = from;
  const until = startOfDay(from) + (days + 1) * DAY_MS;
  for (let guard = 0; guard < days + 8; guard++) {
    const at = nextAfter(r, cursor);
    if (at === null || at >= until) break;
    cursor = at;
    if (recitedAt !== null && sameDay(at, recitedAt)) continue;
    out.push(at);
    if (out.length >= days) break;
  }
  return out;
}

/** `20 * 60` back into the `20:00` an input element wants. */
export function toClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `20:00` into minutes, or null where the field is empty or nonsense. */
export function fromClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const KEY = 'tajweedoo:ward-reminder';

/**
 * Kept on the device, like the standing goal and for the same reason: it is
 * three fields, it belongs to this phone, and no majlis may wait on it.
 */
export function loadReminder(): Reminder {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_REMINDER;
    const saved = JSON.parse(raw) as Partial<Reminder>;
    const at = typeof saved.at === 'number' && saved.at >= 0 && saved.at < 1440
      ? saved.at : DEFAULT_REMINDER.at;
    const days = Array.isArray(saved.days)
      ? [...new Set(saved.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] as Weekday[]
      : EVERY_DAY;
    return { on: saved.on === true, at, days: days.sort((a, b) => a - b) };
  } catch {
    return DEFAULT_REMINDER;
  }
}

export function saveReminder(r: Reminder): void {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private mode */ }
}
