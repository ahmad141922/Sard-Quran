// The only way to read a majlis back out.
//
// `recitation_sessions` has no select policy at all — the rows carry children's
// names and WhatsApp numbers, and the anon key is published inside the app
// bundle, so any select policy there would publish them to the world. Reading
// happens here, on the service role, after this function has checked who is
// asking.
//
// Two actions and nothing else. The board's `admin-data` runs to 553 lines
// across subscribers, notifications, shared boards, trials and credits; none of
// that belongs in the blast radius of a table of children's names.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const ADMIN_EMAIL = Deno.env.get('SARD_ADMIN_EMAIL');

    const body = await req.json().catch(() => ({}));

    // ── PUBLIC: does this certificate correspond to a real majlis? ──
    //
    // Anyone can hand-craft the link a QR square carries, so the page that
    // opens it cannot call itself verified on the strength of its own
    // fragment. This is the one honest answer available: an id either names a
    // session this tool recorded, or it does not.
    //
    // It answers with a boolean and nothing else. The id is only ever known to
    // whoever holds the certificate, and even they learn nothing new from a
    // yes — no name, no number, no row.
    if (body.action === 'verify_certificate') {
      const id = String(body.id || '');
      if (!id) return json({ verified: false });
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data, error } = await admin
        .from('recitation_sessions')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return json({ verified: Boolean(data) });
    }

    // Fails closed. An unset secret is a misconfiguration, and the safe reading
    // of a misconfiguration on a table like this one is "nobody".
    if (!ADMIN_EMAIL) {
      return json({ error: 'not_configured', hint: 'set SARD_ADMIN_EMAIL' }, 503);
    }

    // Who is asking: the caller's own JWT, verified by Supabase itself rather
    // than trusted from the body.
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const asCaller = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: caller, error: callerErr } = await asCaller.auth.getUser();
    if (callerErr || !caller.user) return json({ error: 'unauthorized' }, 401);
    if (caller.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return json({ error: 'forbidden' }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    switch (body.action) {
      case 'list_recitation_sessions': {
        const limit = Math.min(Number(body.limit) || 500, 2000);
        const { data, error } = await admin
          .from('recitation_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return json({ sessions: data });
      }

      case 'delete_recitation_session': {
        const id = String(body.id || '');
        if (!id) return json({ error: 'id required' }, 400);
        const { error } = await admin.from('recitation_sessions').delete().eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
