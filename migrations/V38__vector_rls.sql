-- RLS für das vector Schema
BEGIN;

-- 1. Spalten hinzufügen
ALTER TABLE vector.documents ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL;
ALTER TABLE vector.documents_768 ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_owner_id_idx ON vector.documents(owner_id);
CREATE INDEX IF NOT EXISTS documents_768_owner_id_idx ON vector.documents_768(owner_id);

-- 2. Backfill owner_id
-- Priorität: metadata->'user_id' > regex aus namespace
UPDATE vector.documents
   SET owner_id = COALESCE(
       (NULLIF(metadata->>'user_id', ''))::uuid,
       (regexp_match(namespace, 'vector\.user\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))[1]::uuid
   )
 WHERE owner_id IS NULL;

UPDATE vector.documents_768
   SET owner_id = COALESCE(
       (NULLIF(metadata->>'user_id', ''))::uuid,
       (regexp_match(namespace, 'vector\.user\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))[1]::uuid
   )
 WHERE owner_id IS NULL;

-- 3. Trigger für automatische owner_id beim Insert
CREATE OR REPLACE FUNCTION vector.set_owner_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := app.current_user_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_owner_id ON vector.documents;
CREATE TRIGGER trg_set_owner_id
  BEFORE INSERT ON vector.documents
  FOR EACH ROW EXECUTE FUNCTION vector.set_owner_id();

DROP TRIGGER IF EXISTS trg_set_owner_id ON vector.documents_768;
CREATE TRIGGER trg_set_owner_id
  BEFORE INSERT ON vector.documents_768
  FOR EACH ROW EXECUTE FUNCTION vector.set_owner_id();

-- 4. RLS Aktivieren
ALTER TABLE vector.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector.documents_768 ENABLE ROW LEVEL SECURITY;

-- 5. Policies definieren
DROP POLICY IF EXISTS documents_isolation_policy ON vector.documents;
CREATE POLICY documents_isolation_policy ON vector.documents
  USING (owner_id = app.current_user_id() OR app.is_admin());

DROP POLICY IF EXISTS documents_768_isolation_policy ON vector.documents_768;
CREATE POLICY documents_768_isolation_policy ON vector.documents_768
  USING (owner_id = app.current_user_id() OR app.is_admin());

COMMIT;
