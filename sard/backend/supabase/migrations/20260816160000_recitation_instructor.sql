-- The muqri' (المقرئ) — the teacher who listens and certifies — is a different
-- person from the reciter (القارئ) already stored in student_name.
--
-- Written as a separate, idempotent migration rather than an edit to
-- 20260816140000 because that one may already have been pushed.

ALTER TABLE public.recitation_sessions
  ADD COLUMN IF NOT EXISTS instructor_name TEXT;

CREATE INDEX IF NOT EXISTS idx_rec_instructor
  ON public.recitation_sessions(instructor_name, started_at DESC);
