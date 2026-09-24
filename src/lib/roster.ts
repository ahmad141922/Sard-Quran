/**
 * The teacher's roster: who they hear, and what those people have recited.
 *
 * ## Why the student is a row and not an account
 *
 * See `teacher-auth.ts`. Here the consequence is that a student has no way to
 * sign in and no way to be looked up by anybody else — they exist only inside
 * one teacher's list, and the only thing that ever points at them from outside
 * is a device that redeemed a code.
 *
 * ## Why every call re-reads who is signed in
 *
 * The teacher's id is never passed in as an argument. If it were, a caller
 * could pass somebody else's — and the row policies would catch it, but only
 * after the intent to ask had already been formed in our own code. Asking the
 * session each time means the question «whose roster?» has exactly one answer
 * and it is never ours to supply.
 */

import { sardSupabase } from './sard-supabase';
import { codeExpiry, newJoinCode, spokenForm } from './join-code';
import { currentIdentity, type AuthResult } from './teacher-auth';

/**
 * The signed-in teacher, or null — and null for a student's phone too.
 *
 * A joined phone is signed in anonymously, so «somebody is signed in» is not
 * enough to act on a roster. Asking whose roster it is has to mean a person.
 */
async function teacherId(): Promise<string | null> {
  const me = await currentIdentity();
  return me && !me.anonymous ? me.id : null;
}

export interface Student {
  id: string;
  name: string;
  /** Set while a code is outstanding and unspent. */
  joinCode: string | null;
  joinExpiresAt: number | null;
  /** Whether a device has attached itself. */
  joined: boolean;
}

const fail = (reason: 'offline' | 'bad-input' | 'rejected' | 'unknown', detail?: string) =>
  ({ ok: false as const, reason, detail });

const toStudent = (r: Record<string, unknown>): Student => ({
  id: r.id as string,
  name: (r.name as string) ?? '',
  joinCode: (r.join_code as string) ?? null,
  joinExpiresAt: r.join_expires_at ? Date.parse(r.join_expires_at as string) : null,
  joined: Boolean(r.device_uid),
});

/** Everybody on the roster, newest first. Archived students are not on it. */
export async function listStudents(): Promise<AuthResult<Student[]>> {
  const teacher = await teacherId();
  if (!teacher) return fail('rejected', 'not signed in');
  try {
    const { data, error } = await sardSupabase
      .from('sard_students')
      .select('id, name, join_code, join_expires_at, device_uid')
      .eq('teacher_id', teacher)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    if (error) return fail('rejected', error.message);
    return { ok: true, value: (data ?? []).map(toStudent) };
  } catch {
    return fail('offline');
  }
}

export async function addStudent(name: string): Promise<AuthResult<Student>> {
  const teacher = await teacherId();
  if (!teacher) return fail('rejected', 'not signed in');
  const clean = name.trim();
  if (!clean) return fail('bad-input');
  try {
    const { data, error } = await sardSupabase
      .from('sard_students')
      .insert({ teacher_id: teacher, name: clean })
      .select('id, name, join_code, join_expires_at, device_uid')
      .single();
    if (error) return fail('rejected', error.message);
    return { ok: true, value: toStudent(data) };
  } catch {
    return fail('offline');
  }
}

/**
 * Issues a code for the teacher to read out, replacing any outstanding one.
 *
 * Replacing rather than reusing: a student who did not manage to type the last
 * one in has an expired code and needs a fresh one, and a student who did has a
 * spent one. Neither case wants the old value back, and keeping it around would
 * mean a code that had been said aloud in a room staying live for longer than
 * anybody remembers saying it.
 */
export async function issueJoinCode(
  studentId: string,
  now: number = Date.now(),
): Promise<AuthResult<{ code: string; spoken: string; expiresAt: number }>> {
  const teacher = await teacherId();
  if (!teacher) return fail('rejected', 'not signed in');
  const code = newJoinCode();
  const expires = codeExpiry(now);
  try {
    const { error } = await sardSupabase
      .from('sard_students')
      .update({ join_code: code, join_expires_at: expires.toISOString() })
      .eq('id', studentId)
      // Belt as well as braces: the policy already refuses somebody else's
      // student, and saying so here means we never form the intent either.
      .eq('teacher_id', teacher);
    if (error) return fail('rejected', error.message);
    return { ok: true, value: { code, spoken: spokenForm(code), expiresAt: expires.getTime() } };
  } catch {
    return fail('offline');
  }
}

/**
 * Takes somebody off the roster without deleting what they recited.
 *
 * Archiving rather than deleting, because a majlis that happened happened. A
 * student who leaves the halaqa should stop appearing on the list; their
 * recitations are still the record of the evenings they were there.
 */
export async function archiveStudent(studentId: string): Promise<AuthResult> {
  const teacher = await teacherId();
  if (!teacher) return fail('rejected', 'not signed in');
  try {
    const { error } = await sardSupabase
      .from('sard_students')
      .update({ archived: true, join_code: null, join_expires_at: null })
      .eq('id', studentId)
      .eq('teacher_id', teacher);
    if (error) return fail('rejected', error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

export interface StudentSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  ayahs: number;
  pages: number;
  notesHesitation: number;
  notesMemory: number;
  notesTajweed: number;
  notesShakl: number;
  /** The whole majlis, so the teacher sees the report the reciter saw. */
  session: unknown;
}

/** What one student has recited, newest first. */
export async function sessionsOfStudent(
  studentId: string,
  limit = 50,
): Promise<AuthResult<StudentSession[]>> {
  const teacher = await teacherId();
  if (!teacher) return fail('rejected', 'not signed in');
  try {
    const { data, error } = await sardSupabase
      .from('recitation_sessions')
      .select('id, started_at, ended_at, ayahs, pages, notes_hesitation, notes_memory, notes_tajweed, notes_shakl, session')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) return fail('rejected', error.message);
    return {
      ok: true,
      value: (data ?? []).map(r => ({
        id: r.id as string,
        startedAt: Date.parse(r.started_at as string),
        endedAt: r.ended_at ? Date.parse(r.ended_at as string) : null,
        ayahs: (r.ayahs as number) ?? 0,
        pages: (r.pages as number) ?? 0,
        notesHesitation: (r.notes_hesitation as number) ?? 0,
        notesMemory: (r.notes_memory as number) ?? 0,
        notesTajweed: (r.notes_tajweed as number) ?? 0,
        notesShakl: (r.notes_shakl as number) ?? 0,
        session: r.session,
      })),
    };
  } catch {
    return fail('offline');
  }
}
