-- Removes vector.documents_384.
--
-- Ontheia has two embedding paths: OpenAI at 1536 dimensions and a local
-- Ollama model at 768. A 384-dimension table sat between them without a
-- purpose — and without a migration either: it existed on one host because
-- someone created it by hand, so every installation had a different idea of
-- how many document tables there are.
--
-- The drop is conditional on the table being empty. A host that did put data
-- there keeps it, and the mismatch stays visible instead of costing rows; the
-- code no longer assumes a fixed set of tables either way (MemoryAdapter
-- .tableNames), so an extra table is tolerated, just not created by us.

DO $$
DECLARE
  has_rows boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'vector' AND c.relname = 'documents_384' AND c.relkind = 'r'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT EXISTS (SELECT 1 FROM vector.documents_384)' INTO has_rows;

  IF has_rows THEN
    RAISE NOTICE 'vector.documents_384 still holds rows and is kept. Move or delete them, then drop it by hand.';
  ELSE
    DROP TABLE vector.documents_384;
    RAISE NOTICE 'Dropped the empty vector.documents_384.';
  END IF;
END $$;
