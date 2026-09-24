-- Which muṣḥaf a majlis was recited from, and in whose numbering.
--
-- Until now a session stored bare ayah numbers, which was unambiguous only
-- while there was one edition. Warsh numbers 6214 verses where Hafs numbers
-- 6236 — al-Kahf ends at 105 in one and 110 in the other — so a number with no
-- edition beside it names no particular verse.
--
-- `surah`/`ayah` are the position the majlis reached **in `ayah_counting`**,
-- exactly as the teacher saw it. `canonical_anchor` is the same place in one
-- declared scheme, carried so that sessions recited in different riwayat can be
-- compared; it is interoperability, not the identity of the verse, and reports
-- never print it.
--
-- Separate, idempotent migration rather than an edit to 20260816140000, which
-- may already have been pushed.

ALTER TABLE public.recitation_sessions
  ADD COLUMN IF NOT EXISTS mushaf_id TEXT,
  ADD COLUMN IF NOT EXISTS riwaya_id TEXT,
  ADD COLUMN IF NOT EXISTS ayah_counting TEXT,
  ADD COLUMN IF NOT EXISTS surah INTEGER,
  ADD COLUMN IF NOT EXISTS ayah INTEGER,
  ADD COLUMN IF NOT EXISTS canonical_anchor JSONB;

-- Rows written before the position model are all the Madinah Hafs muṣḥaf in the
-- Kufan count: no other edition existed to record. Backfilled as fact, not
-- guess; the anchor is left null because nothing derived it at the time.
UPDATE public.recitation_sessions
   SET mushaf_id = COALESCE(mushaf_id, 'hafs-kfqc'),
       riwaya_id = COALESCE(riwaya_id, 'hafs'),
       ayah_counting = COALESCE(ayah_counting, 'kufi')
 WHERE mushaf_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_rec_riwaya
  ON public.recitation_sessions(riwaya_id, started_at DESC);
