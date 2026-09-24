// What the muṣḥaf looks like after months of majālis, page by page.
//
// Every other view in this project is about one session. This one is about the
// only span that answers the questions a memoriser actually asks — where am I
// strong, where do I keep losing it, and what has gone too long unopened.
//
// No React, no storage. Derived from sessions and checkable by hand.

import {
  NOTE_WEIGHT,
  type NoteKind, type RecitationSession, type SessionNote,
} from './recitation-session';
import type { QuranIndex } from './quran-index';
import type { PageOfAnchor } from './recitation-session';

/**
 * What has happened at one printed page, across every majlis.
 *
 * The **page** is the unit, not the verse. Faults spread over 6,236 verses are
 * too sparse to say anything after a handful of sessions, and no interface can
 * show that many cells; a page is also what a memoriser thinks in — «I am
 * shaky on the page with the two long verses» — and what the muṣḥaf itself
 * offers as a boundary.
 *
 * Everything here is accumulated over **anchor ids**, never over the verse
 * numbers a session displays: two majālis recited in different riwāyāt number
 * the same words differently, and adding those numbers together would add up
 * different places.
 */
export interface PageState {
  page: number;
  /** Majālis in which any part of this page was recited. */
  sessions: number;
  /** Verses recited, summed across sessions — the denominator of the heat. */
  ayahsRecited: number;
  /** Weighted faults, by the same weights the rest of the model uses. */
  faultWeight: number;
  faults: number;
  lastRecitedAt: number;
  /** null when the page has never been faulted — which is worth knowing. */
  lastFaultAt: number | null;
}

/**
 * Below this many recited verses a page has not been sampled enough for its
 * heat to mean anything: one slip on a page opened once is not a weak page,
 * it is a page you have seen once.
 */
export const MIN_AYAHS_FOR_HEAT = 8;

export function pageStates(
  sessions: RecitationSession[], index: QuranIndex, pageOf?: PageOfAnchor,
): Map<number, PageState> {
  const at = pageOf ?? ((id: number) => index.pageOf(id));
  const states = new Map<number, PageState>();

  const state = (page: number, when: number): PageState => {
    const found = states.get(page);
    if (found) return found;
    const made: PageState = {
      page, sessions: 0, ayahsRecited: 0, faultWeight: 0, faults: 0,
      lastRecitedAt: when, lastFaultAt: null,
    };
    states.set(page, made);
    return made;
  };

  for (const s of sessions) {
    const when = s.endedAt ?? s.lastSeenAt ?? s.startedAt;
    const seenThisSession = new Set<number>();

    for (const [from, to] of s.covered) {
      for (let id = from; id <= to; id++) {
        const page = at(id);
        if (page === undefined) continue;
        const st = state(page, when);
        st.ayahsRecited++;
        st.lastRecitedAt = Math.max(st.lastRecitedAt, when);
        if (!seenThisSession.has(page)) { seenThisSession.add(page); st.sessions++; }
      }
    }

    for (const n of s.notes) {
      // The note's own anchor, not its displayed number — see the note above.
      const page = at(n.position.anchor.id);
      if (page === undefined) continue;
      const st = state(page, when);
      st.faults++;
      st.faultWeight += NOTE_WEIGHT[n.kind] ?? 0;
      st.lastFaultAt = Math.max(st.lastFaultAt ?? 0, when);
    }
  }

  return states;
}

/**
 * Weighted faults per ten verses at which a page is as hot as the scale goes.
 *
 * Nine is three memorisation slips in ten verses — a page the student plainly
 * does not hold. The first draft saturated at three, which is **one** slip per
 * ten verses, and that turned out to paint almost every page the same red: a
 * single slip on a nine-verse page already maxed the scale, so the map could
 * not tell a shaky page from a lost one. A scale that saturates early is a
 * scale with no information in it.
 */
export const HEAT_SATURATION_PER_TEN = 9;

/**
 * How much this page is asking for attention, 0 to 1.
 *
 * Weighted faults per ten verses recited, clamped. A rate rather than a count,
 * for the same reason the session comparison uses one: a page recited twenty
 * times will collect more faults than a page recited once, and ranking by raw
 * faults would paint the pages a student works hardest at as their weakest.
 *
 * Returns 0 below `MIN_AYAHS_FOR_HEAT` — an unsampled page is not a cool page,
 * and `heatKnown` is how an interface tells the two apart.
 */
export function heatOf(state: PageState): number {
  if (state.ayahsRecited < MIN_AYAHS_FOR_HEAT) return 0;
  const perTen = (state.faultWeight / state.ayahsRecited) * 10;
  return Math.min(1, perTen / HEAT_SATURATION_PER_TEN);
}

/** Whether there is enough behind this page's heat to show it as a fact. */
export function heatKnown(state: PageState): boolean {
  return state.ayahsRecited >= MIN_AYAHS_FOR_HEAT;
}

// ── Spacing ─────────────────────────────────────────────────────

/**
 * Days until a page is due again, by how it has been going.
 *
 * Deliberately a plain ladder rather than anything dressed up as SM-2 or a
 * forgetting curve. Those algorithms are built on a grade the reviewer gives
 * each item every time; all this tool knows is whether a page was recited and
 * whether it faulted. Inventing a confidence score out of that and calling it
 * scheduling would be pretending to a precision we do not have.
 *
 * So: clean recitations lengthen the interval, a fault sends it back to the
 * start, and the ladder is short enough to be honest about what it is.
 */
export const SPACING_LADDER_DAYS = [1, 3, 7, 14, 30] as const;

const DAY = 86_400_000;

/**
 * How many clean majālis this page has had since it last faulted.
 *
 * The session count is the only run-length available: `PageState` keeps when a
 * page last faulted, not which sessions faulted, so a page faulted last time
 * is treated as being at the bottom of the ladder whatever its history.
 */
export function cleanRun(state: PageState): number {
  if (state.lastFaultAt === null) return state.sessions;
  return state.lastRecitedAt > state.lastFaultAt ? 1 : 0;
}

export function intervalDays(state: PageState): number {
  const rung = Math.min(cleanRun(state), SPACING_LADDER_DAYS.length - 1);
  return SPACING_LADDER_DAYS[Math.max(0, rung)];
}

export function dueAt(state: PageState): number {
  return state.lastRecitedAt + intervalDays(state) * DAY;
}

/** Positive when a page is past due; 0 when it is not yet. */
export function overdueDays(state: PageState, now: number): number {
  return Math.max(0, Math.floor((now - dueAt(state)) / DAY));
}

/** Pages past due, the longest overdue first — tonight's list. */
export function dueNow(states: Iterable<PageState>, now: number): PageState[] {
  return [...states]
    .filter(s => overdueDays(s, now) > 0)
    .sort((a, b) => overdueDays(b, now) - overdueDays(a, now) || a.page - b.page);
}

// ── The retention index ─────────────────────────────────────────

/**
 * How steady the memorisation is, in the dimensions we can actually measure.
 *
 * Each is 0 to 1, higher is better.
 *
 * **`similarity` is deliberately absent.** Telling a student that a slip was
 * caused by a look-alike verse elsewhere requires a checked dataset of
 * mutashābihāt, and there is none in this project. A number invented for that
 * dimension would be indistinguishable on screen from the four that are real,
 * which is exactly why it is not here — see `MISSING_DIMENSIONS`.
 */
export interface Retention {
  /** Verses held without a memorisation slip. */
  recall: number;
  /** Verses said without hesitating. */
  fluency: number;
  /** Freedom from faults of every kind, weighted. */
  accuracy: number;
  /** How much of what is due has actually been reviewed. */
  spacing: number;
}

/** Named so an interface can say what it cannot show, rather than omit it. */
export const MISSING_DIMENSIONS = ['similarity'] as const;

const ratio = (bad: number, total: number) => (total > 0 ? Math.max(0, 1 - bad / total) : 0);

export function retention(
  states: Iterable<PageState>,
  notes: SessionNote<unknown, NoteKind>[],
  now: number,
): Retention {
  const all = [...states];
  const ayahs = all.reduce((sum, s) => sum + s.ayahsRecited, 0);
  const weight = all.reduce((sum, s) => sum + s.faultWeight, 0);

  const kinds = { hesitation: 0, memory: 0, tajweed: 0, shakl: 0 } as Record<NoteKind, number>;
  for (const n of notes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;

  const due = all.filter(s => overdueDays(s, now) > 0).length;

  return {
    // Per ten verses, so the numbers stay on a human scale before clamping.
    recall: ratio((kinds.memory / Math.max(1, ayahs)) * 10, 1),
    fluency: ratio((kinds.hesitation / Math.max(1, ayahs)) * 10, 1),
    accuracy: ratio((weight / Math.max(1, ayahs)) * 10, 3),
    // Nothing overdue is a perfect score; every page overdue is zero.
    spacing: all.length ? 1 - due / all.length : 0,
  };
}
