// Pushing recitation sessions to Supabase, and reading them back as admin.
//
// The device stays the source of truth: a session is always complete in
// IndexedDB before any network call, and the push is a best-effort mirror.
// A classroom on a bad connection must never lose a majlis to a failed upload,
// so failures are silent, recorded, and retried later.

import { SARD_ADMIN_FUNCTION, sardSupabase } from './sard-supabase';
import { consentStamp, loadConsent, mayUpload } from './upload-consent';
import { loadEnrolment, studentIdFor } from './enrolment';
import type { QuranIndex } from './quran-index';
import {
  activeMs, coveredCount, isKhatmah, noteCounts, pausedMs, progressPct, surahPressure,
  volumeSummary, type RecitationSession,
} from './recitation-session';
import { getAllSessions, saveSession } from './recitation-store';
import { upgradeSession } from './recitation-migrate';

/** Rows the admin dashboard reads back. */
export interface CloudSessionRow {
  id: string;
  teacher_email: string | null;
  student_name: string;
  started_at: string;
  session: RecitationSession;
}

function teacherEmail(): string | null {
  try { return localStorage.getItem('tajweedoo_auth_email')?.toLowerCase().trim() || null; }
  catch { return null; }
}

/** Flattens a session into the row shape, so the admin can sort and filter in SQL. */
function toRow(s: RecitationSession, index: QuranIndex) {
  const at = s.endedAt ?? s.lastSeenAt ?? Date.now();
  const volume = volumeSummary(s, index);
  const counts = noteCounts(s);
  return {
    id: s.id,
    teacher_email: teacherEmail(),
    student_name: s.studentName,
    // Which roster student recited — the only attribution the device offers.
    // The teacher and the device are decided by the database, never sent from
    // here: see `sard_attribute_session` in the teachers migration.
    student_id: studentIdFor(s, loadEnrolment()),
    instructor_name: s.instructorName ?? null,
    mushaf: s.mushaf ?? 'madinah',
    // Which book was recited from, and the numbering its verse numbers are in.
    // Flattened out of the session so the admin can filter on them in SQL
    // without having to know how to read a position.
    mushaf_id: s.mushafId,
    riwaya_id: s.riwayaId,
    ayah_counting: s.ayahCounting,
    // Where the majlis reached, in that edition's own numbering — not
    // converted into anyone else's.
    surah: s.current.surah,
    ayah: s.current.ayah,
    // The same place in the interop scheme, so sessions recited in different
    // riwayat can still be lined up against each other.
    canonical_anchor: s.current.anchor,
    goal_kind: s.goal.kind,
    started_at: new Date(s.startedAt).toISOString(),
    ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    active_ms: activeMs(s, at),
    paused_ms: pausedMs(s, at),
    ayahs: coveredCount(s.covered),
    pages: volume.pages,
    full_juz: volume.fullJuz,
    progress_pct: progressPct(s),
    notes_hesitation: counts.hesitation,
    notes_memory: counts.memory,
    notes_tajweed: counts.tajweed,
    notes_shakl: counts.shakl,
    khatmah: isKhatmah(s, index),
    weakest_surahs: surahPressure(s, index, 3).items.map(p => p.name).join(' · ') || null,
    session: s,
  };
}

/**
 * Mirrors one session upward. Returns whether it landed — the caller records
 * that locally so an offline majlis is retried rather than lost.
 *
 * **Insert first, update only on collision — never upsert.** An upsert is
 * `INSERT … ON CONFLICT DO UPDATE`, and Postgres will not run that for a role
 * with no SELECT policy: the conflict path has to look at the existing row,
 * and this table lets the published key see nothing at all. The upsert was
 * therefore rejected outright — every majlis stayed on the teacher's device,
 * the admin table stayed empty, and every certificate read «غير موثّقة»
 * because its id had never reached the database.
 *
 * Two statements instead of one, and the second runs only when the same
 * session is pushed twice (a retry, or a majlis reopened and ended again).
 * The posture the table was built on — writes yes, reads never — stays intact.
 */
export async function pushSession(s: RecitationSession, index: QuranIndex): Promise<boolean> {
  /*
   * The gate, and the first thing in the function.
   *
   * For most of this tool's life the mirror was unconditional, because what it
   * mirrored was a summary and the alternative was losing a majlis to a dropped
   * connection. Now that a teacher can be shown their student's recitation, the
   * question has to be asked, and «not yet asked» has to mean «not sent».
   *
   * Returning false rather than throwing on purpose: an unconsented session is
   * not a failure to retry later, it is a session that stays on the device —
   * see `flushUnsyncedSessions`, which would otherwise try it again every time
   * the network came back.
   */
  const consent = loadConsent();
  if (!mayUpload(consent, 'data')) return false;

  try {
    const row = { ...toRow(s, index), ...consentStamp(consent) };
    const { error: insertError } = await sardSupabase.from('recitation_sessions').insert(row);
    if (insertError) {
      // 23505 is unique_violation: this session is already up there, so the
      // push is an update. Anything else is a real failure and is retried.
      if (insertError.code !== '23505') throw insertError;
      const { error: updateError } = await sardSupabase
        .from('recitation_sessions')
        .update(row)
        .eq('id', s.id);
      if (updateError) throw updateError;
    }
    await saveSession({ ...s, syncedAt: Date.now() }).catch(() => { /* local write is best-effort here */ });
    return true;
  } catch {
    return false;
  }
}

/**
 * Retries every finished session that never made it up. Runs at app start and
 * whenever the browser regains the network.
 */
export async function flushUnsyncedSessions(index: QuranIndex): Promise<number> {
  let sent = 0;
  try {
    // Asked once for the whole sweep: without permission there is nothing to
    // retry, and walking every stored majlis to refuse each one in turn is
    // work for no result.
    if (!mayUpload(loadConsent(), 'data')) return 0;
    const all = await getAllSessions();
    const pending = all.filter(s => s.endedAt && !s.syncedAt);
    for (const s of pending) {
      if (await pushSession(s, index)) sent++;
    }
  } catch { /* nothing readable locally — nothing to retry */ }
  return sent;
}

/** Admin-only read. The table itself denies select to the anon key. */
export async function adminListSessions(limit = 500): Promise<CloudSessionRow[]> {
  const { data, error } = await sardSupabase.functions.invoke(SARD_ADMIN_FUNCTION, {
    body: { action: 'list_recitation_sessions', limit },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const rows = (data?.sessions ?? []) as CloudSessionRow[];
  // Rows pushed by an older build carry an older session shape; they are read
  // forward here so the admin renders one model, not two.
  return Promise.all(rows.map(async row => ({ ...row, session: await upgradeSession(row.session) })));
}

export async function adminDeleteSession(id: string): Promise<void> {
  const { data, error } = await sardSupabase.functions.invoke(SARD_ADMIN_FUNCTION, {
    body: { action: 'delete_recitation_session', id },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
