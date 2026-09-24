import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award, BookOpenCheck, Download, Loader2, RefreshCw, Search, Trash2, HardDrive, ChevronDown, ImageIcon,
  Cloud,
} from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { adminDeleteSession, adminListSessions } from "@/lib/recitation-cloud";
import { RecitationReportSheet, sheetToPng } from "@/components/board/RecitationReportSheet";
import { RecitationCertificate } from "@/components/board/RecitationCertificate";
import { certificateFields, waitForPaintable } from "@/lib/recitation-certificate";
import { riwayaName } from "@/lib/mushaf/registry";
import { getAllSessions, deleteSession } from "@/lib/recitation-store";
import { getQuranIndex, loadQuranIndex } from "@/lib/quran-index";
import type { QuranIndex } from "@/lib/quran-index";
import { MUSHAF_LABELS } from "@/lib/mushaf-editions";
import {
  activeMs, coveredCount, formatDuration, isKhatmah, noteCounts, notesPerPage, pausedMs,
  progressPct, sessionCreator, surahPressure, volumeSummary, wallClockMs,
  type NoteKind, type RecitationSession,
} from "@/lib/recitation-session";

type RangeKey = 'all' | 'today' | '7d' | '30d';

const RANGES: { value: RangeKey; key: 'recAllTime' | 'recToday' | 'recLast7Days' | 'recLast30Days'; ms: number | null }[] = [
  { value: 'all', key: 'recAllTime', ms: null },
  { value: 'today', key: 'recToday', ms: 24 * 3600_000 },
  { value: '7d', key: 'recLast7Days', ms: 7 * 24 * 3600_000 },
  { value: '30d', key: 'recLast30Days', ms: 30 * 24 * 3600_000 },
];

const NOTE_KEY: Record<NoteKind, 'recHesitation' | 'recMemory' | 'recTajweed' | 'recShakl'> = {
  hesitation: 'recHesitation',
  memory: 'recMemory',
  tajweed: 'recTajweed',
  shakl: 'recShakl',
};

/** One session flattened into the numbers the tab and the export both need. */
interface Row {
  s: RecitationSession;
  ayahs: number;
  pages: number;
  fullJuz: number;
  pct: number;
  active: number;
  paused: number;
  counts: Record<NoteKind, number>;
  perPage: number;
  khatmah: boolean;
  weakest: string;
  from: string;
  to: string;
}

/** Enough of a session to compute a row from: everything below reads these. */
function isReadable(s: RecitationSession | null | undefined): s is RecitationSession {
  return Boolean(s && Array.isArray(s.segments) && Array.isArray(s.covered)
    && Array.isArray(s.notes) && s.goal?.start && s.current && typeof s.startedAt === 'number');
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function RecitationSection() {
  const { t, dir, lang } = useI18n();
  /** One locale for every date and number in the table. */
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  const [sessions, setSessions] = useState<RecitationSession[] | null>(null);
  const [index, setIndex] = useState<QuranIndex | null>(getQuranIndex());
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<RangeKey>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetFor, setSheetFor] = useState<RecitationSession | null>(null);
  const [certFor, setCertFor] = useState<RecitationSession | null>(null);
  const [source, setSource] = useState<'cloud' | 'local'>('cloud');
  const sheetHostRef = useRef<HTMLDivElement>(null);
  const certHostRef = useRef<HTMLDivElement>(null);

  /**
   * Supabase is the archive; the local store is the fallback. If the cloud read
   * fails the tab still works on whatever this device holds, and says which of
   * the two it is showing rather than presenting an empty table as "no usage".
   */
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const idx = await loadQuranIndex();
      setIndex(idx);
      try {
        const rows = await adminListSessions();
        // A row whose stored session is malformed — an early write, a probe, a
        // half-migrated record — would throw inside the figures below and blank
        // the whole screen. One unreadable row is not a reason to show none.
        const list = rows.map(r => r.session).filter(isReadable);
        list.sort((a, b) => b.startedAt - a.startedAt);
        setSessions(list);
        setSource('cloud');
      } catch {
        const list = await getAllSessions();
        list.sort((a, b) => b.startedAt - a.startedAt);
        setSessions(list);
        setSource('local');
      }
    } catch {
      setSessions([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => {
    if (!sessions || !index) return [];
    const cutoff = RANGES.find(r => r.value === range)?.ms;
    return sessions
      .filter(s => !cutoff || Date.now() - s.startedAt <= cutoff)
      .filter(s => {
        const q = query.trim();
        return !q || s.studentName.includes(q) || (s.instructorName ?? '').includes(q);
      })
      .map(s => {
        const at = s.endedAt ?? s.lastSeenAt ?? Date.now();
        const vol = volumeSummary(s, index);
        // The report shows the numbers as the teacher recorded them, in the
        // edition they were reciting from.
        const startLoc = s.goal.start;
        const endLoc = s.current;
        const pressure = surahPressure(s, index, 2);
        return {
          s,
          ayahs: coveredCount(s.covered),
          pages: vol.pages,
          fullJuz: vol.fullJuz,
          pct: progressPct(s),
          active: activeMs(s, at),
          paused: pausedMs(s, at),
          counts: noteCounts(s),
          perPage: notesPerPage(s, index),
          khatmah: isKhatmah(s, index),
          weakest: pressure.items.map(p => p.name).join(' · ') || '—',
          from: startLoc ? `${startLoc.surah}:${startLoc.ayah}` : '—',
          to: endLoc ? `${endLoc.surah}:${endLoc.ayah}` : '—',
        };
      });
  }, [sessions, index, query, range]);

  const totals = useMemo(() => ({
    sessions: rows.length,
    // People, not names: one card per device-holder, keyed on their number.
    users: new Set(rows.map(r => sessionCreator(r.s).key)).size,
    ayahs: rows.reduce((n, r) => n + r.ayahs, 0),
    hours: rows.reduce((n, r) => n + r.active, 0) / 3600_000,
    notes: rows.reduce((n, r) => n + r.counts.hesitation + r.counts.memory + r.counts.tajweed + r.counts.shakl, 0),
    khatmat: rows.filter(r => r.khatmah).length,
  }), [rows]);

  const download = useCallback((name: string, body: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportCsv = useCallback(() => {
    const head = [t('recReciter'), t('recListener'), t('recDate'), t('recMushaf'), t('recGoal'),
      t('recFrom'), t('recTo'), t('recKpiAyahs'), t('recPagesUnit'), t('recColFullJuz'), t('recColPercent'),
      t('recColMinutes'), t('recColPausedMinutes'), t('recHesitation'), t('recMemory'), t('recTajweed'), t('recShakl'),
      t('recColNotesPerPage'), t('recKhatmahBadge'), t('recNeedsReview')];
    const body = rows.map(r => [
      r.s.studentName,
      r.s.instructorName ?? '',
      new Date(r.s.startedAt).toLocaleString(locale),
      MUSHAF_LABELS[r.s.mushaf ?? 'madinah'][lang === 'ar' ? 'ar' : 'en'],
      r.s.goal.kind,
      r.from, r.to,
      r.ayahs, r.pages, r.fullJuz, r.pct,
      Math.round(r.active / 60000), Math.round(r.paused / 60000),
      r.counts.hesitation, r.counts.memory, r.counts.tajweed, r.counts.shakl,
      r.perPage.toFixed(2),
      r.khatmah ? t('recYes') : t('recNo'),
      r.weakest,
    ]);
    // BOM so Excel opens the Arabic correctly.
    download(`recitation-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [head, ...body].map(l => l.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }, [rows, download]);

  const exportJson = useCallback(() => {
    download(`recitation-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(rows.map(r => r.s), null, 2), 'application/json');
  }, [rows, download]);

  const remove = useCallback(async (id: string) => {
    // Delete wherever the row was read from, and from this device either way.
    if (source === 'cloud') await adminDeleteSession(id).catch(() => { /* surfaced by the row staying */ });
    await deleteSession(id).catch(() => { /* may not exist on this device */ });
    setSessions(list => (list ? list.filter(s => s.id !== id) : list));
  }, [source]);

  /**
   * Renders the very same sheet the teacher sees at the end of a majlis and
   * saves it as a PNG. The sheet is mounted off-screen only for the moment it
   * takes to rasterise — one component, so the archive can never drift from
   * what the parent was handed.
   */
  const exportSheet = useCallback(async (s: RecitationSession) => {
    setSheetFor(s);
    // Let React paint the off-screen sheet before html2canvas reads it.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = sheetHostRef.current?.firstElementChild as HTMLElement | undefined;
    if (!node) { setSheetFor(null); return; }
    try {
      const a = document.createElement('a');
      a.href = await sheetToPng(node);
      a.download = `${s.studentName || 'recitation'}-${new Date(s.startedAt).toISOString().slice(0, 10)}.png`;
      a.click();
    } finally {
      setSheetFor(null);
    }
  }, []);

  /**
   * The certificate for one majlis, from the archive.
   *
   * The same component the teacher exported on their own device, drawn from
   * the stored session — so the copy the owner hands out and the copy the
   * student already has are the same document, down to the QR code, which
   * carries the same id and therefore verifies the same way.
   */
  const exportCertificate = useCallback(async (s: RecitationSession) => {
    if (!index) return;
    setCertFor(s);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = certHostRef.current?.firstElementChild as HTMLElement | undefined;
    if (!node) { setCertFor(null); return; }
    try {
      await waitForPaintable(node);
      const a = document.createElement('a');
      a.href = await sheetToPng(node);
      a.download = `${t('recCertificate')}-${s.studentName || 'sard'}-${new Date(s.startedAt).toISOString().slice(0, 10)}.png`;
      a.click();
    } finally {
      setCertFor(null);
    }
  }, [index]);

  return (
    <div className="space-y-4" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="text-emerald-600" size={22} />
          <h2 className="text-lg font-bold">{t('recSectionTitle')}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold hover:bg-accent disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('recRefresh')}
          </button>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold hover:bg-accent disabled:opacity-40">
            <Download size={14} /> {t('recExportCsv')}
          </button>
          <button onClick={exportJson} disabled={!rows.length} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold hover:bg-accent disabled:opacity-40">
            <Download size={14} /> {t('recExportJson')}
          </button>
        </div>
      </div>

      {/*
        Sessions are stored in the teacher's own browser, not in Firebase like
        the rest of this dashboard. Saying so plainly matters: otherwise an
        empty table reads as "nobody used it" when it means "not this device".
      */}
      {source === 'cloud' ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Cloud size={15} className="mt-0.5 shrink-0" />
          <span>
            {t('recSourceNote')}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <HardDrive size={15} className="mt-0.5 shrink-0" />
          <span>
            {t('recLocalOnlyNote')}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t('recKpiSessions')} value={totals.sessions} />
        <Kpi label={t('recKpiUsers')} value={totals.users} />
        <Kpi label={t('recKpiAyahs')} value={totals.ayahs.toLocaleString(locale)} />
        <Kpi label={t('recKpiHours')} value={totals.hours.toFixed(1)} />
        <Kpi label={t('recKpiNotes')} value={totals.notes} />
        <Kpi label={t('recKpiKhatmat')} value={totals.khatmat} accent />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('recSearchByReciter')}
            className="w-full rounded-lg border border-border bg-background py-2 pe-3 ps-9 text-sm outline-none focus:border-emerald-600"
          />
        </div>
        <select value={range} onChange={e => setRange(e.target.value as RangeKey)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-600">
          {RANGES.map(r => <option key={r.value} value={r.value}>{t(r.key)}</option>)}
        </select>
      </div>

      {sessions === null ? (
        <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto animate-spin" /></div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {t('recNoSessionsOnDevice')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-accent/40 text-xs text-muted-foreground">
              <tr>
                {[t('recReciter'), t('recListener'), t('recDate'), t('recMushaf'), t('recColCovered'),
                  t('recColPercent'), t('recListeningTime'), t('recHesitation'), t('recMemory'),
                  t('recTajweed'), t('recShakl'), ''].map(h => (
                  <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.s.id}>
                  <tr className="border-t border-border hover:bg-accent/20">
                    <td className="px-3 py-2 font-bold">
                      {r.s.studentName}
                      {r.khatmah && <span className="ms-2 rounded-full bg-emerald-600 px-1.5 py-px text-[9px] font-extrabold text-white">{t('recKhatmahBadge')}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.s.instructorName || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.s.startedAt).toLocaleDateString('ar-EG')}</td>
                    <td className="px-3 py-2 text-xs">{MUSHAF_LABELS[r.s.mushaf ?? 'madinah'][lang === 'ar' ? 'ar' : 'en']}</td>
                    <td className="px-3 py-2 tabular-nums text-xs">{r.fullJuz ? `${r.fullJuz} ${t('recJuzWord')} · ` : ''}{r.pages} {t('recPagesUnit')}</td>
                    <td className="px-3 py-2 tabular-nums font-bold">{r.pct}%</td>
                    <td className="px-3 py-2 tabular-nums text-xs">{formatDuration(r.active, lang)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.counts.hesitation}</td>
                    <td className="px-3 py-2 tabular-nums">{r.counts.memory}</td>
                    <td className="px-3 py-2 tabular-nums">{r.counts.tajweed}</td>
                    <td className="px-3 py-2 tabular-nums">{r.counts.shakl}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => exportSheet(r.s)} disabled={!!sheetFor}
                          aria-label={t('recExportReportImage')} title={t('recExportReportImage')}
                          className="rounded p-1 text-muted-foreground hover:text-emerald-600 disabled:opacity-40">
                          {sheetFor?.id === r.s.id ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                        </button>
                        <button onClick={() => exportCertificate(r.s)} disabled={!!certFor || !index}
                          aria-label={t('recDownloadCertificate')} title={t('recDownloadCertificate')}
                          className="rounded p-1 text-muted-foreground hover:text-emerald-600 disabled:opacity-40">
                          {certFor?.id === r.s.id ? <Loader2 size={15} className="animate-spin" /> : <Award size={15} />}
                        </button>
                        <button onClick={() => setExpanded(e => (e === r.s.id ? null : r.s.id))}
                          aria-label={t('recDetails')} className="rounded p-1 text-muted-foreground hover:text-foreground">
                          <ChevronDown size={15} className={expanded === r.s.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                        <button onClick={() => remove(r.s.id)} aria-label={t('recDelete')} className="rounded p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === r.s.id && (
                    <tr className="border-t border-border bg-accent/10">
                      <td colSpan={11} className="px-4 py-3">
                        <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                          <Detail label={t('recFromTo')} value={`${r.from} ← ${r.to}`} />
                          <Detail label={t('recKpiAyahs')} value={String(r.ayahs)} />
                          <Detail label={t('recPausedTime')} value={formatDuration(r.paused, lang)} />
                          <Detail label={t('recNotesPerPage')} value={r.perPage.toFixed(2)} />
                          <Detail label={t('recNeedsReview')} value={r.weakest} />
                          <Detail label={t('recStatus')} value={r.s.status} />
                        </div>
                        {r.s.notes.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.s.notes.slice(0, 40).map(n => (
                              <span key={n.id} className="rounded-full bg-background px-2 py-0.5 text-[10px] ring-1 ring-border">
                                {t(NOTE_KEY[n.kind])} {n.position.surah}:{n.position.ayah}
                              </span>
                            ))}
                            {r.s.notes.length > 40 && <span className="text-[10px] text-muted-foreground">+{r.s.notes.length - 40}</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Off-screen host for the sheet being rasterised. Kept in the layout
          flow (not display:none) because html2canvas cannot measure a hidden
          node; parked far off-canvas instead. */}
      <div ref={sheetHostRef} aria-hidden style={{ position: 'fixed', top: 0, insetInlineStart: '-10000px', width: 560 }}>
        {sheetFor && index && <RecitationReportSheet session={sheetFor} index={index} />}
      </div>
      <div ref={certHostRef} aria-hidden style={{ position: 'fixed', top: 0, insetInlineStart: '-10000px', width: 840 }}>
        {certFor && index && (
          <RecitationCertificate fields={certificateFields(certFor, index, riwayaName(certFor.riwayaId, lang), lang)} />
        )}
      </div>
    </div>
  );
}

const Kpi = ({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${accent ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-background'}`}>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-lg font-extrabold tabular-nums">{value}</div>
  </div>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-bold">{value}</span>
  </div>
);
