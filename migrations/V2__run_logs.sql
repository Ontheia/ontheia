BEGIN;

CREATE TABLE IF NOT EXISTS app.run_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL,
    agent_id text NOT NULL,
    task_id text NOT NULL,
    input jsonb NOT NULL,
    events jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS run_logs_run_id_idx ON app.run_logs(run_id);
CREATE INDEX IF NOT EXISTS run_logs_agent_task_idx ON app.run_logs(agent_id, task_id);

COMMIT;
