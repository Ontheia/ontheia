-- Fix für Session-Erstellung: Erlaubt dem System das Anlegen von Sessions beim Login
BEGIN;

-- Wir verfeinern die Session-Policy:
-- 1. SELECT/UPDATE/DELETE: Bleibt strikt (nur eigene oder Admin)
-- 2. INSERT: Erlaubt, wenn noch keine User-ID gesetzt ist (Login-Vorgang)

DROP POLICY IF EXISTS sessions_isolation_policy ON app.sessions;

-- Policy für das Lesen und Verwalten bestehender Sessions
CREATE POLICY sessions_manager_policy ON app.sessions
  FOR ALL
  USING (user_id = app.current_user_id() OR app.is_admin());

-- Spezielle Policy für das Erstellen neuer Sessions (INSERT)
CREATE POLICY sessions_insert_policy ON app.sessions
  FOR INSERT
  WITH CHECK (app.current_user_id() IS NULL OR user_id = app.current_user_id() OR app.is_admin());

COMMIT;
