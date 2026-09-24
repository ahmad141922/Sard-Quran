// Recitation session (مَجلِس السَّرد) — model and pure selectors.
//
// No React, no storage, no i18n. Everything the teacher reads on screen is
// derived here so it can be tested against hand-computed numbers.

import type { QuranIndex } from './quran-index';
import { displayLang, isArabic, type DisplayLang } from './display-lang';
import type { MushafId } from './mushaf-editions';
import { surahName } from './quran-data';
import type { AyahPosition } from './mushaf/position';
import { RIWAYA_NAMES_AR, type AyahCountingId, type RiwayaId } from './mushaf/registry';

/**
 * Two spaces, kept apart on purpose.
 *
 * **Identity** is what the teacher saw: an ayah number in the edition in front
 * of them. Every position and every note carries its own edition, and nothing
 * ever rewrites those numbers — a note taken in the Warsh muṣḥaf stays a Warsh
 * note, in Warsh's numbering, in the report and forever.
 *
 * **Measurement** is arithmetic over intervals: how much was recited, which
 * juz' are done, what percentage. Intervals from two editions cannot be added
 * together, so this side works on the anchor of each position, and its results
 * are counts — never ayah numbers to display.
 *
 * Field names say which space they are in: anything called `…AnchorId` is
 * measurement and must not be printed as a verse number.
 */

export type NoteKind = 'hesitation' | 'memory' | 'tajweed' | 'shakl';
//                      تردد          خطأ حفظ    تنبيه تجويد

/**
 * Display order matches the buttons on screen.
 *
 * `shakl` — a wrong vowel, a ḥaraka read as another — is last, not beside
 * `memory` where it arguably belongs: the first three buttons have been where
 * they are since the tool began, and their positions are what a teacher's thumb
 * already knows. A new button goes at the end so no old one moves. It is its
 * own key rather than a sense of `tajweed`, for the reason `MatnNoteKind` gives.
 */
export const NOTE_KINDS: NoteKind[] = ['hesitation', 'memory', 'tajweed', 'shakl'];

/**
 * Weights for ranking what needs review. A memorisation slip is the real
 * problem; a hesitation is a hint. Used by both `surahPressure` and the
 * review-plan builder so the two never disagree.
 */
export const NOTE_WEIGHT: Record<NoteKind, number> = {
  memory: 3,
  tajweed: 2,
  // A misread vowel can change a word's meaning — the classical «laḥn jaliyy» —
  // so it ranks above a tajweed slip. Half a point above, not level with a
  // memory slip, which stays the heaviest thing a majlis can record. The
  // teacher's call, made deliberately: a weight here reorders every review plan.
  shakl: 2.5,
  hesitation: 1,
};

/**
 * The third kind, when what is being recited is a poem rather than the Qur'an.
 *
 * A new key, never `'tajweed'` reused with a second meaning: the kind is
 * written into stored sessions and into the cloud, and giving an old key a new
 * sense would silently change what every past report says. A key is cheaper
 * than a migration.
 */
export type MatnNoteKind = 'hesitation' | 'memory' | 'dabt';
//                          تردد          خطأ حفظ    خطأ ضبط

export const MATN_NOTE_KINDS: MatnNoteKind[] = ['hesitation', 'memory', 'dabt'];

export const MATN_NOTE_WEIGHT: Record<MatnNoteKind, number> = {
  memory: 3,
  dabt: 2,
  hesitation: 1,
};

/**
 * A note, over whatever kind of place the text has.
 *
 * Generic in the position and in the kind, with both defaulting to the Qur'an
 * side so that every existing `SessionNote` keeps meaning exactly what it
 * meant. What a note *is* — a fault, fixed at a place, at a moment, removable
 * — is the same whether the place is an ayah or half a line of rajaz.
 */
export interface SessionNote<P = AyahPosition, K extends string = NoteKind> {
  id: string;
  at: number;
  kind: K;
  /**
   * Where it was taken, in the edition it was taken in.
   *
   * Switching riwaya later does not touch this. The slip happened at a verse
   * the teacher was looking at in a particular book, and that is the record.
   */
  position: P;
  /**
   * Which printed word of the verse, when the note was put on one.
   *
   * Absent for a note on the verse as a whole — every note taken before this
   * existed, and every note taken without picking a word first. An index into
   * the verse's printed words; see `word-pin.ts`.
   */
  word?: number;
  /** Optional free text added by long-pressing the button. */
  detail?: string;
  /** Optional rule id, tajweed notes only. */
  tajweedRuleId?: string;
}

/**
 * A place the reciter wants to come back to — not a mistake.
 *
 * Kept in its own list rather than added as a fourth `NoteKind`, because
 * everything that reads `notes` reads them as errors: `surahPressure` divides
 * their weight by the ayahs recited, `notesPerPage` counts them per page, and
 * the report prints them under what went wrong. A bookmark folded in there
 * would raise the pressure on a surah the reciter merely wants to revisit,
 * which is the opposite of what that number is for.
 *
 * A mark is also about the future where a note is about the past: it can sit
 * on a verse that came out perfectly but felt unsteady.
 */
export interface SessionMark<P = AyahPosition> {
  id: string;
  at: number;
  /** Where it was taken, in the edition it was taken in — as for a note. */
  position: P;
  /** Optional free text added by long-pressing the button. */
  detail?: string;
}

/**
 * A spoken correction, recorded by the teacher at a place.
 *
 * A third list, beside notes and marks, because it is a third kind of thing.
 * A note is evidence the student erred; a mark is a place to come back to; a
 * correction is **the teacher teaching** — the shaykh's own voice saying what
 * the right reading is. It can sit at a verse the student never stumbled on,
 * and it must not raise the pressure on a surah the way an error does.
 *
 * The audio itself is not here. `audioId` addresses a clip in its own store
 * (`audio-store.ts`), so the session stays the small record it has always
 * been — a majlis of two hours is a few kilobytes, and it has to stay
 * readable, mirrorable and exportable without dragging megabytes behind it.
 */
export interface SessionCorrection<P = AyahPosition> {
  id: string;
  at: number;
  position: P;
  /** Key into the audio store. Absent means the clip failed to save. */
  audioId?: string;
  durationMs: number;
}

/**
 * Who is listening — and therefore what the session may claim.
 *
 * `majlis` is the tool's founding case: someone recites, someone else hears.
 * `solo` is a person reciting to themselves, and that is a different act, not
 * a majlis with an empty chair. Two consequences are enforced below rather
 * than left to the interface: the third note button becomes a mark instead of
 * a tajweed note, because a reciter rarely catches their own laḥn — that is
 * precisely what the listener was there for — and no certificate is issued,
 * because a certificate's whole worth is that somebody other than the reciter
 * heard the recitation.
 */
export type SessionMode = 'majlis' | 'solo';

export type GoalKind = 'juz1' | 'juz5' | 'juz10' | 'juz15' | 'full' | 'custom';

export const GOAL_JUZ_COUNT: Record<Exclude<GoalKind, 'full' | 'custom'>, number> = {
  juz1: 1,
  juz5: 5,
  juz10: 10,
  juz15: 15,
};

export interface SessionGoal {
  kind: GoalKind;
  /** Where the majlis was set to begin and end, in the edition it was set in. */
  start: AyahPosition;
  end: AyahPosition;
}

/** A stretch of wall-clock time the teacher was actually listening. */
export interface TimeSegment {
  from: number;
  /** null while the segment is still running. */
  to: number | null;
}

/**
 * Sorted, non-overlapping, non-adjacent inclusive ranges of **anchor ids**.
 *
 * Measurement, not identity. A majlis can change edition halfway through, and
 * two editions number verses differently, so what was recited is accumulated
 * in the one scheme both can be expressed in. These numbers are counted and
 * compared; they are never shown to anyone as ayah numbers.
 */
export type CoveredRanges = [number, number][];

/**
 * What every recitation session is, whatever is being recited.
 *
 * Lifted out of `RecitationSession` without changing a field of it: who was
 * there, how long it ran, what was noted and where, and whether it has been
 * mirrored. None of that cares whether the place is an ayah or half a line of
 * a poem — only the *place* differs, so the place is the parameter.
 *
 * What is deliberately **not** here: the goal, what counts as progress, and
 * the book's own metadata. Those genuinely differ — juzʾ and pages mean
 * nothing in a matn, and abwāb mean nothing in the muṣḥaf — and folding them
 * into a shared shape would only produce fields that are dead half the time.
 */
export interface SessionCore<P, K extends string = NoteKind> {
  id: string;
  /** The reciter — القارئ, the student doing the reciting. */
  studentName: string;
  /**
   * The muqri' — المقرئ, the one listening and certifying.
   *
   * Asked for at every majlis now that the session issues a certificate: it
   * reads «على المقرئ فلان», and a certificate that cannot name who heard the
   * recitation certifies nothing. Still optional in the type, because sessions
   * recorded before that are read forward as they were.
   */
  instructorName?: string;
  /**
   * How to reach each side of the majlis, and where each is.
   *
   * Both sides, not just whoever holds the device: a majlis is two people, and
   * a record naming one of them is half a record. Numbers are stored in
   * international form (`+…`), and each country is the one its own dialling
   * code names — correctable by hand, because +1 alone cannot tell the United
   * States from Canada.
   */
  studentWhatsapp?: string;
  studentCountry?: string;
  instructorWhatsapp?: string;
  instructorCountry?: string;
  /**
   * The single contact the form used to ask for, before it asked for both.
   * Kept so sessions recorded then still say what they said.
   *
   * @deprecated read `studentWhatsapp` / `instructorWhatsapp`.
   */
  whatsapp?: string;
  country?: string;
  /**
   * Which side of the majlis was holding the device.
   *
   * Both names are recorded either way; this says which of them typed. It is
   * the difference between a teacher listening to a halaqa and a memoriser
   * reciting to their own shaykh, and the owner cannot tell them apart from
   * two names alone.
   */
  operatorRole?: 'reciter' | 'listener';
  /**
   * Whether anyone was listening.
   *
   * Optional, and absence means `majlis` — every session recorded before the
   * setup screen offered the choice was one, and is read forward as what it
   * was. Read it through `sessionMode()` rather than directly, so that
   * defaulting happens in one place. Note this is not `operatorRole`: that
   * says which of two people held the device, and still assumes two.
   */
  mode?: SessionMode;
  /** Where the marker is, named in the edition on screen. */
  current: P;
  segments: TimeSegment[];
  notes: SessionNote<P, K>[];
  /**
   * Places to come back to. Optional for the same reason as `mode`: sessions
   * recorded before marks existed have none, and `sessionMarks()` reads them
   * as the empty list rather than making every caller guard.
   */
  marks?: SessionMark<P>[];
  /**
   * Spoken corrections. Optional for the same reason as `marks`: sessions
   * recorded before they existed have none, and `sessionCorrections()` reads
   * that as the empty list rather than making every caller guard.
   */
  corrections?: SessionCorrection<P>[];
  startedAt: number;
  endedAt: number | null;
  /**
   * Last time the session was written to disk. On restore after a crash or a
   * PWA reload the open time segment is closed at this instant, so the hours
   * the app was gone are not billed to the student.
   */
  lastSeenAt: number;
  /**
   * When this session was mirrored to Supabase. Absent on a finished session
   * means the push has not landed yet — a classroom offline at the end of a
   * majlis, typically — and it is retried on the next launch.
   */
  syncedAt?: number;
  status: 'active' | 'paused' | 'ended';
}

/**
 * A majlis of Qur'an — the founding case, and unchanged in shape.
 *
 * `textKind` is optional and absent means Qur'an, the same courtesy `mode`
 * gets: every session ever recorded was one, and is read forward as what it
 * was. It is the discriminator against `MatnSession`, and `modelVersion` is
 * **not** — the two are different kinds of record, not two versions of one.
 */
export interface RecitationSession extends SessionCore<AyahPosition, NoteKind> {
  textKind?: 'quran';
  goal: SessionGoal;
  /**
   * The surah this majlis set out to recite.
   *
   * Not derived from `current.surah`: the last page of a surah usually carries
   * the opening of the next one, so the marker wanders out of the surah while
   * the majlis is still about it. "Finish the surah" has to mean the surah the
   * student started, not whichever one the marker happens to sit in.
   */
  sessionSurah: number;
  /**
   * The halaqa roster student reciting, when a teacher's phone runs the majlis
   * and the teacher picked them from the list.
   *
   * Absent for everything else — a reciter alone, a majlis before rosters
   * existed, a student's own phone (whose enrolment says who they are; see
   * `enrolment.ts`). Stored because it is a fact about who recited, which is
   * what the teacher's view of a student is made of.
   */
  rosterStudentId?: string;
  covered: CoveredRanges;
  /**
   * The book being recited from now.
   *
   * Denormalised rather than looked up from the registry: a finished majlis is
   * a record, and it has to stay readable if the edition is renamed or
   * withdrawn from the app.
   */
  mushafId: string;
  riwayaId: RiwayaId;
  ayahCounting: AyahCountingId;
  /**
   * Printed layout the page numbers in the report and the review plan refer
   * to. Stored on the session so a plan stays reproducible even if the teacher
   * later switches editions. Distinct from `mushafId`: this is the text
   * layer's pagination, that is the plates on screen.
   */
  mushaf: MushafId;
  /**
   * Model revision, so a session written by an older build can be read.
   *
   * Not bumped for `mode` and `marks`: both are additive and both have a
   * meaning for their own absence, so an old session is already a valid new
   * one and there is nothing to migrate. A revision is for a reshaping the
   * reader cannot survive — the way `currentAyahId` became a position object —
   * and spending one here would only make every stored session look changed
   * when none of them is.
   */
  modelVersion: 2;
}

// ── Mode and marks ──────────────────────────────────────────────

/**
 * The mode a session was run in; absent means the founding case.
 *
 * Typed against the field alone rather than a whole majlis: reciting a matn
 * takes the same two modes for the same reasons, and a second copy of this
 * defaulting is a second place for it to drift.
 */
export function sessionMode(s: { mode?: SessionMode }): SessionMode {
  return s.mode ?? 'majlis';
}

/** Marks taken, or none — never undefined, so callers can just iterate. */
export function sessionMarks<P>(s: { marks?: SessionMark<P>[] }): SessionMark<P>[] {
  return s.marks ?? [];
}

/** Corrections recorded, or none — never undefined. */
export function sessionCorrections<P>(
  s: { corrections?: SessionCorrection<P>[] },
): SessionCorrection<P>[] {
  return s.corrections ?? [];
}

/**
 * The note buttons this session offers.
 *
 * Solo drops the tajweed and shakl notes rather than showing buttons that will almost
 * never be pressed honestly: catching one's own tajweed slip while reciting
 * from memory is the listener's job, and offering the button anyway would
 * promise a kind of correction the mode cannot give. The third slot is taken
 * by the mark instead — see `sessionMarks`.
 *
 * The first two are identical in both modes on purpose: it is what keeps a
 * solo session and a majlis comparable in `surahPressure`.
 */
export function noteKindsFor(s: RecitationSession): NoteKind[] {
  return sessionMode(s) === 'solo' ? ['hesitation', 'memory'] : NOTE_KINDS;
}

/**
 * Whether this session may produce a certificate.
 *
 * A certificate reads «على المقرئ فلان», and its entire evidentiary worth is
 * that someone other than the reciter heard what it attests. A solo session
 * has no witness, so it produces a report — a personal record, which is a fine
 * thing — and never a certificate. `CertificateFields.instructor` is optional,
 * so the type will not stop this on its own; it is stopped here.
 */
export function canIssueCertificate(s: { mode?: SessionMode }): boolean {
  return sessionMode(s) !== 'solo';
}

// ── Covered ranges ──────────────────────────────────────────────

/** Sorts and joins overlapping or adjacent ranges (…,5] + [6,… becomes one). */
export function normalizeRanges(ranges: CoveredRanges): CoveredRanges {
  const sorted = ranges
    .filter(([a, b]) => b >= a)
    .map(([a, b]) => [a, b] as [number, number])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: CoveredRanges = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Merges [from, to] into the range list. Re-reciting a passage is a no-op,
 * which is what makes the percentage honest when a student goes back over a
 * page they already read.
 */
export function mergeRange(covered: CoveredRanges, from: number, to: number): CoveredRanges {
  return normalizeRanges([...covered, [Math.min(from, to), Math.max(from, to)]]);
}

/** Total ayahs in the range list. */
export function coveredCount(covered: CoveredRanges): number {
  return covered.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
}

/** Ayahs of the range list that fall inside [lo, hi]. */
export function coveredWithin(covered: CoveredRanges, lo: number, hi: number): number {
  let sum = 0;
  for (const [a, b] of covered) {
    const from = Math.max(a, lo);
    const to = Math.min(b, hi);
    if (to >= from) sum += to - from + 1;
  }
  return sum;
}

export function isCovered(covered: CoveredRanges, id: number): boolean {
  return covered.some(([a, b]) => id >= a && id <= b);
}

// ── Goal ────────────────────────────────────────────────────────

/**
 * "5 juz'" means "up to the end of the 5th juz' counting from where the student
 * started" — the way a teacher says it — not an abstract count of ayahs.
 */
export function resolveGoalEnd(startAyahId: number, kind: GoalKind, index: QuranIndex): number {
  if (kind === 'full') return index.totalAyahs;
  if (kind === 'custom') return index.totalAyahs;
  const n = GOAL_JUZ_COUNT[kind];
  const startJuz = index.juzOf(startAyahId);
  const endJuz = Math.min(index.juzRanges.length, startJuz + n - 1);
  return index.juzRanges[endJuz - 1]?.lastId ?? index.totalAyahs;
}

export function goalAyahCount(goal: SessionGoal): number {
  return Math.max(1, goal.end.anchor.id - goal.start.anchor.id + 1);
}

/** The goal's span in anchor ids — the measurement side of the goal. */
export function goalSpan(goal: SessionGoal): [number, number] {
  return [goal.start.anchor.id, goal.end.anchor.id];
}

// ── Time ────────────────────────────────────────────────────────
//
// These read `segments`, `startedAt` and `endedAt` and nothing else, so they
// are typed against exactly that: a matn session keeps time the same way a
// majlis of Qur'an does, and a second copy of this arithmetic would be a
// second chance to get it wrong.

/**
 * Just enough of a session to keep time — see the note above.
 *
 * `status` is carried although the arithmetic ignores it: callers reopen a
 * session by passing a literal with the new status spliced in, and a `Pick`
 * without it would reject that literal on the excess-property check for a
 * field the session genuinely has.
 */
export type Timed =
  Pick<SessionCore<unknown, string>, 'segments' | 'startedAt' | 'endedAt' | 'status'>;

/** Sum of listening segments — excludes breaks, unlike wall-clock. */
export function activeMs(s: Timed, now: number = Date.now()): number {
  let total = 0;
  for (const seg of s.segments) total += Math.max(0, (seg.to ?? now) - seg.from);
  return total;
}

/** Start to finish including breaks. */
export function wallClockMs(s: Timed, now: number = Date.now()): number {
  return Math.max(0, (s.endedAt ?? now) - s.startedAt);
}

/** Time the majlis was open but not listening — breaks, and any paused stretch. */
export function pausedMs(s: Timed, now: number = Date.now()): number {
  return Math.max(0, wallClockMs(s, now) - activeMs(s, now));
}

export function startSegment(s: Timed, now: number = Date.now()): TimeSegment[] {
  const last = s.segments[s.segments.length - 1];
  if (last && last.to === null) return s.segments;
  return [...s.segments, { from: now, to: null }];
}

export function closeSegment(s: Timed, now: number = Date.now()): TimeSegment[] {
  const last = s.segments[s.segments.length - 1];
  if (!last || last.to !== null) return s.segments;
  return [...s.segments.slice(0, -1), { from: last.from, to: now }];
}

// ── Progress ────────────────────────────────────────────────────

export function progressPct(s: RecitationSession): number {
  const [from, to] = goalSpan(s.goal);
  const done = coveredWithin(s.covered, from, to);
  return Math.min(100, Math.round((done / goalAyahCount(s.goal)) * 100));
}

export type JuzState = 'done' | 'active' | 'pending' | 'out';

/**
 * State of each of the 30 juz'. `out` (not part of this session's goal) is kept
 * distinct from `pending` — without it a one-juz' goal would read as 97% failed.
 */
export function juzStates(s: RecitationSession, index: QuranIndex): JuzState[] {
  return index.juzRanges.map(({ firstId, lastId }) => {
    const lo = Math.max(firstId, s.goal.start.anchor.id);
    const hi = Math.min(lastId, s.goal.end.anchor.id);
    if (hi < lo) return 'out';
    const need = hi - lo + 1;
    if (coveredWithin(s.covered, lo, hi) >= need) return 'done';
    const at = s.current.anchor.id;
    if (at >= firstId && at <= lastId) return 'active';
    return 'pending';
  });
}

/**
 * Which page an anchor falls on.
 *
 * Defaults to the text layer's pagination, which is right while every edition
 * is set to the same pages. A book that paginates differently — ash-Shamarly
 * will — supplies its own, so "six pages" means six of *its* pages.
 */
export type PageOfAnchor = (anchorId: number) => number | undefined;

/** Distinct mushaf pages with at least one recited ayah. */
export function pagesTouched(
  s: RecitationSession, index: QuranIndex, pageOf?: PageOfAnchor,
): number[] {
  const at = pageOf ?? ((id: number) => index.pageOf(id));
  const pages = new Set<number>();
  for (const [a, b] of s.covered) {
    for (let id = a; id <= b; id++) {
      const page = at(id);
      if (page !== undefined) pages.add(page);
    }
  }
  return [...pages].sort((x, y) => x - y);
}

/** True when every ayah of the Quran was recited in this majlis. */
export function isKhatmah(s: RecitationSession, index: QuranIndex): boolean {
  return coveredWithin(s.covered, 1, index.totalAyahs) >= index.totalAyahs;
}

/** Covers everything from where the majlis began to the end of its goal. */
export function completeGoal(s: RecitationSession): RecitationSession {
  const [from, to] = goalSpan(s.goal);
  return coverSpan(s, from, to);
}

export interface VolumeSummary {
  ayahs: number;
  /** Juz' recited end to end. */
  fullJuz: number;
  /** Pages recited that are not inside one of those complete juz'. */
  extraPages: number;
  pages: number;
}

/**
 * "5 juz' and 3 pages". Complete juz' are counted first, then only the pages
 * left over — no rounding a partial juz' up to a whole one.
 */
export function volumeSummary(
  s: RecitationSession, index: QuranIndex, pageOf?: PageOfAnchor,
): VolumeSummary {
  const completeJuz: number[] = [];
  index.juzRanges.forEach(({ firstId, lastId }, i) => {
    if (coveredWithin(s.covered, firstId, lastId) >= lastId - firstId + 1) completeJuz.push(i + 1);
  });
  const juzSet = new Set(completeJuz);
  const pages = pagesTouched(s, index, pageOf);
  // Juz' are counted on the anchors either way; a page is "extra" when it is
  // not inside one of the juz' already counted whole. With a foreign
  // pagination there is no canonical range to ask, so every page counts.
  const extraPages = pageOf
    ? pages.length - completeJuz.length * 20
    : pages.filter(p => {
      const r = index.pageRanges[p - 1];
      return !r || !juzSet.has(index.juzOf(r.firstId));
    }).length;
  return {
    ayahs: coveredCount(s.covered),
    fullJuz: completeJuz.length,
    extraPages,
    pages: pages.length,
  };
}

// ── Notes ───────────────────────────────────────────────────────

export function noteCounts(s: RecitationSession): Record<NoteKind, number> {
  const counts: Record<NoteKind, number> = { hesitation: 0, memory: 0, tajweed: 0, shakl: 0 };
  for (const n of s.notes) counts[n.kind]++;
  return counts;
}

/**
 * Notes as a teacher reads them: one line per surah, ayah numbers listed.
 *
 * Grouped by surah **and by edition**. A majlis that changed muṣḥaf halfway
 * holds notes in two numberings, and listing them on one line would produce a
 * sequence of numbers that means nothing — so each riwaya keeps its own line
 * and says which it is.
 *
 * Takes anything carrying a position rather than a `SessionNote`: marks are
 * listed the same way, and grouping them is the same problem.
 */
export function groupedNoteLines(
  notes: { position: AyahPosition; word?: number }[],
  sessionMushafId?: string,
  /**
   * How to name the words noted on a verse, when the caller wants them shown —
   * «(الكلمة ٣)» after the verse number. Omitted, the lines are exactly what they
   * always were. Never the compact «٥:٣», which every reader of the Qur'an
   * reads as surah five, verse three.
   */
  wordLabel?: (words: number[]) => string,
): string[] {
  const mixed = new Set(notes.map(n => n.position.mushafId)).size > 1;
  const groups = new Map<string, { surah: number; mushafId: string; riwayaId: RiwayaId; ayahs: Map<number, Set<number>> }>();
  for (const n of notes) {
    const key = `${n.position.surah}|${n.position.mushafId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        surah: n.position.surah,
        mushafId: n.position.mushafId,
        riwayaId: n.position.riwayaId,
        ayahs: new Map(),
      };
      groups.set(key, group);
    }
    // Each verse once, with whichever of its words were noted; a note on the
    // verse as a whole adds the verse and no word.
    const words = group.ayahs.get(n.position.ayah) ?? new Set<number>();
    if (n.word !== undefined) words.add(n.word);
    group.ayahs.set(n.position.ayah, words);
  }
  return [...groups.values()]
    .sort((a, b) => a.surah - b.surah || a.mushafId.localeCompare(b.mushafId))
    .map(g => {
      const ayahs = [...g.ayahs.entries()]
        .sort(([x], [y]) => x - y)
        .map(([ayah, words]) => (words.size && wordLabel
          ? `${ayah} (${wordLabel([...words].sort((a, b) => a - b))})`
          : String(ayah)))
        .join('، ');
      const label = `${surahName(g.surah)} ${ayahs}`;
      return mixed || (sessionMushafId && g.mushafId !== sessionMushafId)
        ? `${label} (${RIWAYA_NAMES_AR[g.riwayaId] ?? g.riwayaId})`
        : label;
    });
}

export function noteWeightSum(notes: SessionNote[]): number {
  return notes.reduce((sum, n) => sum + NOTE_WEIGHT[n.kind], 0);
}

/**
 * A surah needs at least this many recited ayahs before it can be ranked. Below
 * it, one slip in a three-ayah surah would outrank a genuinely shaky juz'.
 */
export const MIN_AYAHS_FOR_PRESSURE = 10;

export interface SurahPressure {
  surah: number;
  name: string;
  /** Weighted notes per 10 recited ayahs. */
  score: number;
  ayahsCovered: number;
  counts: Record<NoteKind, number>;
}

export interface PressureResult {
  items: SurahPressure[];
  /**
   * True when no surah cleared MIN_AYAHS_FOR_PRESSURE and the ranking fell back
   * to raw weighted counts. The UI says so rather than pretending.
   */
  lowConfidence: boolean;
}

export function surahPressure(s: RecitationSession, index: QuranIndex, top = 3): PressureResult {
  return surahPressureAcross([s], index, top);
}

/**
 * The same ranking read over many sessions — which is the useful span.
 *
 * One majlis is a small sample: three slips in it say little, and the surah a
 * memoriser keeps losing shows itself over weeks, not in one sitting. This is
 * what a person reviewing alone actually wants from the tool, and it is why
 * `surahPressure` above is a special case of it rather than a second
 * implementation that could drift.
 *
 * **Recited ayahs are summed, not unioned.** The score is a rate, so a surah
 * recited on five nights carries five times the denominator. Taking the union
 * of what was covered would instead make the surah reviewed *most often* rank
 * worst, which is exactly backwards.
 */
export function surahPressureAcross(
  sessions: RecitationSession[], index: QuranIndex, top = 3,
): PressureResult {
  // Grouped by surah, the one thing the riwayat number identically: they
  // disagree about where verses divide, never about which surah words are in.
  const bySurah = new Map<number, SessionNote[]>();
  for (const s of sessions) {
    for (const n of s.notes) {
      const list = bySurah.get(n.position.surah);
      if (list) list.push(n);
      else bySurah.set(n.position.surah, [n]);
    }
  }

  const all: SurahPressure[] = [];
  for (const [surah, notes] of bySurah) {
    const r = index.surahRanges[surah - 1];
    const ayahsCovered = r
      ? sessions.reduce((sum, s) => sum + coveredWithin(s.covered, r.firstId, r.lastId), 0)
      : 0;
    const counts: Record<NoteKind, number> = { hesitation: 0, memory: 0, tajweed: 0, shakl: 0 };
    for (const n of notes) counts[n.kind]++;
    const weight = noteWeightSum(notes);
    all.push({
      surah,
      name: surahName(surah),
      score: ayahsCovered > 0 ? (weight / ayahsCovered) * 10 : weight,
      ayahsCovered,
      counts,
    });
  }

  const eligible = all.filter(a => a.ayahsCovered >= MIN_AYAHS_FOR_PRESSURE);
  const lowConfidence = eligible.length === 0;
  const pool = lowConfidence ? all : eligible;
  pool.sort((a, b) => b.score - a.score || b.ayahsCovered - a.ayahsCovered);
  return { items: pool.slice(0, top), lowConfidence };
}

/** Weighted notes per recited page — one number to compare sessions with. */
export function notesPerPage(
  s: RecitationSession, index: QuranIndex, pageOf?: PageOfAnchor,
): number {
  const pages = pagesTouched(s, index, pageOf).length;
  if (!pages) return 0;
  return s.notes.length / pages;
}

// ── Formatting ──────────────────────────────────────────────────

export function splitDuration(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** "2:47" — the compact form for the live panel. */
/**
 * The live clock: hours, minutes and seconds.
 *
 * Seconds because a reciter asked for them, and they are right to: a verse is
 * recited in seconds, and a clock that moves once a minute looks stopped to
 * somebody watching it mid-page. The hour is always shown, even at zero, so the
 * figure keeps its width as it ticks — a toolbar clock that grew a digit on
 * the hour would shove the buttons beside it.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Arabic counted nouns: 1 and 2 carry no numeral, 3–10 take the broken plural. */
export function arabicCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function arabicMinutes(n: number): string {
  return arabicCount(n, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة');
}

/**
 * "5 أجزاء و3 صفحات · 1234 آية".
 *
 * Arabic counts inflect (جزء / جزءان / أجزاء / جزءًا), so the Arabic form is
 * built here rather than glued together from flat translation keys.
 */
export function formatVolumeAr(v: VolumeSummary): string {
  const page = (n: number) => arabicCount(n, 'صفحة', 'صفحتان', 'صفحات', 'صفحة');
  const parts: string[] = [];
  if (v.fullJuz) parts.push(arabicCount(v.fullJuz, 'جزء', 'جزءان', 'أجزاء', 'جزءًا'));
  if (v.extraPages) parts.push(page(v.extraPages));
  if (!parts.length) parts.push(page(v.pages));
  return `${parts.join(' و')} · ${arabicCount(v.ayahs, 'آية', 'آيتان', 'آيات', 'آية')}`;
}

/**
 * "5 أجزاء و3 صفحات · 1234 آية" / "5 juz' and 3 pages · 1,234 ayahs".
 *
 * English pluralises by adding an s and nothing else, so it needs none of the
 * dual-and-broken-plural machinery above — but it does need the same shape, so
 * the two sit side by side and a reader of either sees one document.
 */
export function formatVolumeEn(v: VolumeSummary): string {
  const page = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
  const parts: string[] = [];
  if (v.fullJuz) parts.push(`${v.fullJuz} juz'`);
  if (v.extraPages) parts.push(page(v.extraPages));
  if (!parts.length) parts.push(page(v.pages));
  return `${parts.join(' and ')} · ${v.ayahs} ${v.ayahs === 1 ? 'ayah' : 'ayahs'}`;
}

/** Whichever of the two the interface is speaking. */
export function formatVolume(v: VolumeSummary, lang: DisplayLang = displayLang()): string {
  return isArabic(lang) ? formatVolumeAr(v) : formatVolumeEn(v);
}

/**
 * Counted nouns for English, where the rule is one word or one word plus s.
 * Mirrors `arabicCount` so a caller can pick by language and not by branch.
 */
export function countEn(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "ساعتان و34 دقيقة" / "2h 34m" — the prose form for the report. */
export function formatDuration(ms: number, lang: string): string {
  const { hours, minutes } = splitDuration(ms);
  if (lang === 'ar') {
    if (hours === 0 && minutes === 0) return 'أقل من دقيقة';
    const h = hours ? arabicCount(hours, 'ساعة', 'ساعتان', 'ساعات', 'ساعة') : '';
    const m = minutes ? arabicCount(minutes, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة') : '';
    if (h && m) return `${h} و${m}`;
    return h || m;
  }
  if (hours === 0 && minutes === 0) return '<1m';
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ');
}

// ── Construction ────────────────────────────────────────────────

let noteSeq = 0;
function newId(prefix: string): string {
  noteSeq++;
  return `${prefix}${Date.now().toString(36)}${noteSeq.toString(36)}`;
}

/**
 * An id for a session of any kind.
 *
 * Shared with the matn side so the two never mint colliding ids: the counter
 * behind it is per-process, and a second copy would restart at zero.
 */
export function newSessionId(prefix = 'rs'): string {
  return newId(prefix);
}

export function createSession(opts: {
  studentName: string;
  /** Set when the reciter was picked from a teacher's halaqa roster. */
  rosterStudentId?: string;
  instructorName?: string;
  studentWhatsapp?: string;
  studentCountry?: string;
  instructorWhatsapp?: string;
  instructorCountry?: string;
  operatorRole?: 'reciter' | 'listener';
  /** Omitted means a majlis — see `RecitationSession.mode`. */
  mode?: SessionMode;
  goalKind: GoalKind;
  /** Chosen in the edition on screen, and stored as it was chosen. */
  start: AyahPosition;
  end: AyahPosition;
  index: QuranIndex;
  now?: number;
}): RecitationSession {
  const now = opts.now ?? Date.now();
  return {
    id: newId('rs'),
    studentName: opts.studentName.trim(),
    // Only written when present, so a session nobody picked serialises as before.
    ...(opts.rosterStudentId ? { rosterStudentId: opts.rosterStudentId } : {}),
    instructorName: opts.instructorName?.trim() || undefined,
    studentWhatsapp: opts.studentWhatsapp?.trim() || undefined,
    studentCountry: opts.studentCountry?.trim() || undefined,
    instructorWhatsapp: opts.instructorWhatsapp?.trim() || undefined,
    instructorCountry: opts.instructorCountry?.trim() || undefined,
    operatorRole: opts.operatorRole,
    // Written only when it is not the default, so a majlis session serialises
    // exactly as it did before the mode existed.
    mode: opts.mode === 'solo' ? 'solo' : undefined,
    goal: { kind: opts.goalKind, start: opts.start, end: opts.end },
    current: opts.start,
    sessionSurah: opts.start.surah,
    covered: [],
    segments: [{ from: now, to: null }],
    notes: [],
    startedAt: now,
    endedAt: null,
    lastSeenAt: now,
    status: 'active',
    mushafId: opts.start.mushafId,
    riwayaId: opts.start.riwayaId,
    ayahCounting: opts.start.ayahCounting,
    mushaf: opts.index.mushaf,
    modelVersion: 2,
  };
}

/**
 * Whoever ran this majlis — the side that was holding the device.
 *
 * Counting people by the reciter's *name* counted text, not people: two boys
 * called محمد were one, and «محمد» with a trailing space was two. The person
 * running the tool is the one we actually know something unique about — their
 * WhatsApp number — so they are the unit, whichever side of the majlis they
 * sat on.
 *
 * `key` is for counting and nothing else; it is never shown.
 */
export function sessionCreator(s: RecitationSession): {
  key: string; name: string; whatsapp?: string; role: 'reciter' | 'listener';
} {
  const role = s.operatorRole === 'reciter' ? 'reciter' : 'listener';
  const asReciter = role === 'reciter';
  const name = (asReciter ? s.studentName : s.instructorName) || s.studentName || '—';
  // Sessions from before the form asked for both sides carried one contact —
  // the operator's — under the old field names.
  const whatsapp = (asReciter ? s.studentWhatsapp : s.instructorWhatsapp) || s.whatsapp;
  return { key: (whatsapp || name).trim().toLowerCase(), name, whatsapp, role };
}

export function makeNote<P = AyahPosition, K extends string = NoteKind>(
  kind: K, position: P, now?: number,
): SessionNote<P, K> {
  return { id: newId('n'), at: now ?? Date.now(), kind, position };
}

export function makeMark<P>(position: P, now?: number): SessionMark<P> {
  return { id: newId('m'), at: now ?? Date.now(), position };
}

export function makeCorrection<P>(
  position: P, durationMs: number, audioId?: string, now?: number,
): SessionCorrection<P> {
  return { id: newId('c'), at: now ?? Date.now(), position, audioId, durationMs };
}

export function addCorrection<P, S extends { corrections?: SessionCorrection<P>[] }>(
  s: S, correction: SessionCorrection<P>,
): S {
  return { ...s, corrections: [...sessionCorrections(s), correction] };
}

/**
 * Drops a correction.
 *
 * The clip it points at is **not** deleted here: this file is pure, and the
 * caller is the one that can reach the audio store. `deleteClip` belongs
 * beside wherever this is called from.
 */
export function removeCorrection<P, S extends { corrections?: SessionCorrection<P>[] }>(
  s: S, id: string,
): S {
  return { ...s, corrections: sessionCorrections(s).filter(c => c.id !== id) };
}

/**
 * Appends a mark, creating the list on a session recorded before marks.
 *
 * Generic in the session as well as the place, so a matn session gets marks
 * back as a matn session rather than widened to the shell.
 */
export function addMark<P, S extends { marks?: SessionMark<P>[] }>(
  s: S, position: P, now?: number,
): S {
  return { ...s, marks: [...sessionMarks(s), makeMark(position, now)] };
}

/**
 * Drops a mark by id.
 *
 * Marks are removable for the same reason notes are: one landed on the wrong
 * verse is worse than none, and nothing about what was recited depends on it.
 */
export function removeMark<P, S extends { marks?: SessionMark<P>[] }>(s: S, id: string): S {
  return { ...s, marks: sessionMarks(s).filter(m => m.id !== id) };
}

/**
 * Moves the marker without crediting anything.
 *
 * Position and progress are deliberately separate: following the student
 * through the mushaf is constant and must stay free, while "this much is
 * recited" is a claim the teacher makes once per unit. Page-turning therefore
 * keeps note positions sharp without inflating the percentage.
 */
export function moveTo(s: RecitationSession, position: AyahPosition): RecitationSession {
  return { ...s, current: position };
}

/**
 * Switches the book the majlis is being read from.
 *
 * Only the marker is re-expressed — notes already taken keep the edition and
 * the numbers they were taken in, because those are what happened. Rewriting
 * them would be inventing a record the teacher never saw.
 */
export function switchEdition(s: RecitationSession, current: AyahPosition): RecitationSession {
  return {
    ...s,
    current,
    mushafId: current.mushafId,
    riwayaId: current.riwayaId,
    ayahCounting: current.ayahCounting,
  };
}

/**
 * Credits the stretch between the last confirmed ayah and where the student
 * actually stopped — run when the majlis ends.
 *
 * Without it, a session that stops in the middle of a surah reports nothing for
 * that surah, because the teacher never got to press "finished". Bounded to the
 * current surah so an earlier jump elsewhere cannot credit hundreds of ayahs.
 */
export function creditToPosition(s: RecitationSession, index: QuranIndex): RecitationSession {
  const cur = s.current.anchor.id;
  if (isCovered(s.covered, cur)) return s;
  const surah = index.locOf(cur)?.surah;
  const range = surah ? index.surahRanges[surah - 1] : undefined;
  if (!range) return s;
  let from = Math.max(range.firstId, Math.min(s.goal.start.anchor.id, cur));
  for (const [, b] of s.covered) {
    if (b >= from && b < cur) from = b + 1;
  }
  return from <= cur ? coverSpan(s, from, cur) : s;
}

/**
 * Credits the surah just recited and carries the majlis on to the next.
 *
 * Progress, not an ending: the majlis stays open, and the teacher closes it
 * when they are done. `sessionSurah` moves on with the marker, so the next
 * surah gets its own offer to finish when its closing page opens — a majlis
 * that runs through three surahs is credited three times.
 */
export function completeSurah(
  s: RecitationSession, from: number, to: number, next: AyahPosition | null,
): RecitationSession {
  const credited = coverSpan(s, Math.min(from, to), to);
  if (!next) return credited;
  return { ...credited, current: next, sessionSurah: next.surah };
}

/**
 * Prepares a session read back from storage after a crash, a reload or a
 * service-worker update.
 *
 * The segment the reload left open is closed at the last write rather than at
 * "now", so the hours the app was gone are not billed to the student. The
 * result must be persisted immediately — otherwise the next reload reads the
 * same open segment and leaks that time anyway.
 */
export function restoreAfterReload(s: RecitationSession, fallbackNow: number = Date.now()): RecitationSession {
  return { ...s, status: 'paused', segments: closeSegment(s, s.lastSeenAt ?? fallbackNow) };
}

/**
 * Marks an explicit span as recited (used by the "next page" button).
 *
 * `from` and `to` are anchor ids: this is the measurement side.
 */
export function coverSpan(s: RecitationSession, from: number, to: number): RecitationSession {
  return { ...s, covered: mergeRange(s.covered, from, to) };
}
