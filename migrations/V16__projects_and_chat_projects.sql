BEGIN;

CREATE TABLE IF NOT EXISTS app.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    parent_id uuid REFERENCES app.projects(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_parent_idx ON app.projects(parent_id);

ALTER TABLE app.run_logs
    ADD COLUMN IF NOT EXISTS project_id text;

CREATE INDEX IF NOT EXISTS run_logs_project_idx ON app.run_logs(project_id);

COMMIT;
