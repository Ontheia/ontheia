-- Row Level Security (RLS) Policies
BEGIN;

-- 1. Run Logs um user_id Spalte erweitern für effizientes RLS
ALTER TABLE app.run_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS run_logs_user_id_idx ON app.run_logs(user_id);

-- Migration bestehender user_id Daten aus JSONB
UPDATE app.run_logs 
   SET user_id = (input->'options'->'metadata'->>'user_id')::uuid 
 WHERE user_id IS NULL 
   AND input->'options'->'metadata'->>'user_id' IS NOT NULL;

-- Trigger für automatische user_id beim Insert falls über current_setting verfügbar
CREATE OR REPLACE FUNCTION app.set_run_logs_user_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := app.current_user_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_run_logs_user_id ON app.run_logs;
CREATE TRIGGER trg_set_run_logs_user_id
  BEFORE INSERT ON app.run_logs
  FOR EACH ROW EXECUTE FUNCTION app.set_run_logs_user_id();

-- 2. Hilfsfunktionen für RLS
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.users 
     WHERE id = app.current_user_id() 
       AND role = 'admin'
  );
$$ LANGUAGE sql STABLE;

-- 3. RLS Aktivieren
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.run_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Policies definieren

-- USERS: Jeder sieht nur sich selbst, Admins sehen alle
DROP POLICY IF EXISTS users_isolation_policy ON app.users;
CREATE POLICY users_isolation_policy ON app.users
  USING (id = app.current_user_id() OR app.is_admin());

-- USER_SETTINGS: Nur Besitzer
DROP POLICY IF EXISTS user_settings_isolation_policy ON app.user_settings;
CREATE POLICY user_settings_isolation_policy ON app.user_settings
  USING (user_id = app.current_user_id() OR app.is_admin());

-- AGENTS: Besitzer, explizite Permission oder public
DROP POLICY IF EXISTS agents_isolation_policy ON app.agents;
CREATE POLICY agents_isolation_policy ON app.agents
  USING (
    owner_id = app.current_user_id() 
    OR visibility = 'public' 
    OR app.is_admin()
    OR EXISTS (
      SELECT 1 FROM app.agent_permissions ap
       WHERE ap.agent_id = app.agents.id
         AND (
           (ap.principal_type = 'user' AND ap.principal_id::uuid = app.current_user_id())
           OR (ap.principal_type = 'role' AND ap.principal_id = 'all_users')
         )
    )
  );

-- AGENT_PERMISSIONS: Nur Agent-Besitzer oder Admins
DROP POLICY IF EXISTS agent_permissions_isolation_policy ON app.agent_permissions;
CREATE POLICY agent_permissions_isolation_policy ON app.agent_permissions
  USING (
    EXISTS (SELECT 1 FROM app.agents a WHERE a.id = app.agent_permissions.agent_id AND a.owner_id = app.current_user_id())
    OR app.is_admin()
  );

-- PROJECTS: Nur Besitzer
DROP POLICY IF EXISTS projects_isolation_policy ON app.projects;
CREATE POLICY projects_isolation_policy ON app.projects
  USING (user_id = app.current_user_id() OR app.is_admin());

-- CHATS: Nur Besitzer
DROP POLICY IF EXISTS chats_isolation_policy ON app.chats;
CREATE POLICY chats_isolation_policy ON app.chats
  USING (user_id = app.current_user_id() OR app.is_admin());

-- CHAT_MESSAGES: Über Chat-Verknüpfung
DROP POLICY IF EXISTS chat_messages_isolation_policy ON app.chat_messages;
CREATE POLICY chat_messages_isolation_policy ON app.chat_messages
  USING (
    EXISTS (SELECT 1 FROM app.chats c WHERE c.id = app.chat_messages.chat_id AND c.user_id = app.current_user_id())
    OR app.is_admin()
  );

-- RUN_LOGS: Nur Besitzer
DROP POLICY IF EXISTS run_logs_isolation_policy ON app.run_logs;
CREATE POLICY run_logs_isolation_policy ON app.run_logs
  USING (user_id = app.current_user_id() OR app.is_admin());

COMMIT;
