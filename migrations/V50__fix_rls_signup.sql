-- RLS Policy für Signup: Erlaubt das Einfügen neuer Benutzer
BEGIN;

-- Die Policy erlaubt das Einfügen (INSERT) neuer Benutzerrecords.
-- Dies ist notwendig für:
-- 1. Den öffentlichen Signup-Prozess (app.current_user_id IS NULL)
-- 2. Die administrative Benutzerverwaltung (app.is_admin() IS TRUE)

DROP POLICY IF EXISTS users_signup_policy ON app.users;
CREATE POLICY users_signup_policy ON app.users
  FOR INSERT
  WITH CHECK (app.current_user_id() IS NULL OR app.is_admin());

COMMIT;
