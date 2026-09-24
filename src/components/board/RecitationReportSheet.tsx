import React, { useCallback, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { useI18n } from '@/hooks/useI18n';
import { surahName } from '@/lib/quran-data';
import type { QuranIndex } from '@/lib/quran-index';
import {
  activeMs, formatDuration, formatVolumeAr, groupedNoteLines, isKhatmah, noteCounts, notesPerPage,
  pausedMs, progressPct, surahPressure, volumeSummary,
  type NoteKind, type RecitationSession,
} from '@/lib/recitation-session';
import { duaForSession, encouragement, type Lang } from '@/lib/recitation-duas';
import { getMushaf, mushafFullName, riwayaName } from '@/lib/mushaf/registry';
import { NOTE_LABEL_KEY, positionLabelIn, reportRows } from './recitation-shared';

/**
 * The printed sheet, in fixed document colours so it exports identically in
 * any theme. Kept as its own component because the admin dashboard renders the
 * very same sheet — the teacher and the archive must never disagree.
 */
export const SHEET_BG = '#fdf8ef';
const SHEET_INK = '#1f2421';
const SHEET_MUTED = '#6b7269';
const SHEET_RULE = '#d8cdb8';
const SHEET_ACCENT = '#1a5e2a';

/** Below this, listening time and wall-clock differ only by setup fiddling. */
const BREAK_THRESHOLD_MS = 2 * 60 * 1000;

export function goalLabel(kind: RecitationSession['goal']['kind'], t: (k: never) => string): string {
  const key = kind === 'juz1' ? 'recGoalJuz1'
    : kind === 'juz5' ? 'recGoalJuz5'
    : kind === 'juz10' ? 'recGoalJuz10'
    : kind === 'juz15' ? 'recGoalJuz15'
    : kind === 'full' ? 'recGoalFull'
    : 'recGoalCustom';
  return t(key as never);
}

interface Props {
  session: RecitationSession;
  index: QuranIndex;
}

export const RecitationReportSheet = React.forwardRef<HTMLDivElement, Props>(({ session, index }, ref) => {
  const { t, dir, lang } = useI18n();

  const counts = noteCounts(session);
  const volume = useMemo(() => volumeSummary(session, index), [session, index]);
  const pressure = useMemo(() => surahPressure(session, index), [session, index]);
  const at = session.endedAt ?? session.lastSeenAt ?? Date.now();
  const active = activeMs(session, at);
  const paused = pausedMs(session, at);
  const showPaused = paused > BREAK_THRESHOLD_MS;
  const perPage = notesPerPage(session, index);
  const khatmah = useMemo(() => isKhatmah(session, index), [session, index]);
  const dua = useMemo(() => duaForSession(session.id), [session.id]);
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const cheer = encouragement(
    { khatmah, progressPct: progressPct(session), notesPerPage: perPage },
    lang as Lang,
  );

  // A majlis that changed muṣḥaf half way has two numberings in one line, so
  // each end says which book it is in when they differ.
  const startLabel = positionLabelIn(session.goal.start, session.mushafId);
  const endLabel = positionLabelIn(session.current, session.mushafId);
  const edition = getMushaf(session.mushafId);
  const mushafLabel = edition ? mushafFullName(edition, lang) : riwayaName(session.riwayaId, lang);

  const volumeLine = useMemo(() => {
    if (lang === 'ar') return formatVolumeAr(volume);
    const parts: string[] = [];
    if (volume.fullJuz) parts.push(`${volume.fullJuz} ${t('recJuzPlural')}`);
    if (volume.extraPages) parts.push(`${volume.extraPages} ${t('recPagesUnit')}`);
    if (!parts.length) parts.push(`${volume.pages} ${t('recPagesUnit')}`);
    return `${parts.join(' + ')} · ${volume.ayahs} ${t('recAyahsUnit')}`;
  }, [volume, t, lang]);

  /** Same rows as the modal around this sheet, so the image says what it says. */
  const rows = reportRows(session).map(r => ({
    // The words noted on each verse, as «(الكلمة ٣)» after its number.
    ...r,
    lines: groupedNoteLines(
      r.entries, session.mushafId,
      words => t('recWordN').replace('{n}', words.map(w => w + 1).join('، ')),
    ),
  }));

  return (
    <div
      ref={ref}
      dir={dir}
      style={{ background: SHEET_BG, color: SHEET_INK, border: `2px solid ${SHEET_RULE}`, borderRadius: 14, padding: '20px 22px' }}
    >
      <div style={{ borderBottom: `2px solid ${SHEET_ACCENT}`, paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>{session.studentName}</div>
        <div style={{ fontSize: 12, color: SHEET_MUTED, marginTop: 2 }}>
          {t('recReportTitle')} · {new Date(session.startedAt).toLocaleDateString(lang)} · {goalLabel(session.goal.kind, t as never)}
        </div>
        {session.instructorName && (
          <div style={{ fontSize: 12, color: SHEET_MUTED, marginTop: 2 }}>
            {t('recInstructor')}: <span style={{ fontWeight: 700, color: SHEET_INK }}>{session.instructorName}</span>
          </div>
        )}
      </div>

      {khatmah && (
        <div style={{ background: SHEET_ACCENT, color: SHEET_BG, borderRadius: 10, padding: '8px 12px', marginBottom: 10, textAlign: 'center', fontWeight: 800, fontSize: 15 }}>
          {t('recKhatmahDone')}
        </div>
      )}

      <Row label={t('recRecited')} value={volumeLine} strong />
      <Row rtlValue label={`${t('recFrom')} — ${t('recTo')}`} value={`${startLabel} ← ${endLabel}`} />
      {/* Which book these numbers are in — two riwayat number verses
          differently, so a sheet that did not say would be unreadable. */}
      <Row label={t('recMushaf')} value={mushafLabel} />
      {/* Two clocks confuse unless each says plainly what it counts. */}
      <Row label={t('recListeningTime')} value={formatDuration(active, lang)} strong />
      <Row label={t('recFromTo')} value={`${clock(session.startedAt)} — ${clock(at)}`} />
      {showPaused && <Row label={t('recPausedTime')} value={formatDuration(paused, lang)} />}

      <div style={{ height: 1, background: SHEET_RULE, margin: '14px 0' }} />

      {rows.map(({ slot, count, lines: list }) => {
        return (
          <div key={slot} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t(NOTE_LABEL_KEY[slot])}</span>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{count}</span>
            </div>
            {list.length > 0 && (
              // Surah names are Arabic in every language; an LTR base direction
              // would reorder the groups around the separators.
              <div dir="rtl" style={{ fontSize: 12, color: SHEET_MUTED, marginTop: 3, lineHeight: 1.7 }}>
                {list.join(' · ')}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ height: 1, background: SHEET_RULE, margin: '14px 0' }} />

      <Row label={t('recNotesPerPage')} value={perPage.toFixed(1)} />
      {pressure.items.length > 0 && (
        <>
          <Row rtlValue label={t('recNeedsReview')} value={pressure.items.map(p => p.name).join(' · ')} strong />
          {pressure.lowConfidence && (
            <div style={{ fontSize: 11, color: SHEET_MUTED, marginTop: 4 }}>{t('recLowConfidence')}</div>
          )}
        </>
      )}

      <div style={{ height: 1, background: SHEET_RULE, margin: '14px 0' }} />
      <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 10 }}>{cheer}</div>
      <div dir="rtl" style={{ textAlign: 'center', border: `1px solid ${SHEET_RULE}`, borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.9, color: SHEET_ACCENT }}>{dua.ar}</div>
        {lang !== 'ar' && (
          <div dir={dir} style={{ fontSize: 12, color: SHEET_MUTED, marginTop: 4 }}>
            {dua.meaning[lang as Exclude<Lang, 'ar'>]}
          </div>
        )}
      </div>
    </div>
  );
});
RecitationReportSheet.displayName = 'RecitationReportSheet';

const Row: React.FC<{ label: string; value: string; strong?: boolean; rtlValue?: boolean }> = ({ label, value, strong, rtlValue }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
    <span style={{ fontSize: 13, color: SHEET_MUTED, flexShrink: 0 }}>{label}</span>
    {/* Values chaining Arabic surah names need their own direction. */}
    <span dir={rtlValue ? 'rtl' : undefined} style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, textAlign: 'end' }}>{value}</span>
  </div>
);

/** Rasterises a rendered sheet. Shared so every export looks the same. */
export async function sheetToPng(node: HTMLElement): Promise<string> {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: SHEET_BG, useCORS: true });
  return canvas.toDataURL('image/png');
}
