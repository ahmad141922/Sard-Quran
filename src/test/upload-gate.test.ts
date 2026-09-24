import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * That the gate is actually in the road.
 *
 * `upload-consent.test.ts` proves the rule; this proves the wiring, which is
 * the part that can rot. A consent module nothing calls is decoration, and the
 * failure it allows is silent — a recitation reaching a server because one code
 * path forgot to ask.
 *
 * So this reaches for the real `pushSession` and watches the database client:
 * without permission, nothing may be handed to it at all.
 */

const inserted = vi.fn();
const updated = vi.fn();
const saved = vi.fn();

vi.mock('@/lib/sard-supabase', () => ({
  SARD_ADMIN_FUNCTION: 'sard-admin',
  sardSupabase: {
    from: () => ({
      insert: async (row: unknown) => { inserted(row); return { error: null }; },
      update: (row: unknown) => ({
        eq: async () => { updated(row); return { error: null }; },
      }),
    }),
  },
}));

const stored: RecitationSession[] = [];

vi.mock('@/lib/recitation-store', () => ({
  saveSession: async (s: unknown) => { saved(s); },
  getAllSessions: async () => stored,
}));

import { readFileSync } from 'node:fs';
import { pushSession, flushUnsyncedSessions } from '@/lib/recitation-cloud';
import { giveConsent, saveConsent, NO_CONSENT } from '@/lib/upload-consent';
import { saveEnrolment } from '@/lib/enrolment';
import { buildQuranIndex } from '@/lib/quran-index';
import { testBooks } from './session-helpers';
import type { RecitationSession } from '@/lib/recitation-session';
import type { QuranVerse } from '@/lib/quran-data';

/*
 * A real index and a real session, built through the same position layer the
 * app uses. A hand-written stand-in would let `toRow` throw and the throw be
 * swallowed by the very try/catch this file is testing — so a refusal would
 * look identical to a bug.
 */
const raw = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8')) as QuranVerse[];
const index = buildQuranIndex(raw);
const books = testBooks(index);

const session = (): RecitationSession => ({
  ...books.session({ goalKind: 'juz1', startAyahId: 1, now: 1_000 }),
  endedAt: 9_000,
  status: 'ended',
});

beforeEach(() => {
  localStorage.clear();
  stored.length = 0;
  stored.push(session());
  inserted.mockClear();
  updated.mockClear();
  saved.mockClear();
});

describe('a device nobody has asked yet', () => {
  it('hands the database nothing', async () => {
    expect(await pushSession(session(), index)).toBe(false);
    expect(inserted).not.toHaveBeenCalled();
    expect(updated).not.toHaveBeenCalled();
  });

  it('does not mark the majlis as sent', async () => {
    await pushSession(session(), index);
    expect(saved).not.toHaveBeenCalled();
  });

  /** And does not queue it to be tried again on every reconnection. */
  it('sends nothing on the retry sweep either', async () => {
    expect(await flushUnsyncedSessions(index)).toBe(0);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe('a device that was asked and refused', () => {
  it('still hands the database nothing', async () => {
    saveConsent(giveConsent({ data: false, audio: false }));
    expect(await pushSession(session(), index)).toBe(false);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe('a device whose consent is out of date', () => {
  it('is treated as not having answered', async () => {
    saveConsent({ ...giveConsent({ data: true, audio: true }), version: 0 });
    expect(await pushSession(session(), index)).toBe(false);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe('a device that agreed', () => {
  it('sends the majlis', async () => {
    saveConsent(giveConsent({ data: true, audio: false }));
    expect(await pushSession(session(), index)).toBe(true);
    expect(inserted).toHaveBeenCalledTimes(1);
  });

  /**
   * And the row carries the terms it was sent under, so the copy on the server
   * can answer for itself rather than pointing at a device nobody can inspect.
   */
  it('stamps the row with what was agreed, and when', async () => {
    const consent = giveConsent({ data: true, audio: true });
    saveConsent(consent);
    await pushSession(session(), index);
    const row = inserted.mock.calls[0][0] as { consent: unknown; consent_at: string };
    expect(row.consent).toEqual(consent);
    expect(row.consent_at).toBe(new Date(consent.at!).toISOString());
  });

  it('never stamps a row with a consent it does not have', async () => {
    saveConsent(giveConsent({ data: true, audio: false }));
    await pushSession(session(), index);
    const row = inserted.mock.calls[0][0] as { consent: { audio: boolean } };
    expect(row.consent.audio).toBe(false);
  });
});

describe('the gate itself', () => {
  it('is the only thing standing between the two', async () => {
    saveConsent(NO_CONSENT);
    expect(await pushSession(session(), index)).toBe(false);
    saveConsent(giveConsent({ data: true, audio: false }));
    expect(await pushSession(session(), index)).toBe(true);
  });
});

describe('whose recitation the row says it is', () => {
  type Row = { student_id: string | null; teacher_id?: unknown; device_uid?: unknown };
  const sent = () => inserted.mock.calls[0][0] as Row;

  beforeEach(() => saveConsent(giveConsent({ data: true, audio: false })));

  it('names the student a teacher picked from the roster', async () => {
    await pushSession({ ...session(), rosterStudentId: 'stu-9' }, index);
    expect(sent().student_id).toBe('stu-9');
  });

  it("names the phone's own student when it has joined a roster", async () => {
    saveEnrolment({ studentId: 'stu-3', studentName: 'n', teacherId: 't' });
    await pushSession(session(), index);
    expect(sent().student_id).toBe('stu-3');
  });

  it('names nobody when neither says', async () => {
    await pushSession(session(), index);
    expect(sent().student_id).toBeNull();
  });

  /**
   * The device offers which student and nothing else. The teacher and the
   * device are decided by the database — a client that could name its own
   * teacher could name somebody else's.
   */
  it('never claims a teacher or a device itself', async () => {
    saveEnrolment({ studentId: 'stu-3', studentName: 'n', teacherId: 't' });
    await pushSession(session(), index);
    expect('teacher_id' in sent()).toBe(false);
    expect('device_uid' in sent()).toBe(false);
  });
});
