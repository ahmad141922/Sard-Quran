/**
 * The teacher's spoken corrections, stored on the device.
 *
 * Everything else this app keeps is small JSON: a session of two hours is a
 * few kilobytes. Audio is a different order of thing — ten seconds of speech
 * is tens of kilobytes, and a halaqa that records twenty corrections a night
 * writes more in a week than the entire rest of the database holds. Three
 * consequences shape this file:
 *
 * - **Clips live in their own store.** A session is read on every launch to
 *   list past majālis; dragging its audio along would make that read hundreds
 *   of times heavier for a screen that shows none of it.
 * - **Clips are addressed by id from the session**, never embedded in it, so
 *   the session stays a small record that can be mirrored, exported and read
 *   without pulling megabytes behind it.
 * - **Deleting a session deletes its audio.** Orphaned blobs are invisible and
 *   permanent, and the store is indexed by session precisely so they can be
 *   found again.
 *
 * Nothing here uploads. A correction is a recording of a child's voice being
 * taught, and it stays on the device that made it until there is a deliberate
 * decision otherwise.
 */

import { idbRequest, idbGetAll } from './board-storage';

const STORE = 'recitation_audio';

/** A recording is capped rather than left open-ended — see the note above. */
export const MAX_CLIP_MS = 60_000;

export interface AudioClip {
  id: string;
  /** Which majlis it belongs to, so it can be deleted along with it. */
  sessionId: string;
  blob: Blob;
  /** What the recorder produced — `webm/opus` on Chrome, `mp4` on Safari. */
  mimeType: string;
  durationMs: number;
  bytes: number;
  at: number;
}

export const putClip = (clip: AudioClip) =>
  idbRequest(STORE, 'readwrite', store => store.put(clip));

export const getClip = (id: string) =>
  idbRequest<AudioClip | undefined>(STORE, 'readonly', store => store.get(id));

export const deleteClip = (id: string) =>
  idbRequest(STORE, 'readwrite', store => store.delete(id));

/** Every clip of one majlis — for the report, and for deleting it whole. */
export async function clipsOfSession(sessionId: string): Promise<AudioClip[]> {
  const all = await idbGetAll<AudioClip>(STORE, store => store.getAll());
  return all.filter(c => c.sessionId === sessionId);
}

/**
 * Drops every clip of a session.
 *
 * Called when a majlis is deleted. Deliberately tolerant: a clip that has
 * already gone is not an error, and one that fails to go must not stop the
 * rest — a half-deleted session is better than a stuck one.
 */
export async function deleteClipsOfSession(sessionId: string): Promise<void> {
  const clips = await clipsOfSession(sessionId);
  await Promise.all(clips.map(c => deleteClip(c.id).catch(() => undefined)));
}

/**
 * How much room the recordings are taking, in bytes.
 *
 * Worth showing somebody eventually: a browser evicts storage silently when a
 * device runs short, and the first anyone would know of it is a correction
 * that no longer plays.
 */
export async function audioBytesUsed(): Promise<number> {
  const all = await idbGetAll<AudioClip>(STORE, store => store.getAll());
  return all.reduce((sum, c) => sum + (c.bytes || 0), 0);
}

/**
 * A URL for playing a clip, and the way to let it go.
 *
 * Object URLs are held by the document until revoked; a report listing twenty
 * corrections would otherwise pin every one of them in memory for as long as
 * the tab lives.
 */
export function clipUrl(clip: AudioClip): { url: string; release: () => void } {
  const url = URL.createObjectURL(clip.blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}
