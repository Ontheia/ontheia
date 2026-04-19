BEGIN;

CREATE TABLE IF NOT EXISTS app.memory_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid,
    agent_id uuid,
    task_id uuid,
    namespace text,
    action text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_audit_run_idx ON app.memory_audit (run_id);
CREATE INDEX IF NOT EXISTS memory_audit_agent_idx ON app.memory_audit (agent_id);
CREATE INDEX IF NOT EXISTS memory_audit_action_idx ON app.memory_audit (action);

COMMIT;
