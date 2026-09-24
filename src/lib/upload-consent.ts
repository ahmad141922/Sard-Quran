/**
 * What the person has agreed may leave their device.
 *
 * ## Why this is a module and not a checkbox
 *
 * For its whole life this tool uploaded nothing but a summary, and recitation
 * audio never left the phone at all — that was a rule in the code, not a
 * setting. Letting a teacher hear their student's recitation changes it, and
 * the thing that replaces «never» has to be at least as hard to get wrong as
 * «never» was.
 *
 * So permission is a value that every upload path has to be handed, rather than
 * a flag somewhere that call sites are trusted to remember to read. There is
 * one gate — `mayUpload` — and code that does not call it does not upload.
 *
 * ## Three rules that are easy to state and easy to get wrong
 *
 * **Silence is refusal.** Nothing here defaults to true, a missing record is
 * «no», and a record that cannot be parsed is «no». The failure mode of this
 * file must be that something does not get uploaded.
 *
 * **Audio is separate, and it is narrower.** Agreeing that a summary may be
 * mirrored is not agreeing that a recording of your voice may be. And audio
 * without the session it belongs to is a recording of nobody reciting nothing,
 * so audio consent alone uploads nothing.
 *
 * **Changing the question voids the answer.** `CONSENT_VERSION` is bumped
 * whenever what is being asked changes, and a consent recorded against an older
 * wording stops counting. Somebody who agreed to «your teacher may see your
 * progress» has not thereby agreed to whatever the sentence says next year.
 *
 * ## Withdrawal
 *
 * Turning it off stops everything from that moment. It does **not** claim to
 * unsend what was already sent — `revokeConsent` returns what still needs
 * deleting, and deleting it is a separate act that can fail and be retried.
 * A switch that quietly implied erasure would be the dishonest kind.
 */

/**
 * The wording this consent was given against.
 *
 * Bump it when the question changes — not when the interface around it does.
 */
export const CONSENT_VERSION = 1;

export type UploadKind = 'data' | 'audio';

export interface Consent {
  /** The majlis itself: positions, faults, how much was recited. */
  data: boolean;
  /** The recording of the recitation. */
  audio: boolean;
  /** When it was given. Null while nothing has been agreed. */
  at: number | null;
  /** Which wording it was given against; see `CONSENT_VERSION`. */
  version: number;
}

export const NO_CONSENT: Consent = { data: false, audio: false, at: null, version: 0 };

/**
 * The one gate. Everything that would put bytes on a server asks this first.
 *
 * Audio requires the session consent as well as its own: a recording with no
 * majlis to hang it on is not what anybody agreed to send.
 */
export function mayUpload(consent: Consent | null | undefined, kind: UploadKind): boolean {
  if (!consent) return false;
  if (consent.version !== CONSENT_VERSION) return false;
  if (consent.at === null) return false;
  if (!consent.data) return false;
  return kind === 'data' ? true : consent.audio === true;
}

/** Whether the question still needs asking — including because it changed. */
export function needsAsking(consent: Consent | null | undefined): boolean {
  return !consent || consent.at === null || consent.version !== CONSENT_VERSION;
}

/** Records an answer. Refusing is an answer, and is recorded as one. */
export function giveConsent(
  choice: { data: boolean; audio: boolean },
  now: number = Date.now(),
): Consent {
  // Audio alone is not a state the rest of the app should ever have to think
  // about, so it is not a state that can be stored.
  const data = choice.data === true;
  return {
    data,
    audio: data && choice.audio === true,
    at: now,
    version: CONSENT_VERSION,
  };
}

/**
 * Withdraws it, and says what is now owed.
 *
 * The returned flags are what was consented to a moment ago and is not any
 * more — that is, what has probably already been uploaded and should be taken
 * back down. The caller does the deleting; this only stops the sending.
 */
export function revokeConsent(before: Consent | null | undefined): {
  consent: Consent;
  owed: { data: boolean; audio: boolean };
} {
  return {
    consent: { ...NO_CONSENT, at: Date.now(), version: CONSENT_VERSION },
    owed: {
      data: mayUpload(before, 'data'),
      audio: mayUpload(before, 'audio'),
    },
  };
}

const KEY = 'tajweedoo:upload-consent';

/**
 * Read from the device, and read defensively.
 *
 * Anything unexpected — absent, unparseable, the wrong shape, a boolean that
 * is a string — resolves to «nothing agreed». This is the one file where a
 * lenient parse would be a leak.
 */
export function loadConsent(): Consent {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return NO_CONSENT;
    const saved = JSON.parse(raw) as Partial<Consent>;
    if (saved?.data !== true && saved?.data !== false) return NO_CONSENT;
    if (typeof saved.at !== 'number' || !Number.isFinite(saved.at)) return NO_CONSENT;
    if (typeof saved.version !== 'number') return NO_CONSENT;
    return {
      data: saved.data === true,
      audio: saved.data === true && saved.audio === true,
      at: saved.at,
      version: saved.version,
    };
  } catch {
    return NO_CONSENT;
  }
}

export function saveConsent(consent: Consent): void {
  try { localStorage.setItem(KEY, JSON.stringify(consent)); } catch { /* private mode */ }
}

/**
 * What is stamped on an uploaded row, so the copy on the server carries the
 * terms it was sent under rather than pointing at a device nobody can inspect.
 */
export function consentStamp(consent: Consent): { consent: Consent; consent_at: string | null } {
  return {
    consent,
    consent_at: consent.at === null ? null : new Date(consent.at).toISOString(),
  };
}
