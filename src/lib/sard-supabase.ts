import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The recitation tool's own backend.
 *
 * Separate from `@/integrations/supabase/client` — which is the board's — for
 * one reason: `recitation_sessions` holds children's names and the WhatsApp
 * number of whoever ran the majlis. The board's project carries twenty edge
 * functions and a schema this repo does not even hold the history of; a
 * mistake in any of them should not be able to reach this table.
 *
 * `VITE_SARD_SUPABASE_URL` / `VITE_SARD_SUPABASE_ANON_KEY` name that project.
 * With them unset the tool falls back to the board's project, which is what
 * every session before the split used — so an old build and a half-configured
 * one both keep working rather than throwing at import time.
 *
 * Untyped on purpose: the generated `Database` type comes from the board's
 * schema and has never known this table. Typing the two calls we make by hand
 * is honest; casting them through a type that describes another database is
 * not.
 */

const url = import.meta.env.VITE_SARD_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SARD_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Whether the tool is talking to its own project or the board's. */
export const usingOwnBackend = Boolean(import.meta.env.VITE_SARD_SUPABASE_URL);

export const sardSupabase: SupabaseClient = createClient(url, key, {
  auth: {
    storage: typeof window === 'undefined' ? undefined : localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // The board and the tool may share an origin one day, and two clients
    // sharing one storage key would sign each other out.
    storageKey: 'sard-auth',
  },
});

/** The edge function that reads sessions back; the table denies every select. */
export const SARD_ADMIN_FUNCTION = 'sard-admin';
