// Reading sessions written by an older build.
//
// Before the position model, a session stored bare global ayah ids and nothing
// about which book they were read in — because there was only one book. Those
// sessions are all Madinah Hafs in the Kufan numbering, which is a fact about
// the past, not an assumption: no other edition existed to record.
//
// The conversion is exact and is marked as such: the numbers were read in that
// muṣḥaf and the anchor scheme is that muṣḥaf's own counting, so identity and
// anchor coincide with nothing derived.

import { loadQuranIndex, type QuranIndex } from './quran-index';
import type { MushafId } from './mushaf-editions';
import type { AyahPosition } from './mushaf/position';
import type { NoteKind, RecitationSession, SessionNote } from './recitation-session';

/** The edition every pre-model session was recited from. */
const LEGACY_EDITION = {
  mushafId: 'hafs-kfqc',
  riwayaId: 'hafs',
  ayahCounting: 'kufi',
} as const;

interface LegacyNote {
  id: string;
  at: number;
  kind: NoteKind;
  ayahId: number;
  surah: number;
  ayah: number;
  detail?: string;
  tajweedRuleId?: string;
}

interface LegacySession {
  goal: { kind: RecitationSession['goal']['kind']; startAyahId: number; endAyahId: number };
  currentAyahId: number;
  notes: LegacyNote[];
  mushaf?: MushafId;
  [key: string]: unknown;
}

function legacyPosition(id: number, surah: number, ayah: number): AyahPosition {
  return {
    ...LEGACY_EDITION,
    surah,
    ayah,
    // Read, not converted: these numbers were printed in the muṣḥaf the
    // teacher had open, and the anchor scheme is that muṣḥaf's own counting.
    origin: 'read',
    anchor: { scheme: 'kufi', surah, ayah, id, exact: true },
  };
}

function positionOfId(id: number, index: QuranIndex): AyahPosition {
  const loc = index.locOf(id);
  return legacyPosition(id, loc?.surah ?? 1, loc?.ayah ?? 1);
}

export function isLegacySession(raw: unknown): boolean {
  const s = raw as Partial<RecitationSession> & Partial<LegacySession>;
  return !!s && s.modelVersion !== 2 && typeof s.currentAyahId === 'number';
}

export function migrateSession(raw: LegacySession, index: QuranIndex): RecitationSession {
  const legacy = raw as LegacySession & Record<string, unknown>;
  const start = positionOfId(legacy.goal.startAyahId, index);
  const {
    goal: _goal, currentAyahId: _current, notes: _notes, qiraah: _qiraah, ...rest
  } = legacy as LegacySession & { qiraah?: string };
  return {
    ...(rest as unknown as RecitationSession),
    goal: {
      kind: legacy.goal.kind,
      start,
      end: positionOfId(legacy.goal.endAyahId, index),
    },
    current: positionOfId(legacy.currentAyahId, index),
    // What the majlis was about: the surah it began in, which is all the old
    // model ever knew.
    sessionSurah: start.surah,
    notes: legacy.notes.map((n): SessionNote => ({
      id: n.id,
      at: n.at,
      kind: n.kind,
      // The note already carried surah and ayah, so nothing is looked up and
      // nothing can drift.
      position: legacyPosition(n.ayahId, n.surah, n.ayah),
      detail: n.detail,
      tajweedRuleId: n.tajweedRuleId,
    })),
    ...LEGACY_EDITION,
    mushaf: legacy.mushaf ?? 'madinah',
    modelVersion: 2,
  };
}

/** Reads one stored session forward to the current model, loading what it needs. */
export async function upgradeSession(raw: unknown): Promise<RecitationSession> {
  if (!isLegacySession(raw)) return raw as RecitationSession;
  const legacy = raw as LegacySession;
  const index = await loadQuranIndex(legacy.mushaf ?? 'madinah');
  return migrateSession(legacy, index);
}

export async function upgradeSessions(list: unknown[]): Promise<RecitationSession[]> {
  const out: RecitationSession[] = [];
  for (const raw of list) {
    try { out.push(await upgradeSession(raw)); }
    catch { /* a session we cannot read forward is skipped, never half-converted */ }
  }
  return out;
}
