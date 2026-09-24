/**
 * What the first run settled, and the fact that it ran at all.
 *
 * ## Why any of this is stored rather than asked again
 *
 * The wizard exists to spare somebody the empty setup form on their very first
 * majlis. If it could not remember that it had already run it would become the
 * opposite — a screen between a reciter and the muṣḥaf, every single launch —
 * so the flag is the load-bearing part of this file and the answers are the
 * bonus. `finishWizard()` writes the flag whether or not a single question was
 * answered, and there is deliberately no way to unset it from the interface:
 * a first run happens once.
 *
 * In localStorage, like `standing-goal.ts` and the place tags and for the same
 * reason: it is four small values, it belongs to this device, and nothing may
 * ever wait on it. Every read is guarded and every failure reads as "no
 * answers" rather than throwing — a private window must not be able to stop a
 * majlis from starting.
 *
 * ## Why the riwaya is not in here
 *
 * It already has a home. `MushafProvider` keeps the chosen edition under
 * `tajweedoo:mushaf-id` and the whole tool reads it from there, so the wizard
 * writes the riwaya *through the provider* rather than keeping a second copy
 * that could disagree with it. The rule this file follows is: an answer that
 * some existing part of the app already stores is handed to that part, and
 * only what has nowhere else to live is kept here.
 *
 * The operator's side of the majlis follows the same rule — see
 * `rememberOperatorRole` — which is why `stance` is written twice on purpose.
 *
 * ## Why the *mode* is not handed on the same way
 *
 * `RecitationSetupModal` deliberately does not remember whether the last
 * majlis was heard or solo: a memoriser who reviews alone on weeknights and
 * recites to a shaykh on Friday must find the majlis waiting, because that is
 * the one that issues a certificate and the one that must never be started by
 * accident in the wrong mode. The wizard is a first impression, not a standing
 * preference, so it records the answer here for whoever wants it and does not
 * override that decision.
 */

/**
 * Where the person stands in a majlis, as one question rather than two.
 *
 * `solo` and `reciter` are the same *person* — the one doing the reciting —
 * and differ only in whether anyone is listening; `listener` is the muqri'
 * holding the device for a halaqa. Asking it once and deriving both the mode
 * and the operator's side from the answer is the difference between one screen
 * and two.
 */
export type WizardStance = 'solo' | 'reciter' | 'listener';

/** Which side of the majlis holds the device — the setup form's own word. */
export type OperatorRole = 'reciter' | 'listener';

export interface WizardAnswers {
  /** The reciter, as it should read on a report. */
  name: string;
  stance: WizardStance;
  /** Surah the first majlis opens at, 1..114. */
  startSurah: number;
}

const KEY = 'tajweedoo:wizard';

/**
 * The setup form's own key. Read, and merged into, rather than replaced: a
 * device that has run a majlis before already has a number in here, and the
 * wizard has no business dropping it.
 */
const CONTACT_KEY = 'tajweedoo:contact';

/** `MushafProvider`'s key. Read only, and only as evidence of a previous visit. */
const MUSHAF_KEY = 'tajweedoo:mushaf-id';

const SURAH_COUNT = 114;

const STANCES: WizardStance[] = ['solo', 'reciter', 'listener'];

interface StoredWizard {
  /** Shape revision. A stored record from a future build reads as no answers. */
  v: 1;
  /** Always true when the record exists; it is written the moment the wizard ends. */
  done: true;
  at: number;
  name?: string;
  stance?: WizardStance;
  startSurah?: number;
}

function read(): StoredWizard | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWizard>;
    if (parsed?.done !== true || parsed.v !== 1) return null;
    return parsed as StoredWizard;
  } catch {
    // Malformed, or a storage that refuses to be read. Either way the only
    // safe reading is "nothing is known", which the callers below already
    // handle — and `wizardDone()` is the one exception, for the reason it
    // states.
    return null;
  }
}

/**
 * Whether the wizard has already had its turn.
 *
 * A record that cannot be parsed still counts as done. That looks wrong until
 * you ask what the alternative is: showing the first-run wizard again to
 * somebody whose storage is merely damaged. Nothing is lost by not asking, and
 * a repeating wizard is the failure this whole file exists to prevent.
 */
export function wizardDone(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    // Storage is unreachable — a locked-down WebView, or a private window with
    // quota zero. Nothing can be remembered here, so nothing may be shown
    // either, or it would be shown at every launch forever.
    return true;
  }
}

/**
 * Evidence this device has been used before the wizard ever existed.
 *
 * The flag alone would greet every returning reciter with a first-run screen
 * the day this ships, which is exactly the interruption it is meant to avoid.
 * Both keys are written only by a deliberate act — picking a riwaya, or
 * finishing a majlis with a contact — so either one means somebody has already
 * done here what the wizard would have asked them.
 *
 * Deliberately synchronous, and deliberately not the session store: reading
 * IndexedDB would make this a promise, and a wizard that appears a beat after
 * the home screen has already settled is worse than one that never appears.
 */
function usedBefore(): boolean {
  try {
    return localStorage.getItem(MUSHAF_KEY) !== null || localStorage.getItem(CONTACT_KEY) !== null;
  } catch {
    return true;
  }
}

/** Whether to put the wizard on screen at all. Asked once, at mount. */
export function shouldOfferWizard(): boolean {
  return !wizardDone() && !usedBefore();
}

/**
 * The answers, or null where none are usable.
 *
 * Null is the resting state and not a fault: it is what a skipped wizard
 * leaves behind, and every caller has a sensible default already — the setup
 * form asked for all of this before the wizard existed and still does.
 *
 * Each field is validated on its own, so one bad value does not throw away the
 * other two.
 */
export function wizardProfile(): Partial<WizardAnswers> | null {
  const stored = read();
  if (!stored) return null;
  const profile: Partial<WizardAnswers> = {};
  const name = typeof stored.name === 'string' ? stored.name.trim() : '';
  if (name) profile.name = name;
  if (stored.stance && STANCES.includes(stored.stance)) profile.stance = stored.stance;
  const surah = Number(stored.startSurah);
  if (Number.isInteger(surah) && surah >= 1 && surah <= SURAH_COUNT) profile.startSurah = surah;
  return profile;
}

/** Who is holding the device, given where they said they stand. */
export function roleOfStance(stance: WizardStance): OperatorRole {
  // Reciting alone, the reciter is the only person there — and is therefore
  // also the one holding the phone.
  return stance === 'listener' ? 'listener' : 'reciter';
}

/**
 * Hands the operator's side to the setup form, in the form's own key.
 *
 * Merged, never replaced: that record also carries a WhatsApp number, and
 * this is the one thing in it the wizard knows anything about.
 */
export function rememberOperatorRole(role: OperatorRole): void {
  // Read in its own guard, so a damaged record is replaced rather than left
  // standing: what cannot be parsed carries nothing worth preserving, and the
  // form reads it as empty either way.
  let saved: { whatsapp?: unknown; countryCode?: unknown } | null = null;
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  try {
    localStorage.setItem(CONTACT_KEY, JSON.stringify({
      whatsapp: typeof saved?.whatsapp === 'string' ? saved.whatsapp : '',
      countryCode: typeof saved?.countryCode === 'string' ? saved.countryCode : '',
      role,
    }));
  } catch {
    // Asked again at the first majlis, which is what happened before the
    // wizard existed. Nothing here is worth failing a launch over.
  }
}

/**
 * The wizard is over, however it ended.
 *
 * One function for finishing and for dismissing, because they differ only in
 * how much was answered — and closing a wizard halfway through must keep what
 * was already said rather than punish somebody for leaving early. An answer
 * that was skipped is simply absent, and absent means "the app decides", which
 * is what it did before any of this existed.
 */
export function finishWizard(answers: Partial<WizardAnswers> = {}): void {
  const record: StoredWizard = { v: 1, done: true, at: Date.now() };
  const name = answers.name?.trim();
  if (name) record.name = name;
  if (answers.stance && STANCES.includes(answers.stance)) record.stance = answers.stance;
  const surah = Number(answers.startSurah);
  if (Number.isInteger(surah) && surah >= 1 && surah <= SURAH_COUNT) record.startSurah = surah;

  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage refused. The wizard closes anyway — this launch is not held
    // hostage to it — and it will offer itself once more on the next one,
    // which is the mildest possible way for this to fail.
  }

  if (record.stance) rememberOperatorRole(roleOfStance(record.stance));
}
