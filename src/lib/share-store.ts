/**
 * Where a sealed report is kept, and how it comes back.
 *
 * Deliberately a narrow interface over two calls — put ciphertext under an id,
 * get ciphertext by id. Nothing here knows what a report is, and nothing here
 * can read one: by the time bytes arrive they are already encrypted, and the
 * key never left the browser that sealed them (see `share-link.ts`).
 *
 * That narrowness is the point. Whatever ends up holding these rows — the
 * Supabase project already in use, an R2 bucket, something else — it is a
 * dumb store of opaque blobs with expiry dates, and swapping it is swapping
 * one implementation of this interface.
 *
 * ## What the table needs to be
 *
 * Two columns of substance and one guard, and it is the owner's to create —
 * this file will not migrate anybody's database:
 *
 * ```sql
 * create table shared_reports (
 *   id          text primary key,
 *   payload     text        not null,      -- ciphertext; unreadable here
 *   expires_at  timestamptz not null,
 *   created_at  timestamptz not null default now()
 * );
 * -- Anyone may insert and anyone may read a row they can name. That is safe
 * -- precisely because naming one means holding a 128-bit id, and reading one
 * -- means holding a key this table has never seen.
 * ```
 *
 * A row that has outlived `expires_at` should be swept on a schedule. Until
 * that exists, `fetchSealed` refuses an expired row on the way out, so a stale
 * link stops working even while its bytes are still sitting there.
 */

import { hasExpired } from './share-link';

export interface StoredReport {
  id: string;
  payload: string;
  expiresAt: number;
}

export interface ShareStore {
  put(record: StoredReport): Promise<void>;
  get(id: string): Promise<StoredReport | null>;
}

export class ShareError extends Error {}

/**
 * A store that keeps nothing beyond this tab.
 *
 * The default, and what runs until a real one is configured. It makes the
 * whole flow — seal, link, open — work end to end on one device, which is
 * enough to build against and to test, and it fails honestly rather than
 * pretending a link will reach anybody else.
 */
export function memoryShareStore(): ShareStore {
  const rows = new Map<string, StoredReport>();
  return {
    async put(record) { rows.set(record.id, record); },
    async get(id) { return rows.get(id) ?? null; },
  };
}

let store: ShareStore = memoryShareStore();

/**
 * Swapped in once a real backend is configured — see the note above.
 *
 * `set`, not `use`: this is a plain module-level assignment, and a `use…`
 * name in a React codebase claims to be a hook and is linted as one.
 */
export function setShareStore(next: ShareStore): void {
  store = next;
}

export async function putSealed(record: StoredReport): Promise<void> {
  await store.put(record);
}

/**
 * Fetches a sealed report, refusing one whose link has expired.
 *
 * Checked here rather than trusted to a sweep: the sweep may not have run,
 * and a link is meant to stop working on the day it says it will.
 */
export async function fetchSealed(id: string, now = Date.now()): Promise<StoredReport | null> {
  const row = await store.get(id);
  if (!row) return null;
  return hasExpired(row.expiresAt, now) ? null : row;
}
