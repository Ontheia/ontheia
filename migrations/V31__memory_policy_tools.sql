-- Erweiterung der Memory-Policy um Schreib-/Lösch-Tools für LLMs
BEGIN;

-- Defaults für Agents in app.agent_config
UPDATE app.agent_config
   SET memory = memory || '{"allow_tool_write": false, "allow_tool_delete": false, "allowed_write_namespaces": []}'::jsonb
 WHERE memory IS NOT NULL;

-- Defaults für Tasks in app.tasks
UPDATE app.tasks
   SET memory = memory || '{"allow_tool_write": false, "allow_tool_delete": false, "allowed_write_namespaces": []}'::jsonb
 WHERE memory IS NOT NULL;

COMMIT;
