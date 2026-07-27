-- Records which entries an automatically written one was derived from.
--
-- After a run, Ontheia stores the agent's answer as `run_output`. When that
-- answer quotes something the memory search supplied, the quote becomes an
-- independent, searchable entry with its own id — and deleting the original
-- leaves it untouched. The copy then outlives what it copied, inside the very
-- store the deletion was meant to clear.
--
-- The column holds the ids of the hits that went into the run, so a deletion
-- can follow them. It is an array rather than metadata because deleting has to
-- ask "which rows point at this one", which is a WHERE clause, not a payload.

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
    EXECUTE format('ALTER TABLE vector.%I ADD COLUMN IF NOT EXISTS derived_from uuid[]', tbl);

    -- GIN, because the question is always "does this array contain that id".
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON vector.%I USING gin (derived_from)
         WHERE derived_from IS NOT NULL',
      tbl || '_derived_from_idx', tbl);
  END LOOP;
END $$;

COMMENT ON COLUMN vector.documents.derived_from IS
  'Ids of the entries this one was derived from. Deleting an entry soft-deletes what came out of it.';
