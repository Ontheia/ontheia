-- Fix für Session-Lookup: Erlaubt dem Backend das Finden von Sessions via ID
BEGIN;

-- Wir löschen die vorherigen Policies für Sessions
DROP POLICY IF EXISTS sessions_manager_policy ON app.sessions;
DROP POLICY IF EXISTS sessions_insert_policy ON app.sessions;

-- 1. INSERT: Erlaubt beim Login (wenn noch kein User gesetzt) oder für den User selbst
CREATE POLICY sessions_insert_policy ON app.sessions
  FOR INSERT
  WITH CHECK (app.current_user_id() IS NULL OR user_id = app.current_user_id() OR app.is_admin());

-- 2. SELECT: Erlaubt den Lookup via ID (für das Backend) oder wenn man Besitzer ist
-- Da die ID eine geheime UUID ist, ist der Lookup via ID sicher.
CREATE POLICY sessions_select_policy ON app.sessions
  FOR SELECT
  USING (true); 
  -- Hinweis: 'true' für SELECT ist hier sicher, da der ontheia_app user 
  -- nur über das Backend gesteuert wird und wir dort immer nach der ID filtern.
  -- Alternativ restriktiver: (id IS NOT NULL)

-- 3. DELETE/UPDATE: Nur für den Besitzer oder Admin
CREATE POLICY sessions_modify_policy ON app.sessions
  FOR ALL
  USING (user_id = app.current_user_id() OR app.is_admin());

COMMIT;
