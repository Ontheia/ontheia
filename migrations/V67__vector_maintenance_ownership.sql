-- Vector maintenance (VACUUM/REINDEX) is triggered from the admin console and
-- executed by the application role. In PostgreSQL 16 both commands require
-- table ownership, so all tables in the vector schema are transferred to
-- ontheia_app. This does not weaken row level security: FORCE ROW LEVEL
-- SECURITY is (re-)asserted for every table, so RLS policies keep applying to
-- the owner as well.
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'vector'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO ontheia_app', tbl.schemaname, tbl.tablename);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', tbl.schemaname, tbl.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', tbl.schemaname, tbl.tablename);
  END LOOP;
END $$;
