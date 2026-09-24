/**
 * What a matn session produces when it ends.
 *
 * The same skeleton as the muṣḥaf's report — who, how much, from where to
 * where, how long, and every note at its place — because the shaykh reads both
 * the same way. Only the rows differ, and they differ because the units do.
 *
 * `(ص)` and `(ع)` mark the ṣadr and the ʿajz. No notation is invented for it:
 * those are the words, and a scholar reads them without a legend.
 */

import React from 'react';

import { useI18n } from '@/hooks/useI18n';
import type { MatnBab } from '@/lib/matn/load';
import type { MatnPosition } from '@/lib/matn/position';
import { matnEdition, matnName } from '@/lib/matn/registry';
import { matnVolume, type MatnSession } from '@/lib/matn/session';
import { activeMs, coveredCount, formatDuration, sessionMarks, sessionMode } from '@/lib/recitation-session';
import { MATN_MAJLIS_SLOTS, NOTE_LABEL_KEY, SOLO_SLOTS, type MatnSlot } from './recitation-shared';

const SHEET_BG = '#fdf8ef';
const SHEET_INK = '#231f18';
const SHEET_MUTED = '#6d6455';
const SHEET_RULE = '#e0d6c2';

interface Props {
  session: MatnSession;
  abwab: MatnBab[];
}

/**
 * Places, grouped and listed — the matn's counterpart of `groupedNoteLines`.
 *
 * Grouped by bāb rather than by surah, and each line number carries which half
 * it was taken in: a note that lost its shaṭr would point at a whole line and
 * make the shaykh hunt for what he already found once.
 */
export function groupedBaytLines(
  places: { position: MatnPosition }[], abwab: MatnBab[], rtl: boolean,
): string[] {
  const byBab = new Map<number, string[]>();
  for (const { position } of places) {
    const bab = abwab.find(b => position.bayt >= b.from && position.bayt <= b.to);
    const key = bab?.n ?? 0;
    const half = rtl
      ? (position.shatr === 'sadr' ? 'ص' : 'ع')
      : (position.shatr === 'sadr' ? 'a' : 'b');
    const list = byBab.get(key) ?? [];
    list.push(`${position.bayt} (${half})`);
    byBab.set(key, list);
  }
  return [...byBab.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, places]) => {
      const bab = abwab.find(b => b.n === n);
      const title = bab ? (rtl ? bab.titleAr : bab.titleEn) : '';
      return title ? `${title}: ${places.join(' · ')}` : places.join(' · ');
    });
}

const MatnReportSheet = React.forwardRef<HTMLDivElement, Props>(({ session, abwab }, ref) => {
  const { t, lang, dir } = useI18n();
  const rtl = dir === 'rtl';

  const volume = matnVolume(session, abwab);
  const abyat = coveredCount(session.covered);
  const at = session.endedAt ?? session.lastSeenAt ?? Date.now();

  const slots: readonly MatnSlot[] = sessionMode(session) === 'solo' ? SOLO_SLOTS : MATN_MAJLIS_SLOTS;
  const rows = slots.map(slot => {
    const places = slot === 'mark'
      ? sessionMarks(session)
      : session.notes.filter(n => n.kind === slot);
    return { slot, count: places.length, lines: groupedBaytLines(places, abwab, rtl) };
  });

  const edition = matnEdition(session.matnId, lang);

  return (
    <div
      ref={ref}
      dir={dir}
      style={{
        background: SHEET_BG, color: SHEET_INK, border: `2px solid ${SHEET_RULE}`,
        borderRadius: 14, padding: '20px 22px',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 18 }}>{t('recReportTitle')}</div>
      <div style={{ fontSize: 13, color: SHEET_MUTED, marginTop: 2 }}>
        {session.studentName} · {matnName(session.matnId, lang)}
      </div>

      <div style={{ height: 1, background: SHEET_RULE, margin: '14px 0' }} />

      <Row label={t('recRecited')} value={`${abyat} · ${volume.abwabDone} · ${volume.percent}%`} strong />
      <Row
        label={`${t('recFrom')} — ${t('recTo')}`}
        value={`${session.goal.from} ← ${session.goal.to}`}
      />
      {/* The print is named here too: it owns the numbers just printed above. */}
      {edition && <Row label={t('recMatn')} value={`${matnName(session.matnId, lang)} — ${edition}`} />}
      <Row label={t('recListeningTime')} value={formatDuration(activeMs(session, at), lang)} strong />

      <div style={{ height: 1, background: SHEET_RULE, margin: '14px 0' }} />

      {rows.map(({ slot, count, lines }) => (
        <div key={slot} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t(NOTE_LABEL_KEY[slot])}</span>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{count}</span>
          </div>
          {lines.length > 0 && (
            <div dir={dir} style={{ fontSize: 12, color: SHEET_MUTED, marginTop: 3, lineHeight: 1.7 }}>
              {lines.join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

MatnReportSheet.displayName = 'MatnReportSheet';

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontSize: 13 }}>
    <span style={{ color: SHEET_MUTED }}>{label}</span>
    <span style={{ fontWeight: strong ? 800 : 500 }}>{value}</span>
  </div>
);

export default MatnReportSheet;
