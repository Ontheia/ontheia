-- Stage 1 of the memory contract: lifecycle and classification fields.
--
--   updated_at     when the row was last written (the new recency anchor)
--   observed_at    when the fact was observed, as opposed to recorded
--   superseded_by  the entry that replaced this one
--   status         unconfirmed | confirmed | superseded
--   class          episodic | semantic | procedural | working | document
--
-- Applied to every table in the vector schema that holds documents, because
-- there is one per embedding dimension and their number is not fixed.
-- superseded_by deliberately has NO foreign key: a re-embedding run can move a
-- namespace into a different dimension table, and a foreign key cannot span
-- them. The edge is maintained in code instead (see cleanupDuplicates and
-- cleanupExpired in host/src/memory/adapter.ts).

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
         ADD COLUMN IF NOT EXISTS updated_at    timestamptz,
         ADD COLUMN IF NOT EXISTS observed_at   timestamptz,
         ADD COLUMN IF NOT EXISTS superseded_by uuid,
         ADD COLUMN IF NOT EXISTS status        text,
         ADD COLUMN IF NOT EXISTS class         text', tbl);

    -- For existing rows the creation time is the only defensible statement
    -- about when they were last written.
    EXECUTE format(
      'UPDATE vector.%I SET updated_at = created_at WHERE updated_at IS NULL', tbl);
    EXECUTE format(
      'ALTER TABLE vector.%I
         ALTER COLUMN updated_at SET DEFAULT now(),
         ALTER COLUMN updated_at SET NOT NULL', tbl);

    -- Provenance cannot be reconstructed after the fact, so every existing row
    -- starts as unconfirmed. The rule applies from here on.
    EXECUTE format(
      'UPDATE vector.%I SET status = ''unconfirmed'' WHERE status IS NULL', tbl);
    EXECUTE format(
      'ALTER TABLE vector.%I
         ALTER COLUMN status SET DEFAULT ''unconfirmed'',
         ALTER COLUMN status SET NOT NULL', tbl);

    -- class stays NULL where no rule matches: an unclassified row is honest,
    -- a guessed one is not.
    EXECUTE format('ALTER TABLE vector.%I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_status_chk');
    EXECUTE format(
      'ALTER TABLE vector.%I ADD CONSTRAINT %I
         CHECK (status IN (''unconfirmed'', ''confirmed'', ''superseded''))',
      tbl, tbl || '_status_chk');

    EXECUTE format('ALTER TABLE vector.%I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_class_chk');
    EXECUTE format(
      'ALTER TABLE vector.%I ADD CONSTRAINT %I
         CHECK (class IS NULL OR class IN (''episodic'', ''semantic'', ''procedural'', ''working'', ''document''))',
      tbl, tbl || '_class_chk');

    -- The search gate: not deleted, not superseded.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON vector.%I (namespace)
         WHERE deleted_at IS NULL AND superseded_by IS NULL',
      tbl || '_active_idx', tbl);
    -- Reverse lookup: which entries point at this one.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON vector.%I (superseded_by)
         WHERE superseded_by IS NOT NULL',
      tbl || '_superseded_by_idx', tbl);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON vector.%I (class) WHERE class IS NOT NULL',
      tbl || '_class_idx', tbl);
  END LOOP;
END $$;

COMMENT ON COLUMN vector.documents.updated_at IS
  'Last write. Recency anchor for ranking; created_at is now the true creation time.';
COMMENT ON COLUMN vector.documents.observed_at IS
  'When the fact was observed, if known. NULL means unknown — readers fall back to created_at.';
COMMENT ON COLUMN vector.documents.superseded_by IS
  'Id of the entry that replaced this one. No FK by design; may point into another dimension table.';
COMMENT ON COLUMN vector.documents.status IS
  'Maturity of the statement: unconfirmed | confirmed | superseded.';
COMMENT ON COLUMN vector.documents.class IS
  'Memory class. Defaults from app.vector_namespace_rules.memory_class, overridable per row.';

-- The namespace rules gain the class mapping. They already carry the ranking
-- bonus and the instruction template for the same patterns, and the four rules
-- shipped today already correspond to the four memory classes.
ALTER TABLE app.vector_namespace_rules
  ADD COLUMN IF NOT EXISTS memory_class text;

ALTER TABLE app.vector_namespace_rules
  DROP CONSTRAINT IF EXISTS vector_namespace_rules_memory_class_chk;
ALTER TABLE app.vector_namespace_rules
  ADD CONSTRAINT vector_namespace_rules_memory_class_chk
  CHECK (memory_class IS NULL OR memory_class IN ('episodic', 'semantic', 'procedural', 'working', 'document'));

COMMENT ON COLUMN app.vector_namespace_rules.memory_class IS
  'Default memory class for entries written to a matching namespace. NULL leaves the class unset.';
