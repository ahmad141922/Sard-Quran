// Persistence for recitation sessions.
//
// A session can run for two and a half hours on a classroom tablet. Screen
// sleep, a service-worker update or a low-memory reload must not cost the
// teacher the whole majlis, so state is written through to IndexedDB
// continuously and the active session id is kept in localStorage for an
// instant restore on boot.

import { idbRequest, idbGetAll } from './board-storage';
import { deleteClipsOfSession } from './audio-store';
import { upgradeSession, upgradeSessions } from './recitation-migrate';
import type { RecitationSession } from './recitation-session';
import { isMatnSession, type MatnSession } from './matn/session';

const STORE = 'recitation_sessions';
const ACTIVE_KEY = 'tajweedoo:active-recitation';

/**
 * Both kinds of session share this store, and that is deliberate.
 *
 * IndexedDB has no schema, so a matn session stores as it is; and adding a
 * second object store would mean a database version bump on every installed
 * device to buy nothing. They are kept apart on the way *out* instead — see
 * `getAllSessions` and `getAllMatnSessions` — which is where the distinction
 * actually matters, because a Qur'an reader would trip on a matn session's
 * missing surah.
 *
 * `upgradeSession` leaves a matn session alone by construction: it only acts
 * on records carrying `currentAyahId`, which no matn session has.
 */
export const saveSession = (s: RecitationSession | MatnSession) =>
  idbRequest(STORE, 'readwrite', store => store.put(s));

/** Sessions written by an older build are read forward on the way out. */
export const getSession = async (id: string) => {
  const raw = await idbRequest<RecitationSession>(STORE, 'readonly', store => store.get(id));
  return raw ? upgradeSession(raw) : raw;
};

/**
 * Drops a session and the recordings that belong to it.
 *
 * Audio is the one thing here big enough that orphans matter: a blob nobody
 * points at is invisible, permanent, and tens of kilobytes each. The clips go
 * first — a session that outlived its audio is merely missing a recording,
 * while audio that outlived its session can never be found again.
 */
export const deleteSession = async (id: string) => {
  await deleteClipsOfSession(id).catch(() => { /* nothing to drop */ });
  return idbRequest(STORE, 'readwrite', store => store.delete(id));
};

/** Sessions of Qur'an only — everything that reads these expects a surah. */
export const getAllSessions = async () => {
  const all = await idbGetAll<RecitationSession>(STORE, store => store.getAll());
  return upgradeSessions(all.filter(s => !isMatnSession(s)));
};

/** And the matn ones, which nothing on the Qur'an side should ever see. */
export const getAllMatnSessions = async (): Promise<MatnSession[]> => {
  const all = await idbGetAll<RecitationSession | MatnSession>(STORE, store => store.getAll());
  return all.filter(isMatnSession);
};

// ── Active-session pointer ──────────────────────────────────────

export function getActiveSessionId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* private mode — the session still lives in IndexedDB */ }
}

/** The session to offer resuming on boot, or null. */
export async function loadActiveSession(): Promise<RecitationSession | null> {
  const id = getActiveSessionId();
  if (!id) return null;
  try {
    const s = await getSession(id);
    if (!s || s.status === 'ended') { setActiveSessionId(null); return null; }
    return s;
  } catch {
    return null;
  }
}

/** Names from past sessions, most recent first — feeds the setup autocomplete. */
export async function recentStudentNames(limit = 8): Promise<string[]> {
  return recentNames(s => s.studentName, limit);
}

/** Past muqri' names — the same halaqa usually has one or two. */
export async function recentInstructorNames(limit = 8): Promise<string[]> {
  return recentNames(s => s.instructorName, limit);
}

async function recentNames(pick: (s: RecitationSession) => string | undefined, limit: number): Promise<string[]> {
  try {
    const all = await getAllSessions();
    all.sort((a, b) => b.startedAt - a.startedAt);
    const seen: string[] = [];
    for (const s of all) {
      const name = pick(s)?.trim();
      if (name && !seen.includes(name)) seen.push(name);
      if (seen.length >= limit) break;
    }
    return seen;
  } catch {
    return [];
  }
}

/**
 * The contact last recorded for a person, by name.
 *
 * A halaqa of twenty students would otherwise mean typing twenty numbers at
 * every majlis. The name is the key because it is what the teacher types
 * first, and the match is exact — two students called محمد are two people, and
 * guessing between them would put one boy's number on the other's record.
 */
export async function contactForName(
  name: string,
  side: 'student' | 'instructor',
): Promise<{ whatsapp: string; country: string } | null> {
  const key = name.trim();
  if (!key) return null;
  try {
    const all = await getAllSessions();
    all.sort((a, b) => b.startedAt - a.startedAt);
    for (const s of all) {
      const matches = side === 'student'
        ? s.studentName?.trim() === key
        : s.instructorName?.trim() === key;
      if (!matches) continue;
      const whatsapp = side === 'student' ? s.studentWhatsapp : s.instructorWhatsapp;
      const country = side === 'student' ? s.studentCountry : s.instructorCountry;
      if (whatsapp) return { whatsapp, country: country ?? '' };
    }
    return null;
  } catch { return null; }
}

/** Past sessions for one student, newest first. */
export async function sessionsForStudent(name: string): Promise<RecitationSession[]> {
  const all = await getAllSessions();
  const key = name.trim();
  return all.filter(s => s.studentName.trim() === key).sort((a, b) => b.startedAt - a.startedAt);
}

// ── Write-through ───────────────────────────────────────────────

const DEBOUNCE_MS = 400;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: RecitationSession | null = null;

function write(s: RecitationSession) {
  saveSession(s).catch(err => console.error('[recitation] save failed', err));
}

/** Coalesced save — used for high-frequency changes like moving the marker. */
export function queueSessionSave(s: RecitationSession): void {
  pending = s;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (pending) { write(pending); pending = null; }
  }, DEBOUNCE_MS);
}

/** Immediate save — used for notes, pause, resume and end. */
export function flushSessionSave(s?: RecitationSession): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const target = s ?? pending;
  pending = null;
  if (target) write(target);
}
