/**
 * Signing in as a muqri', and letting a student's device attach itself.
 *
 * ## Two identities, and only one of them is a person
 *
 * A **teacher** signs in with their email and a code sent to it. There is no
 * password anywhere in this file, on purpose: a password is a thing we would be
 * asking people to invent, store and recover, and the only reason to want one
 * here is habit. A six-digit code to an inbox is fewer moving parts and no
 * secret of ours to lose.
 *
 * A **student's device** signs in anonymously. It gets an identity so the
 * database can tell it apart from every other device — which is what the row
 * policies are written against — without anybody handing over a name, an email
 * or a birthday. Most reciters here are children; the less we hold, the less
 * there is to hold wrongly.
 *
 * ## Everything degrades to local-only
 *
 * The tool's whole point is a majlis that works with no network and no account.
 * So every call here returns a result rather than throwing, and a failure means
 * the app carries on exactly as it did before any of this existed.
 */

import { sardSupabase } from './sard-supabase';
import { normaliseCode } from './join-code';

export type AuthResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: 'offline' | 'bad-input' | 'rejected' | 'unknown'; detail?: string };

/**
 * Why a call failed, or null where it did not.
 *
 * A plain `if (!r.ok)` ought to narrow the union, and under this project's
 * loose `strict` setting it does not reliably — so the question is asked with
 * `in`, which does. One accessor beats a cast at every call site.
 */
export function reasonOf(
  result: AuthResult<unknown>,
): 'offline' | 'bad-input' | 'rejected' | 'unknown' | null {
  return 'reason' in result ? result.reason : null;
}

const fail = (reason: 'offline' | 'bad-input' | 'rejected' | 'unknown', detail?: string) =>
  ({ ok: false as const, reason, detail });

/**
 * Whether a string could be an email address.
 *
 * Deliberately loose. The address is checked by whether the code arrives, which
 * is the only check that means anything; a stricter pattern here would only
 * ever be wrong about somebody's real address.
 */
export function looksLikeEmail(text: string): boolean {
  const t = text.trim();
  return t.length >= 5 && t.length <= 320 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(t);
}

/** Asks for a code to be sent. */
export async function requestSignInCode(email: string): Promise<AuthResult> {
  const to = email.trim().toLowerCase();
  if (!looksLikeEmail(to)) return fail('bad-input');
  try {
    const { error } = await sardSupabase.auth.signInWithOtp({
      email: to,
      // A teacher signing in for the first time is a teacher, not an error.
      options: { shouldCreateUser: true },
    });
    if (error) return fail('rejected', error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

/** Exchanges the emailed code for a session. */
export async function confirmSignInCode(email: string, code: string): Promise<AuthResult> {
  const to = email.trim().toLowerCase();
  const token = code.replace(/\D/g, '');
  if (!looksLikeEmail(to) || token.length < 6) return fail('bad-input');
  try {
    const { error } = await sardSupabase.auth.verifyOtp({ email: to, token, type: 'email' });
    if (error) return fail('rejected', error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

export async function signOut(): Promise<void> {
  try { await sardSupabase.auth.signOut(); } catch { /* already gone is the same outcome */ }
}

/** The signed-in user's id, or null. Null is the ordinary case, not an error. */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await sardSupabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Who is signed in, and whether they are a person or a device.
 *
 * Both kinds sign in: a teacher with an emailed code, and a student's phone
 * anonymously when it joins a roster. So «is somebody signed in» is not the
 * same question as «is a teacher signed in», and treating it as one sends a
 * student's phone to an empty teacher's roster as if it were theirs.
 */
export async function currentIdentity(): Promise<{ id: string; anonymous: boolean } | null> {
  try {
    const { data } = await sardSupabase.auth.getUser();
    const user = data?.user;
    if (!user) return null;
    return { id: user.id, anonymous: (user as { is_anonymous?: boolean }).is_anonymous === true };
  } catch {
    return null;
  }
}

/**
 * Makes sure the signed-in user has a teacher row, and returns their name.
 *
 * Called after every sign-in rather than only after the first: the row can be
 * missing because this is a new account, or because a migration ran, or because
 * somebody deleted it. All three want the same repair.
 */
export async function ensureTeacher(name: string): Promise<AuthResult<{ id: string; name: string }>> {
  const id = await currentUserId();
  if (!id) return fail('rejected', 'not signed in');
  try {
    const { data, error } = await sardSupabase
      .from('sard_teachers')
      .upsert({ id, name: name.trim() }, { onConflict: 'id' })
      .select('id, name')
      .single();
    if (error) return fail('rejected', error.message);
    return { ok: true, value: { id: data.id as string, name: (data.name as string) ?? '' } };
  } catch {
    return fail('offline');
  }
}

export interface Enrolment {
  studentId: string;
  studentName: string;
  teacherId: string;
}

/**
 * Puts this device on a teacher's roster.
 *
 * Two steps that have to happen in this order: the device needs an identity
 * before the database will let it claim anything, so it signs in anonymously
 * first and redeems second. Redeeming goes through a database function rather
 * than a table policy — finding a code by its value would mean being allowed to
 * read rows that are not yours yet, which is the one thing the roster must not
 * permit.
 */
export async function joinRoster(typedCode: string): Promise<AuthResult<Enrolment>> {
  const code = normaliseCode(typedCode);
  if (!code) return fail('bad-input');
  try {
    if (!(await currentUserId())) {
      const { error } = await sardSupabase.auth.signInAnonymously();
      if (error) return fail('rejected', error.message);
    }
    const { data, error } = await sardSupabase.rpc('sard_redeem_join_code', { code });
    if (error) return fail('rejected', error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return fail('rejected');
    return {
      ok: true,
      value: {
        studentId: row.student_id as string,
        studentName: row.student_name as string,
        teacherId: row.teacher_id as string,
      },
    };
  } catch {
    return fail('offline');
  }
}
