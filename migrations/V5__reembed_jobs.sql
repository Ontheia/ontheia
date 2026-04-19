-- Re-Embed Job Queue
BEGIN;

CREATE TABLE IF NOT EXISTS app.reembed_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace text NOT NULL,
    embedding_model text NOT NULL,
    chunk_id uuid,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
    attempts integer NOT NULL DEFAULT 0,
    error text,
    payload jsonb DEFAULT '{}'::jsonb,
    scheduled_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reembed_jobs_status_available_idx
  ON app.reembed_jobs (status, available_at)
  WHERE status IN ('pending','failed');

CREATE INDEX IF NOT EXISTS reembed_jobs_namespace_idx
  ON app.reembed_jobs (namespace);

COMMIT;
