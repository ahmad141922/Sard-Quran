/**
 * The shaykh's corrections, played back.
 *
 * The point of recording them is this screen: the student hears their own
 * teacher saying the right reading, at the verse it belongs to, while
 * reviewing later. A recording nobody can play back is only storage.
 *
 * Clips are fetched one at a time, when asked for. A report of twenty
 * corrections that loaded every blob on mount would pull a megabyte into
 * memory to show a list of numbers.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Trash2 } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { getClip } from '@/lib/audio-store';
import type { SessionCorrection } from '@/lib/recitation-session';

interface Props<P> {
  corrections: SessionCorrection<P>[];
  /** How a place is written for the reader — the caller knows its text. */
  label: (position: P) => string;
  /** The words the shaykh was correcting — null where they are not certain. */
  textOf?: (position: P) => string | null;
  /** The face that encoding needs, when one is required. */
  textFont?: string;
  onRemove?: (correction: SessionCorrection<P>) => void;
  /**
   * Inside a place that already names itself: drops the heading and the
   * repeated label, leaving the play button and the length.
   */
  compact?: boolean;
}

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

export function CorrectionList<P>({
  corrections, label, textOf, textFont, onRemove, compact,
}: Props<P>) {
  const { t } = useI18n();
  if (!corrections.length) return null;

  return (
    <div className={compact ? 'mt-1' : 'mt-4'} data-corrections>
      {!compact && (
        <div className="mb-1.5 text-xs font-bold text-muted-foreground">
          {t('recCorrections')} · {corrections.length}
        </div>
      )}
      <ul className="space-y-1">
        {corrections.map(c => (
          <CorrectionRow
            key={c.id}
            correction={c}
            label={compact ? t('recCorrections') : label(c.position)}
            text={compact ? null : textOf?.(c.position) ?? null}
            textFont={textFont}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </div>
  );
}

function CorrectionRow<P>({ correction, label, text, textFont, onRemove }: {
  correction: SessionCorrection<P>;
  label: string;
  text: string | null;
  textFont?: string;
  onRemove?: (c: SessionCorrection<P>) => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Held so the object URL can be revoked; a report left open would otherwise
  // pin every clip it ever played for the life of the tab.
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const play = useCallback(async () => {
    if (url) { audioRef.current?.play().catch(() => undefined); return; }
    if (!correction.audioId) { setMissing(true); return; }
    const clip = await getClip(correction.audioId).catch(() => undefined);
    // Evicted by the browser, or never saved. Say so rather than showing a
    // control that does nothing when pressed.
    if (!clip) { setMissing(true); return; }
    const next = URL.createObjectURL(clip.blob);
    urlRef.current = next;
    setUrl(next);
  }, [url, correction.audioId]);

  // Autoplay once the source arrives, so one press is one play.
  useEffect(() => {
    if (url) audioRef.current?.play().catch(() => undefined);
  }, [url]);

  return (
    <li
      data-correction={correction.id}
      className="flex items-center gap-2 rounded-lg border border-emerald-900/10 bg-white/50 px-2 py-1 text-xs dark:border-emerald-100/10 dark:bg-white/[0.04]"
    >
      <button
        type="button"
        data-play
        onClick={play}
        disabled={missing}
        aria-label={`${t('recCorrections')} — ${label}`}
        className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-600/10 disabled:opacity-40 dark:text-emerald-400"
      >
        <Play size={14} />
      </button>
      <span className="min-w-0 flex-1">
        <span className="font-bold">{label}</span>
        <span className="text-muted-foreground"> · {seconds(correction.durationMs)}</span>
        {missing && <span className="text-muted-foreground"> · —</span>}
        {/* The words being corrected, so the row says what it is about. */}
        {text && (
          <p
            data-ayah-text
            dir="rtl"
            style={textFont ? { fontFamily: textFont } : undefined}
            className="mt-0.5 text-[15px] leading-[2.1] text-foreground/90"
          >
            {text}
          </p>
        )}
      </span>
      {url && <audio ref={audioRef} src={url} preload="none" />}
      {onRemove && (
        <button
          type="button"
          data-remove
          onClick={() => onRemove(correction)}
          aria-label={t('recDelete')}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}

export default CorrectionList;
