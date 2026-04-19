-- Row Level Security (RLS) für Chains und Tasks
BEGIN;

-- 1. owner_id zu Chains hinzufügen
ALTER TABLE app.chains ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL;

-- Bestehende Chains einem Admin zuordnen (erster gefundener Admin oder NULL)
UPDATE app.chains 
   SET owner_id = (SELECT id FROM app.users WHERE role = 'admin' LIMIT 1)
 WHERE owner_id IS NULL;

-- 2. owner_id zu Tasks hinzufügen (optional, da aktuell Admin-only, aber für RLS sinnvoll)
ALTER TABLE app.tasks ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL;

UPDATE app.tasks 
   SET owner_id = (SELECT id FROM app.users WHERE role = 'admin' LIMIT 1)
 WHERE owner_id IS NULL;

-- 3. RLS Aktivieren
ALTER TABLE app.chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.chain_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tasks ENABLE ROW LEVEL SECURITY;

-- 4. Policies für CHAINS
-- Besitzer dürfen alles, Nutzer sehen Chains ihrer Agenten oder public/eigene
DROP POLICY IF EXISTS chains_isolation_policy ON app.chains;
CREATE POLICY chains_isolation_policy ON app.chains
  USING (
    owner_id = app.current_user_id() 
    OR app.is_admin()
    OR EXISTS (
      SELECT 1 FROM app.agents a
       WHERE a.id = app.chains.agent_id
         AND (
           a.owner_id = app.current_user_id()
           OR a.visibility = 'public'
           OR EXISTS (
             SELECT 1 FROM app.agent_permissions ap
              WHERE ap.agent_id = a.id
                AND (
                  (ap.principal_type = 'user' AND ap.principal_id::uuid = app.current_user_id())
                  OR (ap.principal_type = 'role' AND ap.principal_id = 'all_users')
                )
           )
         )
    )
  );

-- 5. Policies für CHAIN_VERSIONS (folgen der Chain)
DROP POLICY IF EXISTS chain_versions_isolation_policy ON app.chain_versions;
CREATE POLICY chain_versions_isolation_policy ON app.chain_versions
  USING (
    EXISTS (SELECT 1 FROM app.chains c WHERE c.id = app.chain_versions.chain_id) -- RLS auf chains filtert hier automatisch
    OR app.is_admin()
  );

-- 6. Policies für TASKS
-- Jeder darf Tasks LESEN (sofern sie im System sind), aber nur Admins/Besitzer verwalten
DROP POLICY IF EXISTS tasks_read_policy ON app.tasks;
CREATE POLICY tasks_read_policy ON app.tasks
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS tasks_modify_policy ON app.tasks;
CREATE POLICY tasks_modify_policy ON app.tasks
  FOR ALL
  USING (app.is_admin() OR owner_id = app.current_user_id());

COMMIT;
