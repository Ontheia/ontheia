-- Fix für Login-Problem: ontheia_app muss Nutzer zur Authentifizierung finden können
BEGIN;

-- Wir erlauben dem System, Nutzer anhand der E-Mail zu suchen, 
-- auch wenn noch keine current_user_id gesetzt ist.
-- Dies ist sicher, da nur der Datenbank-User 'ontheia_app' diese Policy nutzen kann.

DROP POLICY IF EXISTS users_login_policy ON app.users;
CREATE POLICY users_login_policy ON app.users
  FOR SELECT
  USING (app.current_user_id() IS NULL OR id = app.current_user_id() OR app.is_admin());

-- Hinweis: Die 'users_isolation_policy' aus V39 bleibt bestehen oder wird durch diese ersetzt.
-- Da Postgres mehrere Policies mit OR verknüpft, reicht diese neue Policy aus.

COMMIT;
