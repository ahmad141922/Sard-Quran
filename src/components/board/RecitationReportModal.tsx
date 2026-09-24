import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Copy, Check, Image as ImageIcon, LayoutGrid, ClipboardList, Award, Share2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useFloatingRect } from './useFloatingRect';
import { loadQuranFont, surahName } from '@/lib/quran-data';
import type { QuranIndex } from '@/lib/quran-index';
import {
  activeMs, canIssueCertificate, formatDuration, formatVolumeAr, groupedNoteLines, isKhatmah,
  noteCounts, notesPerPage, pausedMs, progressPct, sessionCorrections, surahPressure, volumeSummary,
  type NoteKind, type RecitationSession,
} from '@/lib/recitation-session';
import { duaForSession, encouragement, type Lang } from '@/lib/recitation-duas';
import { getMushaf, riwayaName } from '@/lib/mushaf/registry';
import { useMushafPageIndex } from '@/lib/mushaf/page-index';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
import { pageOfAnchorIn } from '@/lib/mushaf/position';
import {
  compareSessions, previousSessionOf, reviewPlaces, sessionFigures, worthACard,
} from '@/lib/recitation-review';
import { NOTE_LABEL_KEY, NOTE_STYLE, positionLabelIn, reportRows } from './recitation-shared';
import { RecitationReportSheet, sheetToPng } from './RecitationReportSheet';
import { RecitationCertificate } from './RecitationCertificate';
import CorrectionList from './CorrectionList';
import ReviewPlaces from './ReviewPlaces';
import { RECITATION_REVIEW_SECTION } from '@/lib/feature-flags';
import { loadMutashabihat, type MutashabihatIndex } from '@/lib/mutashabihat';
import SessionComparison from './SessionComparison';
import AchievementCard from './AchievementCard';
import ShareReportButton, { type SharedReport } from './ShareReportButton';
import { certificateFields, waitForPaintable } from '@/lib/recitation-certificate';
import { saveImage } from '@/lib/native';

interface Props {
  session: RecitationSession;
  index: QuranIndex;
  /**
   * Every finished majlis on the device, so this one can be set against the
   * same reciter's last. Optional: a report opened where the history is not
   * to hand simply shows no comparison.
   */
  history?: RecitationSession[];
  onClose: () => void;
  /** Omitted by the standalone tool, which has no board to insert onto. */
  onInsertImage?: (dataUrl: string) => void;
  /** Undo an accidental "end session" — cheaper than a confirm dialog every time. */
  onReopen: () => void;
}

const BREAK_THRESHOLD_MS = 2 * 60 * 1000;

const RecitationReportModal: React.FC<Props> = ({ session, index, history, onClose, onInsertImage, onReopen }) => {
  const { t, dir, lang } = useI18n();
  const sheetRef = useRef<HTMLDivElement>(null);
  const certRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const counts = noteCounts(session);
  // The book the majlis was recited from, which is not necessarily the one
  // the reader has selected now.
  const sessionEdition = getMushaf(session.mushafId) ?? null;
  const editionPages = useMushafPageIndex(sessionEdition);
  const book = useMemo(() => {
    if (!sessionEdition) return null;
    return editionBook(sessionEdition, editionPages, canonicalBookFromQuranIndex(index));
  }, [sessionEdition, editionPages, index]);

  // Pages are counted in the book the majlis was read from.
  const pageOf = useMemo(() => {
    if (!book) return undefined;
    return pageOfAnchorIn(book, canonicalBookFromQuranIndex(index));
  }, [book, index]);

  const volume = useMemo(() => volumeSummary(session, index, pageOf), [session, index, pageOf]);
  const pressure = useMemo(() => surahPressure(session, index), [session, index]);
  const at = session.endedAt ?? Date.now();
  const active = activeMs(session, at);
  const paused = pausedMs(session, at);
  const showPaused = paused > BREAK_THRESHOLD_MS;
  const perPage = notesPerPage(session, index, pageOf);
  const khatmah = useMemo(() => isKhatmah(session, index), [session, index]);
  const dua = useMemo(() => duaForSession(session.id), [session.id]);
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const cheer = encouragement(
    { khatmah, progressPct: progressPct(session), notesPerPage: perPage },
    lang as Lang,
  );

  // Printed as they were recorded: the edition's own numbers, never converted
  // into another book's for display.
  // A majlis that changed muṣḥaf half way has two numberings in one line, so
  // each end says which book it is in when they differ.
  const startLabel = positionLabelIn(session.goal.start, session.mushafId);
  const endLabel = positionLabelIn(session.current, session.mushafId);

  const volumeLine = useMemo(() => {
    if (lang === 'ar') return formatVolumeAr(volume);
    const parts: string[] = [];
    if (volume.fullJuz) parts.push(`${volume.fullJuz} ${t('recJuzPlural')}`);
    if (volume.extraPages) parts.push(`${volume.extraPages} ${t('recPagesUnit')}`);
    if (!parts.length) parts.push(`${volume.pages} ${t('recPagesUnit')}`);
    return `${parts.join(' + ')} · ${volume.ayahs} ${t('recAyahsUnit')}`;
  }, [volume, t, lang]);

  // Worked out once, here: the certificate itself renders finished strings so
  // the same component can also run on the page a scanned code opens.
  /**
   * Whether this session may be certified at all.
   *
   * A solo session has no witness, so it ends at the report. The button is not
   * merely hidden: the off-screen certificate node is not rendered either, so
   * there is nothing to rasterise even by accident.
   */
  /**
   * This majlis against the same reciter's last, when there is one.
   *
   * Pages are the unit both sides are measured in — the one thing that makes
   * two sessions of different lengths comparable at all.
   */
  const comparison = useMemo(() => {
    const previous = history ? previousSessionOf(session, history) : undefined;
    if (!previous) return null;
    const pagesOf = (s: RecitationSession) => volumeSummary(s, index, pageOf).pages;
    return compareSessions(
      sessionFigures(session, pagesOf(session)),
      sessionFigures(previous, pagesOf(previous)),
    );
  }, [session, history, index, pageOf]);

  /**
   * Near-twins, once the index arrives. Loaded here rather than at boot: it is
   * only ever wanted by a report, and only by one that recorded a fault.
   */
  const [similar, setSimilar] = useState<MutashabihatIndex | null>(null);
  // Only fetched for the section that displays it — otherwise every report
  // would pull the similar-verse index down for nothing.
  useEffect(() => {
    if (!RECITATION_REVIEW_SECTION) return;
    loadMutashabihat().then(setSimilar);
  }, []);

  /**
   * The muṣḥaf face, ensured here and not assumed.
   *
   * The verses printed below are in a private-use encoding that renders as
   * boxes in any other font. A report opened straight from the history — a
   * fresh tab, no majlis run in it — would otherwise have no reason to have
   * loaded it. Failures resolve: a fallback face is bad, a blank screen worse.
   */
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    loadQuranFont('hafs').then(() => setFontReady(true)).catch(() => setFontReady(true));
  }, []);

  const certifiable = canIssueCertificate(session);

  const certificate = useMemo(
    () => certificateFields(session, index, riwayaName(session.riwayaId, lang), lang),
    [session, index],
  );

  /**
   * What a link actually carries.
   *
   * Not the session: that holds both sides' phone numbers, the operator's
   * role, every anchor, and sync bookkeeping — none of which a parent opening
   * a link needs. Built from what the report already prints, so nothing
   * travels that is not already on this screen.
   */
  const shared: SharedReport = useMemo(() => ({
    student: session.studentName,
    instructor: session.instructorName || undefined,
    amount: certificate.amount,
    minutes: Math.round(active / 60000),
    at: session.endedAt ?? session.lastSeenAt ?? Date.now(),
    places: reviewPlaces(session, p => p.anchor.id).map(place => ({
      label: positionLabelIn(place.position, session.mushafId),
      kinds: [
        ...place.notes.map(n => t(NOTE_LABEL_KEY[n.kind])),
        ...(place.marks.length ? [t(NOTE_LABEL_KEY.mark)] : []),
      ],
      detail: place.notes.find(n => n.detail)?.detail,
      // Imlāʾī, which needs no particular font — see `SharedReport.places`.
      text: place.position.anchor.exact
        ? index.verseById(place.position.anchor.id)?.aya_text_emlaey
        : undefined,
    })),
  }), [session, certificate.amount, active, t]);


  /** What this session lists — the third row is a mark when nobody listened. */
  const rows = reportRows(session).map(r => ({
    // The words noted on each verse, as «(الكلمة ٣)» after its number.
    ...r,
    lines: groupedNoteLines(
      r.entries, session.mushafId,
      words => t('recWordN').replace('{n}', words.map(w => w + 1).join('، ')),
    ),
  }));

  const asText = useCallback(() => {
    const lines: string[] = [];
    lines.push(`${t('recReportTitle')} — ${session.studentName}`);
    if (khatmah) lines.push(t('recKhatmahDone'));
    lines.push(`${t('recRecited')}: ${volumeLine}`);
    lines.push(`${t('recFrom')} ${startLabel} ${t('recTo')} ${endLabel}`);
    lines.push(`${t('recListeningTime')}: ${formatDuration(active, lang)}`);
    lines.push(`${t('recFromTo')}: ${clock(session.startedAt)} — ${clock(at)}`);
    if (showPaused) lines.push(`${t('recPausedTime')}: ${formatDuration(paused, lang)}`);
    lines.push('');
    for (const row of rows) {
      lines.push(`${t(NOTE_LABEL_KEY[row.slot])}: ${row.count}${row.lines.length ? ` — ${row.lines.join(' · ')}` : ''}`);
    }
    if (pressure.items.length) {
      lines.push('');
      lines.push(`${t('recNeedsReview')}: ${pressure.items.map(p => p.name).join(' · ')}`);
    }
    lines.push('');
    lines.push(cheer);
    lines.push(dua.ar);
    return lines.join('\n');
  }, [t, session.studentName, volumeLine, startLabel, endLabel, active, lang, rows,
      pressure.items, khatmah, clock, session.startedAt, at, showPaused, paused, cheer, dua]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the sheet is still on screen to read */ }
  }, [asText]);

  const handleSaveImage = useCallback(async () => {
    if (!sheetRef.current) return;
    setBusy(true);
    try {
      await saveImage(
        await sheetToPng(sheetRef.current),
        `${session.studentName || 'recitation'}-${new Date(session.startedAt).toISOString().slice(0, 10)}.png`,
      );
    } finally { setBusy(false); }
  }, [session.studentName, session.startedAt]);

  /**
   * The certificate is rasterised from a node parked off-screen: it is not
   * part of the report on screen, and `display: none` cannot be measured.
   * Its marks and its face are awaited first — html2canvas draws what is
   * loaded at the instant it runs, and would otherwise export blank squares
   * in a fallback font.
   */
  const handleCertificate = useCallback(async () => {
    if (!certRef.current) return;
    setBusy(true);
    try {
      await waitForPaintable(certRef.current);
      await saveImage(
        await sheetToPng(certRef.current),
        `شهادة-${session.studentName || 'سرد'}-${new Date(session.startedAt).toISOString().slice(0, 10)}.png`,
      );
    } finally { setBusy(false); }
  }, [session.studentName, session.startedAt]);

  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * The three things the card says. `amount` is already a finished phrase, so
   * the card prints what the certificate would have said without pretending
   * to be one.
   */
  const achievement = useMemo(() => ({
    what: certificate.amount,
    minutes: Math.round(active / 60000),
    toReview: reviewPlaces(session, p => p.anchor.id).length,
  }), [certificate.amount, active, session]);

  const cardOffered = worthACard(session.covered, achievement.minutes);

  const handleCard = useCallback(async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      await waitForPaintable(cardRef.current);
      await saveImage(
        await sheetToPng(cardRef.current),
        `${session.studentName || 'سرد'}-${new Date(session.startedAt).toISOString().slice(0, 10)}.png`,
      );
    } finally { setBusy(false); }
  }, [session.studentName, session.startedAt]);

  const handleInsert = useCallback(async () => {
    if (!sheetRef.current || !onInsertImage) return;
    setBusy(true);
    try {
      onInsertImage(await sheetToPng(sheetRef.current));
      onClose();
    } finally { setBusy(false); }
  }, [onInsertImage, onClose]);

  // Above the guard: a hook that runs only while the panel is open is one
  // React counts differently between renders, and it throws on the render
  // where the panel appears.
  const frame = useFloatingRect({ id: 'recreport', defaultWidth: 600, defaultHeight: 720, minWidth: 360, minHeight: 380 });

  return (
    <div
      className="z-[201] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      style={frame.style}
      onPointerDown={e => e.stopPropagation()}
      role="dialog"
      aria-modal="false"
      aria-label={t('recReportTitle')}
    >
      {frame.resizeHandles}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        dir={dir}
      >
        <div {...frame.dragHandleProps} className="flex select-none items-center justify-between border-b border-border bg-accent/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="text-emerald-600" />
            <span className="font-bold text-foreground">{t('recReportTitle')}</span>
          </div>
          <button
            onClick={onClose}
            data-a11y-tap
            aria-label={t('close')}
            title={t('close')}
            className="-me-1.5 flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <RecitationReportSheet ref={sheetRef} session={session} index={index} />

          {/*
            The shaykh's own voice, at the verses he said it. Outside the
            exported sheet: an image cannot carry sound, and pretending
            otherwise would lose the corrections on the way to a parent.
          */}
          {/*
            One line per verse, with everything that happened at it — the turn
            from "three lists by kind" to "what to go and review".
          */}
          {RECITATION_REVIEW_SECTION && (
            <ReviewPlaces
              places={reviewPlaces(session, p => p.anchor.id)}
              label={p => positionLabelIn(p, session.mushafId)}
              similar={similar}
              /*
                The dataset is numbered in Ḥafṣ, which is the anchor's own
                scheme — so the anchor is what it is looked up by, never the
                displayed number. A Warsh position would otherwise be matched
                against a verse that is not the one the teacher saw.
              */
              canonicalOf={p => (p.anchor.exact
                ? { surah: p.anchor.surah, ayah: p.anchor.ayah }
                : null)}
              anchorOf={p => p.anchor.id}
              /*
                The Uthmani text, in the encoding the muṣḥaf font renders — the
                same words the teacher was looking at. Shown only where the
                anchor is exact: a Warsh position converted approximately would
                otherwise print a Ḥafṣ verse that is not the one they saw.
              */
              textOf={p => (fontReady && p.anchor.exact
                ? index.verseById(p.anchor.id)?.aya_text ?? null
                : null)}
              textFont="HafsSmartCanvas, HafsSmart, serif"
            />
          )}

          {comparison && <SessionComparison comparison={comparison} />}

          {/* Corrections are shown on their own place, above. */}

          {/* Encrypted, expiring, and only where a link would actually work. */}
          <ShareReportButton report={shared} />

          {/* Counts legend, outside the exported sheet */}
          <div className="mt-3 flex flex-wrap gap-2">
            {rows.map(row => (
              <span key={row.slot} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${NOTE_STYLE[row.slot].soft} ${NOTE_STYLE[row.slot].text}`}>
                <span className={`h-2 w-2 rounded-full ${NOTE_STYLE[row.slot].dot}`} aria-hidden />
                {t(NOTE_LABEL_KEY[row.slot])} {row.count}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border bg-accent/20 p-3">
          <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-colors hover:bg-accent">
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copied ? t('recCopied') : t('recCopyText')}
          </button>
          <button onClick={handleSaveImage} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50">
            <ImageIcon size={14} />
            {t('recSaveImage')}
          </button>
          {/* The one thing here meant for the student rather than the teacher —
              and only where somebody other than the reciter was listening. */}
          {certifiable && (
            <button onClick={handleCertificate} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50">
              <Award size={14} />
              {t('recCertificate')}
            </button>
          )}
          {cardOffered && (
            <button onClick={handleCard} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50">
              <Share2 size={14} />
              {t('recCard')}
            </button>
          )}
          {onInsertImage && (
            <button onClick={handleInsert} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50">
              <LayoutGrid size={14} />
              {t('recInsertBoard')}
            </button>
          )}
          <button onClick={onReopen} className="rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
            {t('recReopen')}
          </button>
        </div>
      </div>

      {/* Parked off-screen rather than hidden: html2canvas cannot measure a
          `display: none` node, and this one is only ever rasterised. */}
      <div aria-hidden style={{ position: 'fixed', top: 0, insetInlineStart: '-10000px', width: 560 }}>
        {certifiable && <RecitationCertificate ref={certRef} fields={certificate} />}
        {cardOffered && (
          <AchievementCard
            ref={cardRef}
            studentName={session.studentName}
            achievement={achievement}
            minutesLabel={formatDuration(active, lang)}
          />
        )}
      </div>
    </div>
  );
};

export default RecitationReportModal;
