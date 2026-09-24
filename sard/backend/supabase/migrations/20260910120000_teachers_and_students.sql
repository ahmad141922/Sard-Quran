-- The muqri' signs in; the students do not.
--
-- Until now every device wrote its own sessions and nobody could read anything
-- back except an admin, through an edge function on the service role. That was
-- the right posture for a tool with no accounts. It cannot express the thing
-- asked for now — «my students, their recitations, their mistakes» — because
-- there was no «my».
--
-- ## Why students are not accounts
--
-- Most reciters here are children. Requiring each of them to hold an email
-- address, a password and a recovery route would exclude exactly the people the
-- tool is for, and would put us in charge of children's credentials. So a
-- student is a row on a teacher's roster, and a student's *device* attaches
-- itself by redeeming a short-lived code the teacher reads out. The device
-- authenticates anonymously — it gets an identity without anybody handing over
-- a name, an email or a password.
--
-- ## Why the read rules stay closed by default
--
-- The anon key ships inside the bundle. Every policy below is written so that
-- holding that key grants nothing: reading is allowed only to a signed-in
-- teacher, and only for rows that are already theirs. The original table's
-- «no select for anyone» is therefore relaxed to «no select unless you own it»,
-- which is a narrowing of who can read, not a widening.

-- ---------------------------------------------------------------- teachers --

CREATE TABLE IF NOT EXISTS public.sard_teachers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sard_teachers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.sard_teachers TO authenticated;
GRANT ALL ON public.sard_teachers TO service_role;

CREATE POLICY "teacher_reads_self" ON public.sard_teachers
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "teacher_creates_self" ON public.sard_teachers
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "teacher_updates_self" ON public.sard_teachers
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------- students --

CREATE TABLE IF NOT EXISTS public.sard_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.sard_teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- The code the teacher reads out. Short because it is spoken aloud in a
  -- halaqa, and short-lived for the same reason: it is overheard.
  join_code TEXT UNIQUE,
  join_expires_at TIMESTAMPTZ,
  -- The device that redeemed it. One student, one device: a second redemption
  -- replaces the first rather than adding, so a lost phone is recovered by
  -- issuing a new code and not by an administrator.
  device_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_teacher
  ON public.sard_students(teacher_id, archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_device
  ON public.sard_students(device_uid);

ALTER TABLE public.sard_students ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sard_students TO authenticated;
GRANT ALL ON public.sard_students TO service_role;

CREATE POLICY "teacher_manages_own_students" ON public.sard_students
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- A joined device may read the one row that is its own, so it can show whose
-- roster it is on. It may read no other student, and it may not write.
CREATE POLICY "device_reads_own_enrolment" ON public.sard_students
  FOR SELECT TO authenticated USING (device_uid = auth.uid());

-- Redeeming a code is deliberately NOT a policy: it would have to let a device
-- read rows it does not yet own in order to find the code. It goes through
-- `sard_redeem_join_code` below, which runs as the definer and returns only
-- the row it just claimed.
CREATE OR REPLACE FUNCTION public.sard_redeem_join_code(code TEXT)
RETURNS TABLE (student_id UUID, student_name TEXT, teacher_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE found public.sard_students%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'a device must have an identity before it can join';
  END IF;

  SELECT * INTO found FROM public.sard_students s
   WHERE s.join_code = upper(btrim(code))
     AND s.archived = false
     AND (s.join_expires_at IS NULL OR s.join_expires_at > now())
   LIMIT 1;

  IF NOT FOUND THEN
    -- One message for «no such code» and for «expired» alike: telling them
    -- apart turns this into an oracle for guessing live codes.
    RAISE EXCEPTION 'that code is not usable';
  END IF;

  UPDATE public.sard_students
     SET device_uid = auth.uid(),
         joined_at = now(),
         -- Spent on use. A code that keeps working is a code that keeps being
         -- overheard.
         join_code = NULL,
         join_expires_at = NULL
   WHERE id = found.id;

  RETURN QUERY SELECT found.id, found.name, found.teacher_id;
END; $$;

REVOKE ALL ON FUNCTION public.sard_redeem_join_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sard_redeem_join_code(TEXT) TO authenticated;

-- ---------------------------------------------------------------- sessions --

ALTER TABLE public.recitation_sessions
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.sard_teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.sard_students(id) ON DELETE SET NULL,
  -- Who pushed it, so a device can see and correct its own.
  ADD COLUMN IF NOT EXISTS device_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- What the person agreed to when it went up, stamped on the row itself.
  -- Kept here and not only on the device because this is the copy that would
  -- have to answer for itself if anybody ever asked.
  ADD COLUMN IF NOT EXISTS consent JSONB,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rec_teacher_id
  ON public.recitation_sessions(teacher_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_student_id
  ON public.recitation_sessions(student_id, started_at DESC);

-- The original table refused every select, to anybody. That refusal is now
-- narrowed rather than lifted: a signed-in teacher may read the sessions of
-- their own students, and a device may read what it pushed. Holding the anon
-- key still reads nothing.
DROP POLICY IF EXISTS "rec_no_public_read" ON public.recitation_sessions;

CREATE POLICY "rec_no_anon_read" ON public.recitation_sessions
  FOR SELECT TO anon USING (false);

CREATE POLICY "teacher_reads_own_students_sessions" ON public.recitation_sessions
  FOR SELECT TO authenticated USING (
    teacher_id = auth.uid()
    OR student_id IN (SELECT id FROM public.sard_students WHERE teacher_id = auth.uid())
    OR device_uid = auth.uid()
  );

-- ------------------------------------------------------------------- audio --

-- Private, always. Nothing here is ever readable without a signed URL, and the
-- bucket is not public even to a signed-in teacher except through the policies
-- below.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recitation-audio', 'recitation-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Objects are laid out as `<student_id>/<session_id>/<clip>.webm`, so ownership
-- is decidable from the first path segment alone.
CREATE POLICY "device_writes_own_audio" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'recitation-audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.sard_students WHERE device_uid = auth.uid()
    )
  );

CREATE POLICY "teacher_reads_own_students_audio" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'recitation-audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.sard_students WHERE teacher_id = auth.uid()
    )
  );

-- A reciter may take their own recordings back down. The teacher may not delete
-- them from here: a recording removed from under a report would leave the report
-- claiming something it can no longer show.
CREATE POLICY "device_deletes_own_audio" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'recitation-audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.sard_students WHERE device_uid = auth.uid()
    )
  );

-- ------------------------------------------------------------ attribution --

-- Whose recitation a session is, decided here and not by whoever sends it.
--
-- Once a teacher can read their students' sessions by `student_id`, the insert
-- policy's `WITH CHECK (true)` becomes a way to put words in somebody's mouth:
-- any device could push a row naming another teacher's student, and it would
-- appear in that teacher's list as if the student had recited it. So the device
-- is allowed to say *which student* and nothing else, and this trigger:
--
--   * takes the device from whoever is signed in, ignoring any value sent;
--   * refuses a student the caller is neither the teacher of nor the device of;
--   * derives the teacher from the roster rather than trusting a column.
--
-- Invoker rights, not definer: the caller's own row policies already hide every
-- student that is not theirs, so a forged id simply is not found. The check
-- does not need privileges the caller does not have, so it is not given any.
CREATE OR REPLACE FUNCTION public.sard_attribute_session()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE owner public.sard_students%ROWTYPE;
BEGIN
  NEW.device_uid := auth.uid();

  IF NEW.student_id IS NULL THEN
    NEW.teacher_id := NULL;
    RETURN NEW;
  END IF;

  -- An anonymous push predates rosters; it can belong to nobody in particular.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'a session can only be attributed by a signed-in device';
  END IF;

  SELECT * INTO owner FROM public.sard_students WHERE id = NEW.student_id;
  IF NOT FOUND
     OR (owner.teacher_id <> auth.uid() AND owner.device_uid IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'this device may not record for that student';
  END IF;

  NEW.teacher_id := owner.teacher_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_attribute_session ON public.recitation_sessions;
CREATE TRIGGER trg_attribute_session
  BEFORE INSERT OR UPDATE ON public.recitation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.sard_attribute_session();

-- Updates narrowed the same way. The original «update any row» was harmless
-- while no row was readable or attributable; now a row with an owner may only
-- be rewritten by the device that pushed it. Rows pushed before any of this —
-- no device, no student — stay updatable, so an old build retrying a majlis it
-- sent last month still can.
DROP POLICY IF EXISTS "rec_update_any" ON public.recitation_sessions;
CREATE POLICY "rec_update_own_or_legacy" ON public.recitation_sessions
  FOR UPDATE TO anon, authenticated
  USING (device_uid = auth.uid() OR (device_uid IS NULL AND student_id IS NULL))
  -- The trigger validates what the row becomes; this only decides who may try.
  WITH CHECK (true);
