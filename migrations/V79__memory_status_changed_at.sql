-- When the status last changed — the timestamp for confirmations.
--
-- Deliberately NOT updated_at. That column means "last write to the content"
-- and is the recency anchor in calculateRankingScore. Two existing writers do
-- touch it on a pure state change (markSuperseded and the soft delete), but
-- both make the row invisible in the same statement: deleted_at IS NULL and
-- superseded_by IS NULL are gates in the search WHERE clause. So for every row
-- that can still be retrieved, updated_at really is the last content write.
--
-- A confirmation is the first state change that leaves the row visible. Routing
-- it through updated_at would hand it the full recency bonus for a click that
-- changed no content — and it would be indistinguishable from a rewrite. If
-- confirmed entries should rank higher, that belongs in the ranking config as
-- its own dial, not smuggled in through the anchor.
--
-- NULL means the status was never changed after creation. No backfill: every
-- existing row still carries the status V76 gave it.

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'vector'
       AND c.relkind = 'r'
       AND EXISTS (
             SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'namespace' AND a.attnum > 0
           )
  LOOP
    EXECUTE format(
      'ALTER TABLE vector.%I
         ADD COLUMN IF NOT EXISTS status_changed_at timestamptz', tbl);
  END LOOP;
END $$;

COMMENT ON COLUMN vector.documents.status_changed_at IS
  'When status last changed. NULL means never changed since creation. Not a write to the content — updated_at stays the recency anchor.';
