-- Removes the rows written while proving why nothing was reaching this table.
--
-- The push used an upsert, which Postgres refuses for a role with no SELECT
-- policy — the conflict path has to read the existing row, and the published
-- key may read nothing here. Finding that took two probe inserts; they carry
-- no real majlis and would only sit in the admin table looking like data.
--
-- Idempotent: nothing matches on a database that never saw them.

DELETE FROM public.recitation_sessions
 WHERE id LIKE 'rs_probe%';
