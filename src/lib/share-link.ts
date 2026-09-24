/**
 * Sharing a report by link, without accounts and without the server ever
 * being able to read it.
 *
 * The landing page promises «بدون حساب · يعمل دون اتصال», and accounts would
 * break that promise for everyone in order to serve one case: a teacher who
 * wants a student to see the report afterwards. This does that case instead —
 * and ends up **more** private than accounts would have been.
 *
 * How it works, and why each part is where it is:
 *
 * 1. The report is encrypted **in the browser** with a key generated there.
 * 2. Only the ciphertext is uploaded, under a random id nobody can guess.
 * 3. The key travels in the URL's **fragment** — the part after `#`, which
 *    browsers never send to the server. So the host stores bytes it cannot
 *    read, and could not hand over if it were asked to.
 *
 * That third point is the whole design. It is the same reasoning the
 * certificate already uses (`recitation-certificate.ts`): a child's name is
 * the point of the record and nobody's business but the holder's.
 *
 * Nothing here uploads. That is `share-store.ts` — kept apart so this file
 * can be reasoned about, and tested, as pure cryptography.
 */

const ALGO = 'AES-GCM';
const IV_BYTES = 12;

/** Links die on their own; a child's name should not sit on a host forever. */
export const DEFAULT_EXPIRY_DAYS = 30;

export interface SealedReport {
  /** Random, unguessable, and the only thing the server is keyed by. */
  id: string;
  /** Base64url. **Never** sent to the server — it rides in the fragment. */
  key: string;
  /** IV followed by ciphertext, base64url. This is all the host holds. */
  payload: string;
  expiresAt: number;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
};

const randomBytes = (n: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(n));

/**
 * Encrypts a report and returns everything needed to share it.
 *
 * The id is drawn separately from the key on purpose: the id is what the host
 * sees and indexes, the key is what it must never see, and deriving one from
 * the other would hand it both.
 */
export async function sealReport(
  report: unknown, expiryDays = DEFAULT_EXPIRY_DAYS, now = Date.now(),
): Promise<SealedReport> {
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = randomBytes(IV_BYTES);
  const plain = new TextEncoder().encode(JSON.stringify(report));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: ALGO, iv }, key, plain));

  // IV in front of the ciphertext: it is not secret, it must not repeat, and
  // carrying it with the bytes it belongs to is one less thing to lose.
  const payload = new Uint8Array(iv.length + cipher.length);
  payload.set(iv);
  payload.set(cipher, iv.length);

  return {
    id: toBase64Url(randomBytes(16)),
    key: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key))),
    payload: toBase64Url(payload),
    expiresAt: now + expiryDays * 86_400_000,
  };
}

/**
 * Opens a shared report.
 *
 * Returns null for anything that does not decrypt — a truncated link, a
 * mistyped key, a payload that was tampered with (AES-GCM authenticates, so
 * an altered byte fails rather than yielding rubbish). The page then says the
 * link is not readable instead of showing half a report.
 */
export async function openReport(payload: string, keyText: string): Promise<unknown | null> {
  try {
    const bytes = fromBase64Url(payload);
    const key = await crypto.subtle.importKey(
      'raw', fromBase64Url(keyText), { name: ALGO }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: ALGO, iv: bytes.slice(0, IV_BYTES) }, key, bytes.slice(IV_BYTES),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

/** Where a shared report opens. One constant, as for the certificate. */
/**
 * Where a shared report opens.
 *
 * Under `/app/`, because that is where the tool is deployed — the landing page
 * owns the root of the domain, and `/r` there would hand the reader the
 * landing page instead of the report. The `/app/*` rule already in the site's
 * `_redirects` serves this path with the app's own shell.
 *
 * Absolute and hard-coded on purpose: a link made inside the Android shell has
 * an origin of `https://localhost`, and a parent opening that on their own
 * phone would get nothing at all.
 */
export const SHARE_PAGE_URL = 'https://sard.tajweedoo.com/app/r';

/**
 * The link itself.
 *
 * `#id.key` rather than `?id=…&key=…`: a query string is sent to the server,
 * written into its access log and handed to every analytics script on the
 * page. A fragment is none of those things.
 */
export function shareUrl(sealed: Pick<SealedReport, 'id' | 'key'>): string {
  return `${SHARE_PAGE_URL}#${sealed.id}.${sealed.key}`;
}

export function parseShareHash(hash: string): { id: string; key: string } | null {
  const [id, key] = hash.replace(/^#/, '').split('.');
  // Both halves or nothing: an id without a key is a record nobody can read,
  // and asking the host for it would leak that somebody tried.
  return id && key ? { id, key } : null;
}

/** Whether a stored record has outlived its link. */
export function hasExpired(expiresAt: number, now = Date.now()): boolean {
  return now > expiresAt;
}
