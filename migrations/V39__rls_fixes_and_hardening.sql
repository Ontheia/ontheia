-- RLS Fixes, Hardening (FORCE RLS) und Sessions
BEGIN;

-- 1. Hilfsfunktionen für RLS (SECURITY DEFINER um Rekursion zu vermeiden)

-- Prüft ob der aktuelle User Admin ist
CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean AS $$
DECLARE
    is_admin_val boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM app.users 
         WHERE id = app.current_user_id() 
           AND role = 'admin'
    ) INTO is_admin_val;
    RETURN COALESCE(is_admin_val, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Prüft ob der User Besitzer eines Agenten ist
CREATE OR REPLACE FUNCTION app.is_agent_owner(target_agent_id uuid, user_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM app.agents WHERE id = target_agent_id AND owner_id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Prüft allgemeinen Agent-Zugriff (Besitz, Public oder explizite Permission)
CREATE OR REPLACE FUNCTION app.has_agent_access(target_agent_id uuid, user_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM app.agents 
         WHERE id = target_agent_id 
           AND (owner_id = user_id OR visibility = 'public')
    ) OR EXISTS (
        SELECT 1 FROM app.agent_permissions 
         WHERE agent_id = target_agent_id 
           AND (
             (principal_type = 'user' AND principal_id::uuid = user_id)
             OR (principal_type = 'role' AND principal_id = 'all_users')
           )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- 2. FORCE RLS für alle relevanten Tabellen aktivieren
-- Dies stellt sicher, dass RLS auch greift, wenn der DB-User der Tabellenbesitzer ist.

ALTER TABLE app.users FORCE ROW LEVEL SECURITY;
ALTER TABLE app.agents FORCE ROW LEVEL SECURITY;
ALTER TABLE app.agent_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.chats FORCE ROW LEVEL SECURITY;
ALTER TABLE app.chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE app.run_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE app.user_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE app.chains FORCE ROW LEVEL SECURITY;
ALTER TABLE app.chain_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.tasks FORCE ROW LEVEL SECURITY;

ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE vector.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE vector.documents_768 FORCE ROW LEVEL SECURITY;


-- 3. Policies aktualisieren / neu definieren

-- USERS: Jeder sieht nur sich selbst, Admins sehen alle
DROP POLICY IF EXISTS users_isolation_policy ON app.users;
CREATE POLICY users_isolation_policy ON app.users
  USING (id = app.current_user_id() OR app.is_admin());

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
           OR (ap.principal_type = 'role' AND principal_id = 'all_users')
         )
    )
  );

-- AGENT_PERMISSIONS: Nur Agent-Besitzer oder Admins (Rekursion durch Hilfsfunktion vermieden)
DROP POLICY IF EXISTS agent_permissions_isolation_policy ON app.agent_permissions;
CREATE POLICY agent_permissions_isolation_policy ON app.agent_permissions
  USING (
    app.is_admin() 
    OR (principal_type = 'user' AND principal_id::uuid = app.current_user_id())
    OR app.is_agent_owner(agent_id, app.current_user_id())
  );

-- SESSIONS: Nur eigene Sessions oder Admin
DROP POLICY IF EXISTS sessions_isolation_policy ON app.sessions;
CREATE POLICY sessions_isolation_policy ON app.sessions
  USING (user_id = app.current_user_id() OR app.is_admin());

COMMIT;
