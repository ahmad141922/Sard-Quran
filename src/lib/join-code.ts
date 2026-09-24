/**
 * The code a teacher reads out so a student's device can join their roster.
 *
 * ## Why a code at all, rather than a link
 *
 * A link has to reach the student's phone, which means a message, which means
 * having their number — and the people this is for are children in a halaqa
 * sitting in front of the teacher. A code is said out loud once and typed in.
 * It also fails safe in a way a link does not: it is spent on use and it
 * expires, so a code overheard on Tuesday is worthless on Wednesday.
 *
 * ## Why this alphabet
 *
 * It is **spoken**, in a room, often to a child, and then typed on a phone
 * keyboard. So the letters that are heard or seen as each other are not in it,
 * and — just as important — each one that is left out has somewhere to fold to
 * when somebody types it anyway.
 *
 * Nothing here is a secret worth attacking — the code buys you a place on one
 * teacher's roster for a few minutes, and the server refuses an expired or
 * spent one. It is short because it is spoken, and short-lived because it is
 * overheard.
 */

/**
 * Crockford's base-32 alphabet: the ten digits, and the letters without
 * I, L, O and U.
 *
 * Chosen rather than invented because it comes with the mapping as well as the
 * set — I and L are heard as one, O as zero, and U is dropped so that no word
 * spelled by accident is one anybody minds reading out. Every excluded letter
 * has somewhere in the alphabet to go, which is the part a hand-rolled set gets
 * wrong: excluding both halves of a confusable pair turns a mishearing into a
 * dropped character and a code that simply fails.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** What a mis-heard or mis-typed character was meant to be. */
const FOLD: Record<string, string> = { I: '1', L: '1', O: '0', U: 'V' };

export const CODE_LENGTH = 6;

/** How long a code stays usable. Long enough to type, short enough to forget. */
export const CODE_LIFETIME_MS = 30 * 60_000;

/**
 * A fresh code, from the platform's own randomness.
 *
 * `crypto` rather than `Math.random` — not because this is a secret, but
 * because `Math.random` is allowed to repeat itself across two devices seeded
 * alike, and two students holding the same code is a confusing bug to be
 * standing in a halaqa trying to diagnose.
 */
export function newJoinCode(length = CODE_LENGTH): string {
  const out: string[] = [];
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) out.push(ALPHABET[bytes[i] % ALPHABET.length]);
  return out.join('');
}

/**
 * What somebody typed, turned into what the server is holding.
 *
 * Generous on the way in: spaces and dashes are how people write a code down,
 * lower case is what a phone keyboard offers first, and the characters that
 * are not in the alphabet are exactly the ones somebody would substitute by
 * mishearing — so O becomes 0's absent twin's neighbour rather than failing.
 * Null where nothing usable is left, so a caller never sends a half-code.
 */
export function normaliseCode(typed: string): string | null {
  const kept: string[] = [];
  for (const ch of typed.toUpperCase()) {
    const folded = FOLD[ch] ?? ch;
    // Spaces, dashes and anything else somebody wrote it down with are simply
    // not letters of the code, so they fall out here rather than being rejected.
    if (ALPHABET.includes(folded)) kept.push(folded);
  }
  return kept.length === CODE_LENGTH ? kept.join('') : null;
}

/** Whether a code issued at `issuedAt` is still usable. */
export function codeIsLive(issuedAt: number, now: number = Date.now()): boolean {
  return now >= issuedAt && now - issuedAt < CODE_LIFETIME_MS;
}

/** When a code issued now stops working — what the row's expiry column holds. */
export function codeExpiry(now: number = Date.now()): Date {
  return new Date(now + CODE_LIFETIME_MS);
}

/** Grouped for reading aloud: «TWX — 47K», not «TWX47K». */
export function spokenForm(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
