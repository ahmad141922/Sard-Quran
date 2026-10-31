/**
 * Signing in as a muqri', and letting a participant's device attach itself.
 *
 * ## Two ways in, both of them ones people already know
 *
 * A **teacher** signs in with Google, or with an email and a password. Those
 * two and nothing else, because a sign-in screen is judged in the second it is
 * seen: a familiar button reads as a door, and anything unfamiliar reads as a
 * trap. A password account confirms its address once, by a link in an email,
 * before it can be used.
 *
 * Accounts made before this — when the way in was a six-digit code to an inbox
 * — are the same rows under the same ids. They have no password yet, so their
 * owners set one through «forgot your password»; or they press Google, which
 * Supabase links to the existing account when the address matches. Either way
 * the participants and the sessions stay where they were, because nothing
 * here creates a second account for an address that already has one.
 *
 * A **participant's device** signs in anonymously. It gets an identity so the
 * database can tell it apart from every other device — which is what the row
 * policies are written against — without anybody handing over a name, an email
 * or a birthday. Most reciters here are children; the less we hold, the less
 * there is to hold wrongly.
 *
 * ## Everything degrades to local-only
 *
 * The tool's whole point is a majlis that works with no network and no account.
 * So every call here returns a result rather than throwing, and a failure means
 * the app carries on exactly as it did before any of this existed. Signing in
 * or out never touches what is stored on the device.
 */

import { sardSupabase } from './sard-supabase';
import { normaliseCode } from './join-code';
import { isNative } from './native';
import { NATIVE_CALLBACK, RETURNING_KEY } from './auth-return';

export type FailReason =
  | 'offline' | 'bad-input' | 'rejected' | 'unknown'
  /** Right password, but the address has not been confirmed from its email yet. */
  | 'unconfirmed'
  /** No such account, or the wrong password — the server will not say which. */
  | 'wrong-password'
  /** Too short or too common for the server to accept. */
  | 'weak-password';

export type AuthResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: FailReason; detail?: string };

/**
 * Why a call failed, or null where it did not.
 *
 * A plain `if (!r.ok)` ought to narrow the union, and under this project's
 * loose `strict` setting it does not reliably — so the question is asked with
 * `in`, which does. One accessor beats a cast at every call site.
 */
export function reasonOf(result: AuthResult<unknown>): FailReason | null {
  return 'reason' in result ? result.reason : null;
}

const fail = (reason: FailReason, detail?: string) =>
  ({ ok: false as const, reason, detail });

/** The shortest password the form accepts; the server's own floor is lower. */
export const MIN_PASSWORD = 8;

/**
 * Whether a string could be an email address.
 *
 * Deliberately loose. The address is checked by whether the confirmation
 * arrives, which is the only check that means anything; a stricter pattern here
 * would only ever be wrong about somebody's real address.
 */
export function looksLikeEmail(text: string): boolean {
  const t = text.trim();
  return t.length >= 5 && t.length <= 320 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(t);
}

const clean = (email: string) => email.trim().toLowerCase();

/** The public address of the tool, where every emailed link lands. */
export const PUBLIC_APP_URL = 'https://sard.tajweedoo.com/app/';

/**
 * Where a link from an email, or the way back from Google, should land.
 *
 * In a browser, the page it came from — so a local build returns to itself. In
 * the app there is no address a browser can open, so the public one: a
 * confirmation link is opened from a mail client, and confirming on the web is
 * still confirming.
 */
export function returnUrl(): string {
  if (isNative() || typeof window === 'undefined') return PUBLIC_APP_URL;
  return `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;
}

const mark = () => { try { sessionStorage.setItem(RETURNING_KEY, '1'); } catch { /* private mode */ } };

/** The link a participant opens to join; `SardApp` reads it back at boot. */
export const joinLink = (code: string) => `${returnUrl()}#/join/${code}`;

/** Sends the browser — or, in the app, the system browser — to Google. */
export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    if (isNative()) {
      // Google refuses to sign in inside an embedded web view, so the app hands
      // the page to the system browser, and `handleAuthCallback` takes the
      // session back from the link Google returns to.
      const { data, error } = await sardSupabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: NATIVE_CALLBACK, skipBrowserRedirect: true },
      });
      if (error || !data?.url) return fail('rejected', error?.message);
      window.location.href = data.url;
      return { ok: true, value: undefined };
    }
    mark();
    const { error } = await sardSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl() },
    });
    if (error) return fail('rejected', error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

/**
 * Takes the session out of the link Google returned the app to.
 *
 * True when the link was ours and a session came out of it.
 */
export async function handleAuthCallback(url: string): Promise<boolean> {
  if (!url.startsWith(NATIVE_CALLBACK)) return false;
  const params = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '');
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return false;
  try {
    const { error } = await sardSupabase.auth.setSession({ access_token, refresh_token });
    return !error;
  } catch {
    return false;
  }
}

function classify(message: string | undefined): FailReason {
  const m = (message ?? '').toLowerCase();
  if (m.includes('not confirmed')) return 'unconfirmed';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'wrong-password';
  if (m.includes('password')) return 'weak-password';
  return 'rejected';
}

/** Signs in with an email and a password. */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const to = clean(email);
  if (!looksLikeEmail(to) || !password) return fail('bad-input');
  try {
    const { error } = await sardSupabase.auth.signInWithPassword({ email: to, password });
    if (error) return fail(classify(error.message), error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

/**
 * Makes a password account.
 *
 * `confirm`: an email is on its way and the account works once it is opened.
 * `signed-in`: the project does not ask for confirmation, and this is a session.
 * `exists`: the address already has an account — from Google, or from the days
 * of emailed codes. Supabase answers that without an error, so as not to tell
 * a stranger which addresses are registered; it is told apart by the account
 * coming back with no identities, and the owner is pointed at «forgot your
 * password» rather than at a second account.
 */
export async function signUpWithPassword(
  email: string, password: string, name: string,
): Promise<AuthResult<'confirm' | 'signed-in' | 'exists'>> {
  const to = clean(email);
  if (!looksLikeEmail(to)) return fail('bad-input');
  if (password.length < MIN_PASSWORD) return fail('weak-password');
  try {
    const { data, error } = await sardSupabase.auth.signUp({
      email: to,
      password,
      options: { emailRedirectTo: returnUrl(), data: { name: name.trim() } },
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('already registered') || m.includes('already exists')) return { ok: true, value: 'exists' };
      return fail(classify(error.message), error.message);
    }
    if (data.user && (data.user.identities?.length ?? 0) === 0) return { ok: true, value: 'exists' };
    return { ok: true, value: data.session ? 'signed-in' : 'confirm' };
  } catch {
    return fail('offline');
  }
}

/** Sends the confirmation email again. */
export async function resendConfirmation(email: string): Promise<AuthResult> {
  const to = clean(email);
  if (!looksLikeEmail(to)) return fail('bad-input');
  try {
    const { error } = await sardSupabase.auth.resend({
      type: 'signup', email: to, options: { emailRedirectTo: returnUrl() },
    });
    if (error) return fail('rejected', error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

/**
 * Emails a link for choosing a new password — which is also how an account
 * from the days of emailed codes gets its first one.
 */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const to = clean(email);
  if (!looksLikeEmail(to)) return fail('bad-input');
  try {
    const { error } = await sardSupabase.auth.resetPasswordForEmail(to, { redirectTo: returnUrl() });
    if (error) return fail('rejected', error.message);
    return { ok: true, value: undefined };
  } catch {
    return fail('offline');
  }
}

/** Sets the password of whoever is signed in — after following a reset link. */
export async function setNewPassword(password: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD) return fail('weak-password');
  try {
    const { error } = await sardSupabase.auth.updateUser({ password });
    if (error) return fail(classify(error.message), error.message);
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
 * Both kinds sign in: a teacher with Google or a password, and a participant's phone
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

/**
 * Makes sure a teacher row exists, without renaming one that does.
 *
 * For the ways in that carry no name field of ours — Google, a confirmation
 * link, an account from before — the name comes from what the account already
 * says about itself.
 */
export async function ensureTeacherRow(): Promise<void> {
  try {
    const { data } = await sardSupabase.auth.getUser();
    const user = data?.user;
    if (!user || (user as { is_anonymous?: boolean }).is_anonymous) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = String(meta.name ?? meta.full_name ?? '').trim();
    await sardSupabase
      .from('sard_teachers')
      .upsert({ id: user.id, name }, { onConflict: 'id', ignoreDuplicates: true });
  } catch { /* the next visit repairs it */ }
}

/**
 * The signed-in teacher's name, for the setup form — or null for nobody, or
 * for a participant's anonymous phone, which has no name of its own here.
 */
export async function accountName(): Promise<string | null> {
  try {
    const { data } = await sardSupabase.auth.getUser();
    const user = data?.user;
    if (!user || (user as { is_anonymous?: boolean }).is_anonymous) return null;
    const { data: row } = await sardSupabase
      .from('sard_teachers').select('name').eq('id', user.id).maybeSingle();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = String(row?.name || meta.name || meta.full_name || '').trim();
    return name || null;
  } catch {
    return null;
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
