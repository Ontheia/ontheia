-- V51: Cron Automation, Enhancements and Maintenance Permissions
BEGIN;

-- 1. Create cron_jobs table with all features
CREATE TABLE IF NOT EXISTS app.cron_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    chat_title_template text NOT NULL DEFAULT 'Auto-Run: {{name}} [{{timestamp}}]',
    schedule text NOT NULL,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    task_id uuid REFERENCES app.tasks(id) ON DELETE SET NULL,
    chain_id uuid REFERENCES app.chains(id) ON DELETE SET NULL,
    prompt_template_id uuid REFERENCES app.prompt_templates(id) ON DELETE SET NULL,
    active boolean NOT NULL DEFAULT true,
    prevent_overlap boolean NOT NULL DEFAULT true,
    last_run_at timestamptz,
    next_run_at timestamptz,
    last_error text,
    created_at timestamptz DEFAULT now()
);

-- 2. Enhance run_logs for cron tracking
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='run_logs' AND column_name='cron_job_id') THEN
        ALTER TABLE app.run_logs ADD COLUMN cron_job_id uuid REFERENCES app.cron_jobs(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS run_logs_cron_job_idx ON app.run_logs(cron_job_id);

-- 3. RLS and Policies
ALTER TABLE app.cron_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_jobs_user_policy ON app.cron_jobs;
CREATE POLICY cron_jobs_user_policy ON app.cron_jobs
    FOR ALL
    TO ontheia_app
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS cron_jobs_admin_policy ON app.cron_jobs;
CREATE POLICY cron_jobs_admin_policy ON app.cron_jobs
    FOR ALL
    TO ontheia_app
    USING (current_setting('app.user_role', true) = 'admin');

-- 4. Vector Maintenance Permissions
ALTER TABLE vector.documents OWNER TO ontheia_app;
ALTER TABLE vector.documents_768 OWNER TO ontheia_app;

-- 5. Chat Message Integrity
-- Ensure we can upsert agent messages based on run_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_unique_agent_run') THEN
        ALTER TABLE app.chat_messages ADD CONSTRAINT chat_messages_unique_agent_run UNIQUE (chat_id, run_id);
    END IF;
END $$;

COMMIT;
