/**
 * Which halaqa roster this device is on, if any — and whose recitation a
 * session is, for the teacher's list.
 *
 * ## Two ways a halaqa records
 *
 * A halaqa is one muqri' and a roster of reciters, and it records in one of two
 * ways. Either the **teacher's phone** runs the majlis, one student after
 * another, and the teacher picks who is reciting from the roster — that choice
 * is stored on the session as `rosterStudentId`. Or a student's **own phone**,
 * having joined the roster with a code, runs it — and then every majlis on that
 * phone is that student's, which is what the enrolment below records.
 *
 * Without one or the other a session reaches the server attached to nobody,
 * and the teacher's view of that student stays empty however much they recite:
 * the roster and the recitations are two islands.
 *
 * ## What the device claims, and what it does not
 *
 * The device says only *which student*. It never says which teacher, and it
 * never says which device it is — the database works out the first from the
 * roster and takes the second from whoever is signed in, and refuses the row if
 * this device has no business recording for that student. A client that could
 * name its own teacher could name somebody else's.
 */

import type { Enrolment } from './teacher-auth';
import type { RecitationSession } from './recitation-session';

export interface StoredEnrolment extends Enrolment {
  joinedAt: number;
}

const KEY = 'tajweedoo:enrolment';

/**
 * Read defensively: anything unexpected is «not on a roster».
 *
 * The failure this avoids is attributing somebody's recitation to the wrong
 * student, so a record that cannot be read in full is not read at all.
 */
export function loadEnrolment(): StoredEnrolment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as Partial<StoredEnrolment>;
    if (typeof e?.studentId !== 'string' || !e.studentId) return null;
    if (typeof e.teacherId !== 'string' || !e.teacherId) return null;
    if (typeof e.joinedAt !== 'number' || !Number.isFinite(e.joinedAt)) return null;
    return {
      studentId: e.studentId,
      teacherId: e.teacherId,
      studentName: typeof e.studentName === 'string' ? e.studentName : '',
      joinedAt: e.joinedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Records a successful join. One roster per device: a second join replaces the
 * first, the same rule the database applies when a student's code is redeemed
 * on a new phone.
 */
export function saveEnrolment(e: Enrolment, now: number = Date.now()): StoredEnrolment {
  const stored: StoredEnrolment = { ...e, joinedAt: now };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* private mode */ }
  return stored;
}

export function clearEnrolment(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/**
 * The roster student a session belongs to, or null for nobody's.
 *
 * The session's own choice wins: a teacher's phone that picked a student from
 * the roster means that student, even if the phone has also joined a roster
 * itself. Otherwise the phone's own enrolment decides.
 */
export function studentIdFor(
  session: Pick<RecitationSession, 'rosterStudentId'>,
  enrolment: Pick<StoredEnrolment, 'studentId'> | null,
): string | null {
  return session.rosterStudentId ?? enrolment?.studentId ?? null;
}
