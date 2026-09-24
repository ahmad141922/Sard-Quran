/**
 * The Supabase implementation of `ShareStore`.
 *
 * Kept in its own file so `share-store.ts` stays free of any backend, and so
 * the whole sharing flow can be built and tested without one — see the memory
 * store there.
 *
 * This talks to a table that **does not exist yet**: creating it is the
 * owner's decision, not this file's, and the SQL is written out in
 * `share-store.ts`. Until it is created, `install` finds nothing and the
 * sharing button stays off, which is the correct behaviour rather than an
 * error to work around.
 *
 * Nothing readable passes through here. By the time a payload reaches this
 * file it is ciphertext whose key never left the browser that made it.
 */

import { sardSupabase, usingOwnBackend } from './sard-supabase';
import { setShareStore, type ShareStore, type StoredReport } from './share-store';

const TABLE = 'shared_reports';

interface Row {
  id: string;
  payload: string;
  expires_at: string;
}

export function supabaseShareStore(): ShareStore {
  return {
    async put(record: StoredReport) {
      const { error } = await sardSupabase.from(TABLE).insert({
        id: record.id,
        payload: record.payload,
        expires_at: new Date(record.expiresAt).toISOString(),
      });
      if (error) throw error;
    },

    async get(id: string) {
      const { data, error } = await sardSupabase
        .from(TABLE)
        .select('id,payload,expires_at')
        .eq('id', id)
        .maybeSingle<Row>();
      // A missing row and a failed query both mean «no report to show», and
      // the page says exactly that either way rather than distinguishing a
      // bad link from a bad night for the network.
      if (error || !data) return null;
      return {
        id: data.id,
        payload: data.payload,
        expiresAt: new Date(data.expires_at).getTime(),
      };
    },
  };
}

/**
 * Whether sharing can work at all right now.
 *
 * Two things have to be true: a backend is configured, and the table exists.
 * The second is checked by asking for nothing — `limit(0)` — which costs a
 * round trip and tells us whether the relation is there without reading a
 * single row of anybody's data.
 */
export async function shareBackendReady(): Promise<boolean> {
  if (!usingOwnBackend) return false;
  const { error } = await sardSupabase.from(TABLE).select('id').limit(0);
  return !error;
}

/**
 * Installs the real store when there is one to install.
 *
 * Returns whether it did, so the interface can offer the share button only
 * where pressing it would actually produce a working link.
 */
export async function installShareStore(): Promise<boolean> {
  if (!await shareBackendReady()) return false;
  setShareStore(supabaseShareStore());
  return true;
}
