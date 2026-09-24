-- A fourth kind of note: the wrong vowel.
--
-- Asked for by a reciter. A ḥaraka read as another is the classical «laḥn
-- jaliyy» — it can change what a word means — and until now a teacher had to
-- file it under memory or under tajweed, both of which it is not.
--
-- A column of its own, like the other three, rather than folded into
-- `notes_tajweed`: every report and review plan already written counts tajweed
-- slips, and giving that column a second meaning would silently change what
-- all of them say.
--
-- Ships together with the build that writes it. A device running that build
-- against a database without this column has its uploads refused; the majlis
-- stays on the device and is retried once the column exists. Nothing is lost,
-- but nothing arrives either.

ALTER TABLE public.recitation_sessions
  ADD COLUMN IF NOT EXISTS notes_shakl INTEGER NOT NULL DEFAULT 0;
