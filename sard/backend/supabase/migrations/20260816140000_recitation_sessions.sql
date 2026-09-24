-- Recitation sessions (مجلس السرد) pushed from the teacher's device.
--
-- The rows carry students' names, and most students are children. So this
-- follows the tightened shared_boards posture rather than the permissive
-- user_ai_content one: devices may write their own sessions, but there is NO
-- select policy at all. Reading goes through the admin-data edge function on
-- the service role, which already gates on the admin JWT.

CREATE TABLE public.recitation_sessions (
  -- The client's own session id, so a retry after a failed push upserts
  -- rather than duplicating.
  id TEXT NOT NULL PRIMARY KEY,
  teacher_email TEXT,
  student_name TEXT NOT NULL,
  mushaf TEXT NOT NULL DEFAULT 'madinah',
  goal_kind TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_ms BIGINT NOT NULL DEFAULT 0,
  paused_ms BIGINT NOT NULL DEFAULT 0,
  ayahs INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  full_juz INTEGER NOT NULL DEFAULT 0,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  notes_hesitation INTEGER NOT NULL DEFAULT 0,
  notes_memory INTEGER NOT NULL DEFAULT 0,
  notes_tajweed INTEGER NOT NULL DEFAULT 0,
  khatmah BOOLEAN NOT NULL DEFAULT false,
  weakest_surahs TEXT,
  -- The whole session object, so the admin can re-render the identical report
  -- sheet the teacher saw rather than an approximation of it.
  session JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rec_started ON public.recitation_sessions(started_at DESC);
CREATE INDEX idx_rec_student ON public.recitation_sessions(student_name, started_at DESC);
CREATE INDEX idx_rec_teacher ON public.recitation_sessions(teacher_email, started_at DESC);

GRANT INSERT, UPDATE ON public.recitation_sessions TO anon, authenticated;
GRANT ALL ON public.recitation_sessions TO service_role;

ALTER TABLE public.recitation_sessions ENABLE ROW LEVEL SECURITY;

-- Devices may push their sessions…
CREATE POLICY "rec_insert_any" ON public.recitation_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "rec_update_any" ON public.recitation_sessions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
-- …and read nothing back. Deliberate: the anon key is in the shipped bundle,
-- so any select policy here would publish every student's name.
CREATE POLICY "rec_no_public_read" ON public.recitation_sessions
  FOR SELECT TO anon, authenticated USING (false);

CREATE OR REPLACE FUNCTION public.touch_recitation_sessions()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_recitation BEFORE UPDATE ON public.recitation_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_recitation_sessions();
