-- Fix: Projects are personal data — admins must not see other users' projects.
BEGIN;

DROP POLICY IF EXISTS projects_isolation_policy ON app.projects;
CREATE POLICY projects_isolation_policy ON app.projects
  USING (user_id = app.current_user_id());

COMMIT;
