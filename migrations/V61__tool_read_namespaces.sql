-- V61: Extend memory policy with tool_read_namespaces and auto_read_enabled.
-- Both fields live in the existing JSONB columns (app.agent_config.memory,
-- app.tasks.memory). No schema change required; handled at application level.
-- Default behaviour: auto_read_enabled = true (fully backwards-compatible).
DO $$ BEGIN
  RAISE NOTICE 'V61: tool_read_namespaces and auto_read_enabled active (JSONB, no schema change).';
END $$;
