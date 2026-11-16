BEGIN;

-- Chains und ihre Versionen schreibt nur noch ein Admin.
--
-- Bisher galt eine einzige Regel für Lesen und Schreiben: Wer eine Chain sehen
-- durfte (eigene, oder die eines öffentlichen bzw. freigegebenen Agenten),
-- durfte sie auch ändern, löschen und ihr eine Version unterschieben. Eine
-- Chain gehört aber zur Einrichtung eines Agenten, und Agenten wie Tasks
-- verwaltet nur der Admin. Die Routen prüfen das inzwischen selbst; diese
-- Regeln halten die Grenze auch dort, wo eine Route es einmal vergisst.
--
-- Lesen bleibt unverändert: Wer eine Chain sieht, kann sie auflisten und
-- ausführen.

DROP POLICY IF EXISTS chains_isolation_policy ON app.chains;
DROP POLICY IF EXISTS chains_read_policy ON app.chains;
DROP POLICY IF EXISTS chains_admin_write_policy ON app.chains;

CREATE POLICY chains_read_policy ON app.chains
  FOR SELECT
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

CREATE POLICY chains_admin_write_policy ON app.chains
  FOR ALL
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

DROP POLICY IF EXISTS chain_versions_isolation_policy ON app.chain_versions;
DROP POLICY IF EXISTS chain_versions_read_policy ON app.chain_versions;
DROP POLICY IF EXISTS chain_versions_admin_write_policy ON app.chain_versions;

-- Eine Version ist lesbar, wenn ihre Chain lesbar ist (die Regel auf
-- app.chains filtert die Unterabfrage).
CREATE POLICY chain_versions_read_policy ON app.chain_versions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM app.chains c WHERE c.id = app.chain_versions.chain_id)
    OR app.is_admin()
  );

CREATE POLICY chain_versions_admin_write_policy ON app.chain_versions
  FOR ALL
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

COMMIT;
