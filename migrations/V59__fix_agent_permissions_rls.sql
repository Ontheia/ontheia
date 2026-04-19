-- Fix circular RLS dependency between app.agents and app.agent_permissions.
--
-- Problem:
--   agents_isolation_policy uses EXISTS(SELECT FROM agent_permissions ...)
--   agent_permissions_isolation_policy uses EXISTS(SELECT FROM agents ...)
--   → circular reference → PostgreSQL infinite recursion → grants never evaluated
--
-- Effect of the bug:
--   Private agents with explicit user grants were invisible to the granted user
--   because the agent_permissions subquery always returned 0 rows (blocked by RLS).
--
-- Fix:
--   Rewrite agent_permissions_isolation_policy to NOT reference app.agents.
--   Use created_by instead (always set to session.userId = agent owner on insert).
--   Additionally allow users to read their own grants and role-based grants,
--   so the subquery in agents_isolation_policy can find them.

DROP POLICY IF EXISTS agent_permissions_isolation_policy ON app.agent_permissions;

CREATE POLICY agent_permissions_isolation_policy ON app.agent_permissions
  USING (
    -- Agent owner: created_by is set to the owner's user_id on insert
    created_by = app.current_user_id()
    -- Admins see everything
    OR app.is_admin()
    -- Users can read their own explicit grants (needed for agents_isolation_policy subquery)
    OR (principal_type = 'user' AND principal_id::uuid = app.current_user_id())
    -- Role-based grants are readable by everyone (e.g. 'all_users')
    OR principal_type = 'role'
  );
