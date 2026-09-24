import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { anyMatnReady, useMatns } from '@/lib/matn/use-matns';
import type { MatnSession } from '@/lib/matn/session';
import type { MatnPosition } from '@/lib/matn/position';
import { BookOpen, BookOpenCheck, Play, ImageIcon, ScrollText, Trash2, Loader2, Moon, Sun, Info, X, LineChart, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import LangToggle from '@/components/board/LangToggle';
import { surahName } from '@/lib/quran-data';
import { getQuranIndex, loadQuranIndex, type QuranIndex } from '@/lib/quran-index';
import { riwayaName } from '@/lib/mushaf/registry';
import { useTheme } from '@/lib/theme';
import { withBase } from '@/lib/asset-url';
import {
  activeMs, closeSegment, coveredCount, creditToPosition, formatDuration, isKhatmah, noteCounts,
  progressPct, restoreAfterReload, sessionCorrections, startSegment, volumeSummary,
  type RecitationSession,
} from '@/lib/recitation-session';
import {
  deleteSession, flushSessionSave, getAllSessions, loadActiveSession, queueSessionSave,
  saveSession, setActiveSessionId,
} from '@/lib/recitation-store';
import { RecitationReportSheet, sheetToPng } from '@/components/board/RecitationReportSheet';
import { onHardwareBack, saveImage } from '@/lib/native';
import { layerToClose, type SardLayer } from './back-stack';
import SardSplash from './SardSplash';
import SardWizard from './SardWizard';
import { teacherText } from './teacher/strings';

const RecitationSetupModal = lazy(() => import('@/components/board/RecitationSetupModal'));
const RecitationOverlay = lazy(() => import('@/components/board/RecitationOverlay'));
const RecitationReportModal = lazy(() => import('@/components/board/RecitationReportModal'));
const MatnSetupModal = lazy(() => import('@/components/board/MatnSetupModal'));
const MatnOverlay = lazy(() => import('@/components/board/MatnOverlay'));
const MatnReportSheet = lazy(() => import('@/components/board/MatnReportSheet'));
const CorrectionList = lazy(() => import('@/components/board/CorrectionList'));
const ProgressScreen = lazy(() => import('@/components/board/ProgressScreen'));
/*
 * The roster and the consent question, both loaded only when opened. Neither is
 * on the way to reciting — a majlis still works with no network and no account —
 * so neither belongs in the bundle everybody downloads to open the muṣḥaf.
 */
const TeacherScreen = lazy(() => import('./teacher/TeacherScreen'));
const ConsentSheet = lazy(() => import('./teacher/ConsentSheet'));
const MushafReader = lazy(() => import('@/components/board/MushafReader'));

/**
 * Cloud mirroring is loaded on demand, never at module scope.
 *
 * The Supabase client throws while initialising if its keys are absent, and
 * this tool's whole point is a majlis that works with no network and no
 * account. A misconfigured or unreachable backend has to degrade to
 * local-only, not white-screen the recitation.
 */
async function cloud() {
  try { return await import('@/lib/recitation-cloud'); } catch { return null; }
}

/**
 * The standalone tool. Where the board offers a minimised console so the
 * teacher can keep drawing, here there is nothing to draw on — so minimising
 * returns to this home screen and the session simply stays open.
 */
const SardApp: React.FC = () => {
  const { t, lang, dir } = useI18n();
  /*
   * Shown once, on the first mount of the launch, and never again — the
   * splash covers the handover from the system's own, and a second one would
   * be an interruption rather than a join. It renders **over** the app rather
   * than instead of it, so nothing below waits on it: by the time it fades
   * the home screen behind it has already settled.
   */
  const [splash, setSplash] = useState(true);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const splashDone = useCallback(() => setSplash(false), []);
  // Dates read in the language on screen; Egypt is the tool's home locale, and
  // the report sheet is asked for the same one so a session is not dated two
  // ways on one screen.
  const locale = lang === 'ar' ? 'ar-EG' : lang;
  /** «٣ صفحات» inflects in Arabic; English only needs the s. */
  const unit = (n: number, key: 'recPagesUnit' | 'recAyahsUnit' | 'recNotesUnit') => (
    lang === 'ar' || n !== 1 ? `${n} ${t(key)}` : `${n} ${t(key).replace(/s$/, '')}`
  );
  const [index, setIndex] = useState<QuranIndex | null>(null);
  const [session, setSession] = useState<RecitationSession | null>(null);
  const [inSession, setInSession] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  /*
   * The roster, for the picker in the setup form: fetched when the form opens,
   * and only ever filled for a signed-in teacher — `listStudents` refuses a
   * student's phone and anybody signed out. Imported on demand for the reason
   * `cloud()` is: a backend that is missing or unreachable must leave the form
   * exactly as it was, not break it.
   */
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!setupOpen) return;
    let live = true;
    void (async () => {
      try {
        const { listStudents } = await import('@/lib/roster');
        const r = await listStudents();
        if (live && r.ok) setRoster(r.value.map(st => ({ id: st.id, name: st.name })));
      } catch { /* no backend: no picker, and nothing else changes */ }
    })();
    return () => { live = false; };
  }, [setupOpen]);
  const [report, setReport] = useState<RecitationSession | null>(null);
  /**
   * Reading, not reciting.
   *
   * Nothing is recorded here and nothing is asked, so it needs no state beyond
   * "is it open" — the reader keeps its own page.
   */
  const [reading, setReading] = useState(false);
  /**
   * The page the reader is being opened *at*, when something sent it there.
   *
   * Null for the plain «اقرأ» button, which means "wherever I left off". Set by
   * the progress screen, where a page that is due tonight is the one thing on
   * that screen you would actually want to act on.
   */
  const [readingAt, setReadingAt] = useState<number | null>(null);
  const [history, setHistory] = useState<RecitationSession[] | null>(null);
  const [sheetFor, setSheetFor] = useState<RecitationSession | null>(null);
  const sessionRef = useRef<RecitationSession | null>(null);
  const restoredRef = useRef(false);
  const sheetHostRef = useRef<HTMLDivElement>(null);
  /**
   * The matn side, kept in its own state rather than folded into the majlis
   * above. They are different records with different measures, and one pair of
   * variables holding either would mean every read of them asking which.
   */
  const [progressOpen, setProgressOpen] = useState(false);
  const [matnSetupOpen, setMatnSetupOpen] = useState(false);
  const [matnSession, setMatnSession] = useState<MatnSession | null>(null);
  const [matnReport, setMatnReport] = useState<MatnSession | null>(null);

  /*
   * The texts are fetched only once one is wanted — the matn screen opened, or
   * a session or report in hand. All seven come to about 150 KB compressed, and
   * a reciter who never opens a matn should not pay for them on every start.
   */
  const { matns } = useMatns(matnSetupOpen || !!matnSession || !!matnReport);

  /** The loaded matn a session is of — a session names its matn, not the file. */
  const matnMatn = matns.find(m => m.id === matnSession?.matnId) ?? null;
  const matnReportMatn = matns.find(m => m.id === matnReport?.matnId) ?? null;

  const [theme, toggleTheme] = useTheme();

  const refreshHistory = useCallback(() => {
    getAllSessions()
      .then(list => setHistory(list.filter(s => s.endedAt).sort((a, b) => b.startedAt - a.startedAt)))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => { loadQuranIndex().then(setIndex).catch(() => { /* offline first run */ }); }, []);
  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // Same write-through contract as the board: notes and status flips are
  // flushed at once, moving the marker is coalesced.
  const handleChange = useCallback((next: RecitationSession) => {
    const prev = sessionRef.current;
    const stamped: RecitationSession = { ...next, lastSeenAt: Date.now() };
    sessionRef.current = stamped;
    setSession(stamped);
    const important = !prev || prev.notes.length !== next.notes.length || prev.status !== next.status;
    if (important) flushSessionSave(stamped);
    else queueSessionSave(stamped);
  }, []);

  const handleStart = useCallback((s: RecitationSession) => {
    sessionRef.current = s;
    setSession(s);
    setActiveSessionId(s.id);
    flushSessionSave(s);
    setIndex(getQuranIndex(s.mushaf));
    setSetupOpen(false);
    setInSession(true);
  }, []);

  const handleEnd = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const now = Date.now();
    const credited = index ? creditToPosition(current, index) : current;
    const ended: RecitationSession = {
      ...credited, status: 'ended', endedAt: now, lastSeenAt: now,
      segments: closeSegment(credited, now),
    };
    sessionRef.current = ended;
    setSession(ended);
    flushSessionSave(ended);
    setActiveSessionId(null);
    setInSession(false);
    setReport(ended);
    // The local copy is already written, so a failed mirror costs only a retry.
    if (index) cloud().then(c => c?.pushSession(ended, index)).finally(refreshHistory);
    else refreshHistory();
  }, [index, refreshHistory]);

  // ── matn ──────────────────────────────────────────────────────
  //
  // The same three moments as a majlis — start, change, end — written out
  // separately because the session they act on is a different record. Sharing
  // them would mean a type test at the top of each.

  const startMatn = useCallback((s: MatnSession) => {
    setMatnSession(s);
    setMatnSetupOpen(false);
    saveSession(s);
  }, []);

  const changeMatn = useCallback((s: MatnSession) => {
    setMatnSession(s);
    saveSession({ ...s, lastSeenAt: Date.now() });
  }, []);

  const endMatn = useCallback(() => {
    setMatnSession(current => {
      if (!current) return null;
      const now = Date.now();
      const ended: MatnSession = {
        ...current, status: 'ended', endedAt: now, lastSeenAt: now,
        segments: closeSegment(current, now),
      };
      saveSession(ended);
      setMatnReport(ended);
      return null;
    });
  }, []);

  const handleReopen = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const resumed: RecitationSession = {
      ...current, status: 'active', endedAt: null,
      segments: startSegment({ ...current, status: 'active' }),
    };
    setActiveSessionId(resumed.id);
    handleChange(resumed);
    setReport(null);
    setInSession(true);
  }, [handleChange]);

  // Restore an unfinished majlis, paused, exactly as the board does.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    loadActiveSession().then(saved => {
      if (!saved) return;
      const restored = restoreAfterReload(saved);
      sessionRef.current = restored;
      setSession(restored);
      flushSessionSave(restored);
      loadQuranIndex(restored.mushaf ?? 'madinah').then(setIndex).catch(() => { /* offline */ });
      toast(`${t('recResumeBanner')} — ${restored.studentName}`);
    }).catch(() => { /* nothing to restore */ });
  }, [t]);

  // ── رفع ما لم يُرفع ──
  //
  // A majlis is saved locally first and mirrored second, so a session recorded
  // with no signal is never lost — it is only waiting. This decides when it
  // stops waiting, and there are three moments, not one:
  //
  //   at start        the ordinary case: the app opens with a network
  //   on `online`     the signal came back while the app was on screen
  //   on returning    the app was in the background for a day; the phone found
  //                   a network then, and `online` reaches a hidden WebView
  //                   unreliably. Coming back to the screen is the moment we
  //                   can actually observe.
  //
  // Retrying more than needed is free: the push inserts, and updates instead
  // when the row is already up, so it can never double a majlis.
  useEffect(() => {
    if (!index) return;
    const retry = () => { cloud().then(c => c?.flushUnsyncedSessions(index)); };
    retry();
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [index]);

  // ── زرّ الرجوع في أندرويد ──
  //
  // A WebView answers back by closing the app, mid-majlis included. So it
  // closes what is open instead, one layer at a time, and only a press with
  // nothing left to close reaches the shell — which minimises rather than
  // exits, leaving the session exactly where it was. The state is read from a
  // ref because the listener is registered once and would otherwise keep the
  // first render's answer forever.
  //
  // Which layer a press closes is `back-stack.ts` — a list rather than a run of
  // `if`s inside this listener, because a listener registered once is exactly
  // where a layer added later goes unnoticed. That is how the progress screen
  // and all three matn panels came to answer back by minimising the app.
  const backState = useRef<Partial<Record<SardLayer, boolean>>>({});
  backState.current = {
    reading,
    report: !!report,
    matnReport: !!matnReport,
    setup: setupOpen,
    matnSetup: matnSetupOpen,
    progress: progressOpen,
    session: inSession,
  };
  /**
   * A full-screen child's own layers, answered before this screen's.
   *
   * The muṣḥaf reader raises an index and a search over its page; the majlis
   * raises a search, a sheet and the long-press detail over its own. This
   * screen cannot see any of them, so back was closing the whole reader — or
   * dropping the majlis to the home screen — while the panel the reciter meant
   * to dismiss stayed exactly where it was. A child that has something open
   * says so through this and closes it itself.
   */
  const innerBack = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    let done = false;
    void onHardwareBack(() => {
      if (innerBack.current?.()) return true;
      switch (layerToClose(backState.current)) {
        case 'reading': setReading(false); setReadingAt(null); return true;
        case 'report': setReport(null); return true;
        case 'matnReport': setMatnReport(null); return true;
        case 'setup': setSetupOpen(false); return true;
        case 'matnSetup': setMatnSetupOpen(false); return true;
        case 'progress': setProgressOpen(false); return true;
        // Minimising, not ending — see `back-stack.ts`.
        case 'session': setInSession(false); return true;
        default: return false;
      }
    }).then(unbind => { if (done) unbind(); else off = unbind; });
    return () => { done = true; off?.(); };
  }, []);

  useEffect(() => {
    const persist = () => { if (sessionRef.current) flushSessionSave(sessionRef.current); };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    return () => {
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', persist);
    };
  }, []);

  const exportSheet = useCallback(async (s: RecitationSession) => {
    setSheetFor(s);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = sheetHostRef.current?.firstElementChild as HTMLElement | undefined;
    if (!node) { setSheetFor(null); return; }
    try {
      // On the web a download; inside the Android shell the share sheet, which
      // is where the report was headed anyway. See `@/lib/native`.
      await saveImage(
        await sheetToPng(node),
        `${s.studentName || 'sard'}-${new Date(s.startedAt).toISOString().slice(0, 10)}.png`,
      );
    } finally { setSheetFor(null); }
  }, []);

  /**
   * Dropping a majlis, with a way back.
   *
   * The bin sits in a row of small grey icons beside an export and a report,
   * and a majlis is the one thing on this screen that cannot be made again —
   * the notes were taken while somebody was reciting. A confirm dialog on
   * every delete would tax the deliberate ones to catch the rare slip; an undo
   * taxes nothing and catches it, because the whole record is still in hand
   * when the row disappears.
   */
  const removeSession = useCallback(async (s: RecitationSession) => {
    await deleteSession(s.id).catch(() => { /* already gone */ });
    refreshHistory();
    toast(t('recSessionDeleted'), {
      action: {
        label: t('recUndo'),
        onClick: () => { void saveSession(s).then(refreshHistory).catch(() => { /* storage gone */ }); },
      },
    });
  }, [refreshHistory, t]);

  const active = session && session.status !== 'ended' ? session : null;

  return (
    <div dir={dir} className="min-h-dvh bg-background pb-safe text-foreground">
      {splash && <SardSplash onDone={splashDone} />}
      {/*
        Held back until the splash has gone: two things covering the screen
        at once reads as one broken screen. The wizard decides for itself
        whether it has anything to ask - a returning reciter never sees it.
      */}
      {!splash && <SardWizard />}
      {teacherOpen && (
        <Suspense fallback={null}>
          <TeacherScreen
            onClose={() => setTeacherOpen(false)}
            onAskConsent={() => { setTeacherOpen(false); setConsentOpen(true); }}
          />
        </Suspense>
      )}
      {consentOpen && (
        <Suspense fallback={null}>
          <ConsentSheet open onClose={() => setConsentOpen(false)} />
        </Suspense>
      )}
      {/* The header is sticky, so it pins to the top of the window — under the
          status bar on a phone. Its own padding is kept when the inset is
          zero, which is everywhere but a phone. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 sm:gap-2.5">
          {/* الشعار نفسه الذي في التبويب وعلى الشاشة الرئيسة، لا أيقونة عامّة
              تشبهه. وهو لوحٌ كريميّ مربّع، فزواياه تُدوّر كما في «عن الأداة». */}
          <img
            src={withBase('pwa-192x192.png')}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-xl"
          />
          {/* الشريط ضيّق على الهاتف: بعد الاسم أربعة أزرار، فالسطر الثاني —
              وهو تعريفٌ لا يقرؤه من فتح الأداة أصلًا — يُطوى دون `sm`،
              والاسم يصغر معه درجةً ليبقى سطرًا واحدًا لا يُقصّ. */}
          <div className="min-w-0 flex-1">
            {/* لا `truncate` على الهاتف: «أداة السرد القرآني» تسع سطرًا واحدًا،
                والاسم الإنجليزي أطول فيلتفّ سطرين — وهو أولى من اسمٍ مقصوص
                بثلاث نقاط. ومن `sm` صعودًا يعود القصّ لأن السعة تكفي. */}
            <h1 className="text-[13px] font-extrabold leading-tight sm:truncate sm:text-base">{t('recToolName')}</h1>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{t('recToolTagline')}</p>
          </div>
          <button
            onClick={toggleTheme}
            data-a11y-tap
            aria-label={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
            title={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <LangToggle />
          {/*
            The one screen a store requires an app to carry: what this is, who
            made it, how to reach them, and what happens to what the teacher
            types. It rides the hash like the admin screen, so a static host
            needs no rule for it.
          */}
          <button
            onClick={() => { window.location.hash = '#/about'; }}
            data-a11y-tap
            aria-label={t('recAboutTitle')}
            title={t('recAboutTitle')}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Info size={17} />
          </button>
          {/*
            No link to the reports.

            This screen belongs to whoever is running the majlis — a teacher in
            a halaqa, or a memoriser on their own phone — and the reports are
            the owner's. A button labelled «التقارير» on every device invites
            everyone to a login they cannot pass, which is noise at best.

            The screen is still at `#/admin`, and its lock is not this absence:
            it is the `sard-admin` function, which reads for exactly one email
            and refuses everyone else.
          */}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* An unfinished majlis comes first — it is the one thing that is
            time-sensitive on this screen. */}
        {active && (
          <div className="mb-5 overflow-hidden rounded-2xl border-2 border-primary/40 bg-primary/[0.06] shadow-sm">
            <div className="flex items-center gap-2 bg-primary/10 px-4 py-1.5 text-[11px] font-bold text-foreground/75">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
              {t('recResumeBanner')}
            </div>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-lg font-extrabold">{active.studentName}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {progressPct(active)}% · {formatDuration(activeMs(active), lang)}
                </span>
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progressPct(active)}%` }} />
              </div>
              <button
                onClick={() => setInSession(true)}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] active:scale-[0.99]"
              >
                <Play size={16} />
                {t('recContinueSession')}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setSetupOpen(true)}
          disabled={!index}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary py-4 text-base font-extrabold text-primary-foreground shadow-sm transition-all hover:bg-[hsl(var(--primary-hover))] hover:shadow-md active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
        >
          {index ? <BookOpenCheck size={20} className="transition-transform group-hover:scale-110" /> : <Loader2 size={20} className="animate-spin" />}
          {index ? t('recNewSession') : t('recLoadingMushaf')}
        </button>

        {/*
          The other reason to open this app.

          A majlis is a record: it asks who is reciting and to whom, and every
          tap in it means something afterwards. Most openings are not that —
          they are someone wanting the Book on a screen. So the second button
          goes straight to the pages, asks nothing, and saves nothing but where
          it was left.
        */}
        <button
          onClick={() => setReading(true)}
          disabled={!index}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/25 bg-transparent py-3 text-sm font-bold text-foreground transition-all hover:border-primary/60 hover:bg-primary/[0.04] active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
        >
          <BookOpen size={18} className="text-primary" />
          {t('readMode')}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{t('readModeHint')}</p>

        {/*
          Progress, once a majlis has actually finished. Before that every
          panel behind it would be an empty state, and four of those stacked
          is a worse first impression than no button.
        */}
        {(history?.some(s => s.endedAt !== null) ?? false) && (
          <button
            onClick={() => setProgressOpen(true)}
            data-progress-open
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/25 bg-transparent py-3 text-sm font-bold text-foreground transition-all hover:border-primary/60 hover:bg-primary/[0.04] active:scale-[0.99]"
          >
            <LineChart size={18} className="text-primary" />
            {t('recProgress')}
          </button>
        )}

        {/*
          The halaqa: signing in as a muqri', or joining one as a reciter.

          Offered to everybody and required of nobody. It is the last button
          rather than the first because the commonest visit here — opening the
          muṣḥaf to review alone — never needs it, and a sign-in above the thing
          people came for reads as a wall.
        */}
        <button
          onClick={() => setTeacherOpen(true)}
          data-teacher-open
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/25 bg-transparent py-3 text-sm font-bold text-foreground transition-all hover:border-primary/60 hover:bg-primary/[0.04] active:scale-[0.99]"
        >
          <Users size={18} className="text-primary" />
          {teacherText(lang).rosterTitle}
        </button>

        {/*
          The matn entry, and only when there is a matn to recite.

          Not greyed out and not labelled "coming soon": a matn is offerable
          only once its print is named, and until then the honest interface is
          one that does not mention it.

          Asked of the registry rather than of the loaded texts, because the
          texts are not fetched until this button is pressed — see `useMatns`.
        */}
        {anyMatnReady() && (
          <button
            onClick={() => setMatnSetupOpen(true)}
            data-matn-start
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/25 bg-transparent py-3 text-sm font-bold text-foreground transition-all hover:border-primary/60 hover:bg-primary/[0.04] active:scale-[0.99]"
          >
            <ScrollText size={18} className="text-primary" />
            {t('recMatn')}
          </button>
        )}

        <h2 className="mb-2 mt-8 text-sm font-bold text-muted-foreground">{t('recPastSessions')}</h2>
        {history === null ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-primary" /></div>
        ) : !history.length ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
            <BookOpenCheck className="mx-auto mb-2 text-muted-foreground/40" size={30} />
            <p className="text-sm font-medium text-muted-foreground">{t('recNoSessions')}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t('recNoSessionsHint')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {history.map(s => {
              const vol = index ? volumeSummary(s, index) : null;
              const counts = noteCounts(s);
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-xl border border-border bg-card/70 px-1 py-1 transition-colors hover:border-primary/30 hover:bg-card">
                  {/*
                    The row is the way into the report.

                    It used to be an inert block of text with a small calendar
                    icon beside it that opened one — so the obvious tap, on the
                    name, did nothing, and the way in was a 32px glyph among
                    three identical grey ones. The icon is gone: the row does
                    what it looks like it does, and there is one control fewer
                    to tell apart.
                  */}
                  <button
                    onClick={() => { sessionRef.current = s; setSession(s); setReport(s); }}
                    disabled={!index}
                    data-open-report
                    aria-label={`${t('recReportTitle')} — ${s.studentName}`}
                    className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-start transition-colors enabled:hover:bg-accent/60 disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{s.studentName}</span>
                      {index && isKhatmah(s, index) && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[9px] font-extrabold text-primary-foreground">{t('recKhatmahBadge')}</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString(locale)} · {riwayaName(s.riwayaId, lang)}
                      {vol ? ` · ${unit(vol.pages, 'recPagesUnit')}` : ''} · {unit(coveredCount(s.covered), 'recAyahsUnit')}
                      {' · '}{unit(counts.hesitation + counts.memory + counts.tajweed + counts.shakl, 'recNotesUnit')}
                    </div>
                  </button>
                  <button
                    onClick={() => exportSheet(s)}
                    disabled={!!sheetFor || !index}
                    data-a11y-tap
                    aria-label={t('recExportReportImage')}
                    title={t('recExportReportImage')}
                    className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-40"
                  >
                    {sheetFor?.id === s.id ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                  </button>
                  <button
                    onClick={() => removeSession(s)}
                    data-a11y-tap
                    aria-label={`${t('recDelete')} — ${s.studentName}`}
                    title={t('recDelete')}
                    className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Suspense fallback={null}>
        {reading && index && (
          <MushafReader
            index={index}
            back={innerBack}
            openAt={readingAt}
            onClose={() => { setReading(false); setReadingAt(null); }}
          />
        )}
        {setupOpen && (
          <RecitationSetupModal
            open={setupOpen}
            onClose={() => setSetupOpen(false)}
            onStart={handleStart}
            roster={roster}
            rosterLabel={teacherText(lang).rosterTitle}
          />
        )}
        {session && index && inSession && (
          <RecitationOverlay
            session={session}
            index={index}
            back={innerBack}
            onChange={handleChange}
            onMinimize={() => setInSession(false)}
            onEnd={handleEnd}
          />
        )}
        {progressOpen && index && history && (
          <ProgressScreen
            sessions={history}
            index={index}
            onClose={() => setProgressOpen(false)}
            /* «صفحة ٢٩٤، متأخّرة ستّة أيام» and no way to open it was a plan
               you had to carry in your head to the read button. */
            onOpenPage={page => {
              setProgressOpen(false);
              setReadingAt(page);
              setReading(true);
            }}
          />
        )}
        {matnSetupOpen && (
          <MatnSetupModal
            open={matnSetupOpen}
            available={matns}
            onClose={() => setMatnSetupOpen(false)}
            onStart={startMatn}
          />
        )}
        {matnSession && matnMatn && (
          <MatnOverlay
            session={matnSession}
            matn={matnMatn.matn}
            back={innerBack}
            onChange={changeMatn}
            onEnd={endMatn}
          />
        )}
        {/*
          The report, shown as the sheet itself rather than wrapped in the
          majlis's modal: that modal is built around a certificate, juzʾ and
          pages, none of which a matn has.
        */}
        {matnReport && matnReportMatn && (
          <div
            className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center"
            onClick={() => setMatnReport(null)}
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="mb-2 flex justify-end">
                <button
                  onClick={() => setMatnReport(null)}
                  data-a11y-tap
                  aria-label={t('close')}
                  title={t('close')}
                  className="flex items-center justify-center rounded-lg bg-card p-1.5 text-muted-foreground shadow hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>
              <MatnReportSheet session={matnReport} abwab={matnReportMatn.matn.abwab} />
              {/* Sound cannot ride in the exported image, so it sits beside it. */}
              <div className="mt-3 rounded-2xl bg-card p-3">
                <CorrectionList
                  corrections={sessionCorrections(matnReport)}
                  label={(pos: MatnPosition) => `${t('recBayt')} ${pos.bayt}`}
                />
              </div>
            </div>
          </div>
        )}
        {report && index && (
          <RecitationReportModal
            session={report}
            index={index}
            history={history ?? undefined}
            onClose={() => setReport(null)}
            onReopen={handleReopen}
          />
        )}
      </Suspense>

      {/* Off-screen host for the sheet being rasterised — html2canvas cannot
          measure a display:none node, so it is parked instead of hidden. */}
      <div ref={sheetHostRef} aria-hidden style={{ position: 'fixed', top: 0, insetInlineStart: '-10000px', width: 560 }}>
        {sheetFor && index && <RecitationReportSheet session={sheetFor} index={index} />}
      </div>
    </div>
  );
};

export default SardApp;
