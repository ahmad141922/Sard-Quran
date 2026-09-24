/**
 * Recording a short spoken correction, and stopping on its own.
 *
 * Deliberately small: start, stop, and a running length. Everything harder
 * about audio on the web is handled by *not doing it* — no waveform, no
 * pause/resume, no format negotiation beyond asking the browser what it can
 * produce.
 *
 * Three things this has to get right, because each one bites in the field:
 *
 * - **The stream is released.** A microphone left open shows a recording
 *   indicator on the device for the rest of the session and, on some Android
 *   builds, blocks other apps. Every exit path stops the tracks.
 * - **It stops itself.** A teacher who forgets to press stop would otherwise
 *   record until the tab closes; `MAX_CLIP_MS` ends it and keeps what was
 *   said up to then.
 * - **Permission refusal is an answer, not a crash.** A halaqa on a borrowed
 *   tablet will say no sometimes, and the session must carry on without it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_CLIP_MS } from './audio-store';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export type RecorderError = 'denied' | 'unsupported' | 'failed';

export interface AudioRecorder {
  /** True from the moment recording begins until the clip is handed back. */
  recording: boolean;
  /** Milliseconds so far, for a running counter. */
  elapsedMs: number;
  error: RecorderError | null;
  start: () => Promise<boolean>;
  /** Resolves with the clip, or null if nothing usable was captured. */
  stop: () => Promise<Recording | null>;
  cancel: () => void;
}

/** Whatever this browser will actually produce; the store records which. */
function pickMimeType(): string | undefined {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR?.isTypeSupported) return undefined;
  // Opus where it exists — an order of magnitude smaller than the mp4 Safari
  // falls back to, and this is stored on a phone.
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MR.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function useAudioRecorder(): AudioRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsed] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Every teardown path goes through here, so the microphone always closes. */
  const release = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (capRef.current) { clearTimeout(capRef.current); capRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  // A component unmounting mid-recording — the overlay closed, the session
  // ended — must not leave the microphone live.
  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    setError(null);
    const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (!MR || !navigator.mediaDevices?.getUserMedia) { setError('unsupported'); return false; }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Refused, or no microphone. Either way the majlis carries on.
      setError('denied');
      return false;
    }

    try {
      const mimeType = pickMimeType();
      const recorder = new MR(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.start();

      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      timerRef.current = setInterval(
        () => setElapsed(Date.now() - startedAtRef.current), 200,
      );
      // Stops itself rather than running until the tab closes.
      capRef.current = setTimeout(() => {
        try { recorderRef.current?.stop(); } catch { /* already stopped */ }
      }, MAX_CLIP_MS);
      return true;
    } catch {
      stream.getTracks().forEach(t => t.stop());
      setError('failed');
      return false;
    }
  }, []);

  const stop = useCallback(async (): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    const durationMs = Date.now() - startedAtRef.current;

    const clip = await new Promise<Recording | null>(resolve => {
      recorder.onstop = () => {
        const parts = chunksRef.current;
        chunksRef.current = [];
        if (!parts.length) { resolve(null); return; }
        const mimeType = recorder.mimeType || parts[0].type || 'audio/webm';
        resolve({ blob: new Blob(parts, { type: mimeType }), mimeType, durationMs });
      };
      try { recorder.stop(); } catch { resolve(null); }
    });

    release();
    return clip;
  }, [release]);

  /** Throw away what was captured — the teacher changed their mind. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    chunksRef.current = [];
    if (recorder) {
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    release();
  }, [release]);

  return { recording, elapsedMs, error, start, stop, cancel };
}
