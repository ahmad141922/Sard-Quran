/**
 * Reading what a link from outside the tool asked for, before anything else.
 *
 * A link opens the tool in four ways it has to notice at boot: an invitation
 * to join (`#/join/CODE`), the way back from Google, a confirmation or a
 * password link from an email, and one of those links gone stale. All four
 * arrive in the fragment, and all four want the account screen open.
 *
 * Kept apart from `teacher-auth.ts` so the home screen can ask this without
 * loading the Supabase client — most visits have no link at all, and the
 * client is the heaviest thing the account screen brings.
 */

/** Set before leaving for Google, so the tool reopens on the account screen. */
export const RETURNING_KEY = 'sard:auth-returning';

/** The address Google sends the app back to; declared in the manifest and Info.plist. */
export const NATIVE_CALLBACK = 'com.tajweedoo.sard://auth';

export type Arrival =
  | { kind: 'join'; code: string }
  | { kind: 'signed-in' }
  | { kind: 'recovery' }
  | { kind: 'expired' }
  | null;

/** What the fragment the tool was opened with is asking for, if anything. */
export function arrivalFrom(hash: string, returningFromGoogle = false): Arrival {
  const join = hash.match(/^#\/join\/([A-Za-z0-9-]{4,16})\/?$/);
  if (join) return { kind: 'join', code: join[1] };
  const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
  if (params.get('error') || params.get('error_code')) return { kind: 'expired' };
  if (params.get('access_token')) {
    return params.get('type') === 'recovery' ? { kind: 'recovery' } : { kind: 'signed-in' };
  }
  return returningFromGoogle ? { kind: 'signed-in' } : null;
}

/** Whether we just came back from Google — asked once, then forgotten. */
export function takeReturning(): boolean {
  try {
    const was = sessionStorage.getItem(RETURNING_KEY) === '1';
    sessionStorage.removeItem(RETURNING_KEY);
    return was;
  } catch {
    return false;
  }
}
