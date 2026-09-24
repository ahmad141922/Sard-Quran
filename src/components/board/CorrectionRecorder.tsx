/**
 * The record button, and everything it takes to turn a held breath into a
 * stored correction.
 *
 * Shared by both overlays because the act is the same one wherever it happens:
 * the teacher is already looking at a place — the marker is on it — and says
 * out loud what the right reading is. The clip is written first and the
 * session is told second, so a session never points at a clip that is not
 * there.
 *
 * Failure is quiet on purpose. A refused microphone, a browser that cannot
 * record, a write that does not land — none of them may interrupt a majlis,
 * and each leaves the recitation exactly where it was.
 */

import React, { useCallback, useState } from 'react';
import { Mic, Square } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { MAX_CLIP_MS, putClip } from '@/lib/audio-store';
import { useAudioRecorder } from '@/lib/use-audio-recorder';
import { makeCorrection, type SessionCorrection } from '@/lib/recitation-session';

interface Props<P> {
  /** The majlis this belongs to — clips are deleted along with it. */
  sessionId: string;
  /** Where the marker is now. The correction is fixed here. */
  position: P;
  onRecorded: (correction: SessionCorrection<P>) => void;
  disabled?: boolean;
}

const seconds = (ms: number) => `${Math.floor(ms / 1000)}s`;

export function CorrectionRecorder<P>({ sessionId, position, onRecorded, disabled }: Props<P>) {
  const { t } = useI18n();
  const { recording, elapsedMs, error, start, stop } = useAudioRecorder();
  const [saving, setSaving] = useState(false);

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      const clip = await stop();
      if (!clip) return;

      const id = `ac${Date.now().toString(36)}`;
      // The clip lands first. If this throws, the correction is still recorded
      // — the teacher did say it — but without a pointer to audio that is not
      // there, which `audioId: undefined` states plainly.
      let audioId: string | undefined;
      try {
        await putClip({
          id,
          sessionId,
          blob: clip.blob,
          mimeType: clip.mimeType,
          durationMs: clip.durationMs,
          bytes: clip.blob.size,
          at: Date.now(),
        });
        audioId = id;
      } catch { /* storage full or evicted — see above */ }

      onRecorded(makeCorrection(position, clip.durationMs, audioId));
    } finally {
      setSaving(false);
    }
  }, [stop, sessionId, position, onRecorded]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-record
        disabled={disabled || saving}
        onClick={() => (recording ? finish() : start())}
        aria-label={recording ? t('recStopRecording') : t('recRecordCorrection')}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
          recording
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        {recording ? <Square size={13} /> : <Mic size={15} />}
        {recording && (
          <span className="tabular-nums" data-elapsed>
            {seconds(elapsedMs)} / {seconds(MAX_CLIP_MS)}
          </span>
        )}
      </button>

      {/* Said once, quietly, and never in the way of the page. */}
      {error && (
        <span data-mic-error className="text-[10px] leading-tight text-muted-foreground">
          {error === 'denied' ? t('recMicDenied') : t('recMicUnsupported')}
        </span>
      )}
    </div>
  );
}

export default CorrectionRecorder;
